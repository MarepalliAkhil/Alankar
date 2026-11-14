"""Marketing emails built on the recommendation system: consent, kinds, approval, limits, batches,
clicks without pixels, results, and who may do what (allowed AND denied)."""

from __future__ import annotations

import io
from datetime import datetime, time, timedelta
from unittest import mock

import pytest
from django.core.management import call_command
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog
from conftest import login
from core.models import MailOutbox
from marketing import campaigns, limits
from marketing.models import Campaign, CampaignRecipient, ConsentRecord
from people.models import Rating
from recommendations import build
from recommendations.models import CustomerPrefs, RebookReminder
from recommendations.tests.conftest import customer_with_profile, visit
from scheduling.models import AppointmentStatus
from website.models import Offer

pytestmark = pytest.mark.django_db
BASE = "/api/admin/marketing/campaigns"
J = "application/json"


def local(hour, minute=0, days=0):
    day = timezone.localdate() + timedelta(days=days)
    return datetime.combine(day, time(hour, minute), tzinfo=timezone.get_current_timezone())


@pytest.fixture
def admin(logged_in):
    return logged_in("admin")


@pytest.fixture
def people(crowd, shop, make_user):
    """Two opted-in customers with history, one opted-in with recommendations off, one not
    opted in at all."""
    keen = customer_with_profile(make_user, "keen@example.com", opted_in=True)
    visit(keen, shop["mani"], 10, shop["meena"])
    visit(keen, shop["cut"], 40, shop["asha"])
    plain = customer_with_profile(make_user, "plain@example.com", opted_in=True)
    visit(plain, shop["cut"], 45, shop["asha"])
    quiet = customer_with_profile(make_user, "private@example.com", opted_in=True)
    visit(quiet, shop["mani"], 12, shop["meena"])
    CustomerPrefs.objects.create(user=quiet, enabled=False)
    customer_with_profile(make_user, "nope@example.com", opted_in=False)
    build.build()
    return {"keen": keen, "plain": plain, "quiet": quiet}


def draft(admin, **over):
    body = {"name": "Picks", "subject": "Picked for you", "body": "Hello from the shop.", **over}
    made = admin[0].post(f"{BASE}/", body, content_type=J)
    assert made.status_code == 201, made.content
    return made.json()


def send(admin, camp):
    return admin[0].post(f"{BASE}/{camp['id']}/send/")


# --------------------------------------------------------------------------- consent


def test_registration_box_is_unticked_and_records_version_and_source(client):
    base = {
        "full_name": "New Person",
        "phone": "9876543210",
        "password": "Strong-Pass-123!x",
        "consent": True,
    }
    client.post("/api/auth/register/", {**base, "email": "a@example.com"}, content_type=J)
    assert not ConsentRecord.objects.exists()
    client.post(
        "/api/auth/register/",
        {**base, "email": "b@example.com", "marketing_opt_in": True},
        content_type=J,
    )
    (record,) = ConsentRecord.objects.all()
    assert record.opted_in and record.source == "register" and record.version == "2026-11"
    assert record.created_at is not None


def test_profile_switch_and_both_unsubscribe_links_record_withdrawals(people):
    keen = people["keen"]
    token = campaigns.unsubscribe_token(keen)
    one_click = Client().post(
        f"/api/public/unsubscribe/?token={token}",
        "List-Unsubscribe=One-Click",
        content_type="application/x-www-form-urlencoded",
    )
    assert one_click.status_code == 200
    keen.customer_profile.refresh_from_db()
    assert keen.customer_profile.marketing_opt_in is False
    assert ConsentRecord.objects.get(user=keen).source == "one_click"
    client = Client()
    login(client, people["plain"])
    client.patch("/api/my/profile/", {"marketing_opt_in": False}, content_type=J)
    assert ConsentRecord.objects.get(user=people["plain"]).source == "profile"
    page = Client().post(
        "/api/public/unsubscribe/",
        {"token": campaigns.unsubscribe_token(people["quiet"])},
        content_type=J,
    )
    assert page.status_code == 200
    assert ConsentRecord.objects.get(user=people["quiet"]).source == "unsubscribe"
    with pytest.raises(ValueError):
        record = ConsentRecord.objects.first()
        record.opted_in = True
        record.save()


# --------------------------------------------------------------------------- the kinds


def test_for_you_email_has_reasons_html_text_click_links_and_one_click_header(admin, people):
    camp = draft(admin, kind="for_you")
    assert camp["would_reach"] == 2  # not the customer who switched recommendations off
    sent = send(admin, camp)
    assert sent.status_code == 200, sent.content
    assert sent.json()["status"] == "sent"
    mail = MailOutbox.objects.get(to_email="keen@example.com", kind="marketing")
    assert "Often booked together with Mani" in mail.body
    assert "/api/public/c/" in mail.body and "Unsubscribe with one click" in mail.body
    assert "<html" in mail.html and "Often booked together with Mani" in mail.html
    assert "<img" not in mail.html  # no tracking pixels
    assert mail.headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert "/api/public/unsubscribe/?token=" in mail.headers["List-Unsubscribe"]
    assert not MailOutbox.objects.filter(to_email="private@example.com").exists()
    entry = AuditLog.objects.get(action="campaign_approved")
    assert entry.metadata["kind"] == "for_you"
    assert Campaign.objects.get().approved_by == admin[1]


def test_products_and_most_booked_emails(admin, people, shop):
    from inventory.models import Product

    oil = Product.objects.create(sku="OIL", name="Cuticle oil", category="Nails", unit_price=250)
    shop["nails"].recommended_products.add(oil)
    send(admin, draft(admin, kind="products", name="Care"))
    assert "Cuticle oil" in MailOutbox.objects.get(to_email="keen@example.com").body
    MailOutbox.objects.all().delete()
    send(admin, draft(admin, kind="most_booked", name="Top"))
    body = MailOutbox.objects.filter(kind="marketing").first().body
    assert "Booked 10 times in the last 90 days" in body


def test_highest_rated_needs_five_ratings_and_offers_need_a_real_offer(admin, people, shop):
    camp = draft(admin, kind="top_rated")
    assert "5 or more ratings" in camp["problem"]
    refused = send(admin, camp)
    assert refused.status_code == 400 and not MailOutbox.objects.exists()
    for i in range(5):
        appt = visit(people["plain"], shop["colour"], 30 + i, shop["ravi"])
        Rating.objects.create(
            appointment=appt,
            customer=people["plain"],
            stylist=shop["ravi"],
            status=Rating.Status.SUBMITTED,
            stars=5,
        )
    build.build()
    assert send(admin, camp).status_code == 200
    assert "Rated 5.0 out of 5 by 5 guests" in MailOutbox.objects.first().body
    offers = draft(admin, kind="offers", name="Offers")
    assert "no active offers" in offers["problem"]
    Offer.objects.create(title="Monsoon glow", description="10% off facials.")
    assert send(admin, offers).status_code == 200


def test_rebook_email_has_real_times_and_is_sent_once_per_cycle(admin, people):
    camp = draft(admin, kind="rebook")
    send(admin, camp)
    mail = MailOutbox.objects.get(to_email="plain@example.com")
    assert "Time" in mail.subject or "Picked" in mail.subject
    assert "about every" in mail.body and "Free times with Asha" in mail.body
    assert RebookReminder.objects.get(user=people["plain"]).emailed is True
    MailOutbox.objects.all().delete()
    send(admin, draft(admin, kind="rebook", name="Again"))
    assert not MailOutbox.objects.filter(to_email="plain@example.com").exists()
    row = CampaignRecipient.objects.filter(user=people["plain"]).order_by("-sent_at").last()
    assert (
        "already reminded"
        in CampaignRecipient.objects.filter(user=people["plain"], status="skipped").get().reason
    )
    assert row is not None


# --------------------------------------------------------------------------- preview and test


def test_preview_sends_nothing_and_test_goes_only_to_the_admin(admin, people):
    camp = draft(admin, kind="for_you")
    preview = admin[0].get(f"{BASE}/{camp['id']}/preview/").json()
    assert preview["customer"] and "Often booked together" in preview["text"]
    assert preview["html"].startswith("<!doctype html>")
    assert not MailOutbox.objects.exists()
    chosen = admin[0].get(f"{BASE}/{camp['id']}/preview/", {"customer": people["keen"].pk})
    assert chosen.json()["customer"]["id"] == str(people["keen"].pk)
    outsider = admin[0].get(f"{BASE}/{camp['id']}/preview/", {"customer": people["quiet"].pk})
    assert outsider.status_code == 400
    tested = admin[0].post(f"{BASE}/{camp['id']}/test/")
    assert tested.status_code == 200
    (mail,) = MailOutbox.objects.all()
    assert mail.to_email == admin[1].email and mail.subject.startswith("[Test]")
    assert Campaign.objects.get().status == "draft"
    assert AuditLog.objects.filter(action="campaign_test_sent").count() == 1


# --------------------------------------------------------------------------- limits


def test_quiet_hours_hold_sending_until_nine(admin, people, settings):
    settings.SALON_MARKETING_QUIET_HOURS = (21, 9)
    camp = draft(admin, kind="custom")
    with mock.patch("django.utils.timezone.now", return_value=local(22, 30)):
        sent = send(admin, camp)
        assert sent.json()["status"] == "sending"
    assert not MailOutbox.objects.filter(kind="marketing").exists()
    with mock.patch("django.utils.timezone.now", return_value=local(8, 59, days=1)):
        assert campaigns.send_all()["emails"] == 0
    with mock.patch("django.utils.timezone.now", return_value=local(9, 5, days=1)):
        assert campaigns.send_all()["emails"] == 3
    assert Campaign.objects.get().status == "sent"
    late = draft(admin, name="Late")
    refused = admin[0].post(
        f"{BASE}/{late['id']}/schedule/",
        {"send_at": local(23, 0, days=1).isoformat()},
        content_type=J,
    )
    assert refused.status_code == 400 and "21:00" in refused.json()["detail"]
    assert limits.in_quiet_hours(local(21)) and not limits.in_quiet_hours(local(20, 59))
    assert limits.quiet_ends(local(23)) == local(9, days=1)


def test_one_marketing_email_per_customer_per_week(admin, people, settings):
    settings.SALON_MARKETING_MIN_DAYS = 7
    send(admin, draft(admin))
    assert MailOutbox.objects.filter(kind="marketing").count() == 3
    second = send(admin, draft(admin, name="Again"))
    assert second.json()["results"]["sent"] == 0
    reasons = second.json()["results"]["skipped_reasons"]
    assert reasons == [{"reason": "already emailed in the last 7 days", "count": 3}]
    assert MailOutbox.objects.filter(kind="marketing").count() == 3


# --------------------------------------------------------------------------- batches


def test_batches_are_idempotent_and_the_command_continues(admin, people, monkeypatch):
    monkeypatch.setattr(campaigns, "BATCH", 1)
    camp = draft(admin)
    with mock.patch.object(campaigns, "process", return_value=0):
        send(admin, camp)
    assert Campaign.objects.get().status == "sending"
    assert campaigns.process(camp["id"], batches=1) == 1
    call_command("send_campaigns", "--batches", "1", stdout=io.StringIO())
    call_command("send_campaigns", stdout=io.StringIO())
    call_command("send_campaigns", stdout=io.StringIO())
    assert MailOutbox.objects.filter(kind="marketing").count() == 3
    assert Campaign.objects.get().status == "sent" and Campaign.objects.get().recipient_count == 3
    assert send(admin, camp).status_code == 400  # never twice


def test_withdrawn_consent_before_the_batch_is_respected(admin, people):
    camp = draft(admin)
    with mock.patch.object(campaigns, "process", return_value=0):
        send(admin, camp)
    profile = people["plain"].customer_profile
    profile.marketing_opt_in = False
    profile.save()
    campaigns.send_all()
    assert not MailOutbox.objects.filter(to_email="plain@example.com").exists()
    assert (
        CampaignRecipient.objects.get(user=people["plain"]).reason == "unsubscribed before sending"
    )


# --------------------------------------------------------------------------- results


def test_clicks_are_counted_without_pixels_and_bookings_within_seven_days(admin, people, shop):
    camp = draft(admin, kind="for_you")
    send(admin, camp)
    row = CampaignRecipient.objects.get(user=people["keen"])
    click = Client().get(f"/api/public/c/{row.pk}/", {"to": "/customer/book?service=pedi"})
    assert click.status_code == 302 and click["Location"].endswith("/customer/book?service=pedi")
    Client().get(f"/api/public/c/{row.pk}/", {"to": "/"})
    row.refresh_from_db()
    assert row.clicks == 2 and row.clicked_at is not None
    evil = Client().get(f"/api/public/c/{row.pk}/", {"to": "https://evil.example.com/"})
    assert evil["Location"].endswith("/") and "evil" not in evil["Location"]
    unknown = Client().get("/api/public/c/00000000-0000-0000-0000-000000000000/", {"to": "/"})
    assert unknown.status_code == 302
    visit(people["keen"], shop["pedi"], -2, shop["meena"], status=AppointmentStatus.REQUESTED)
    results = admin[0].get(f"{BASE}/").json()["results"][0]["results"]
    assert results["sent"] == 2 and results["clicked"] == 1 and results["booked"] == 1


# --------------------------------------------------------------------------- who may do what


@pytest.mark.parametrize("role", ["customer", "receptionist", "stylist"])
def test_other_roles_cannot_preview_or_test(logged_in, role, admin, people):
    camp = draft(admin)
    client, _ = logged_in(role)
    assert client.get(f"{BASE}/{camp['id']}/preview/").status_code == 403
    assert client.post(f"{BASE}/{camp['id']}/test/").status_code == 403
    assert not MailOutbox.objects.exists()


def test_guests_cannot_preview_or_test(admin, people):
    camp = draft(admin)
    assert Client().get(f"{BASE}/{camp['id']}/preview/").status_code in (401, 403)
    assert Client().post(f"{BASE}/{camp['id']}/test/").status_code in (401, 403)
