"""Task 2c: invoices, the mandatory stylist rating, and the booking block while one is pending."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.management import CommandError, call_command
from django.test import Client
from django.utils import timezone

from billing import checkout
from billing.models import Invoice, InvoiceError, InvoiceItem, Payment
from conftest import login
from core.models import MailOutbox
from people import ratings
from people.models import CustomerProfile, Rating
from scheduling.models import Appointment, AppointmentStatus
from scheduling.tests.test_booking import (  # noqa: F401  (shared fixtures and helpers)
    awaiting,
    catalogue,
    customer,
    day_at,
    desk,
    pay,
    payment_token,
    request_body,
    requested,
    send_request,
)
from website.models import SiteContent

S = AppointmentStatus


def scheduled(client, desk_client, cat, hour=11, days=3, stylist="asha") -> str:
    """A paid, scheduled appointment, ready to be billed."""
    appt_id = awaiting(client, desk_client, cat, hour=hour, days=days, stylist=stylist)
    assert pay(client, appt_id, link=payment_token(appt_id)).status_code == 200
    return appt_id


def post(client, path, data=None):
    return client.post(path, data or {}, content_type="application/json")


@pytest.fixture
def visit(catalogue, customer, desk):
    """A billed visit: (customer client, user, appointment id, invoice)."""
    client, user = customer
    appt_id = scheduled(client, desk[0], catalogue)
    invoice = checkout.complete_and_invoice(appt_id)
    return client, user, appt_id, invoice


# --------------------------------------------------------------------------- billing


def test_billing_completes_the_visit_and_writes_the_invoice(visit):
    _, user, appt_id, invoice = visit
    appt = Appointment.objects.get(pk=appt_id)
    assert appt.status == S.COMPLETED
    assert [e.action for e in appt.events.all()][-3:] == ["checked_in", "started", "completed"]
    assert invoice.number == f"INV-{timezone.now().year}-00001"
    assert (invoice.total, invoice.prepaid_amount, invoice.balance_paid) == (
        Decimal("300.00"),
        Decimal("300.00"),
        Decimal("0.00"),
    )
    assert invoice.subtotal + invoice.gst_amount == invoice.total
    assert invoice.customer == user and invoice.status == "paid"
    item = invoice.items.get()
    assert "Haircut" in item.description and item.amount == Decimal("300.00")
    assert not Payment.objects.filter(kind="checkout").exists()  # prepaid in full
    rating = Rating.objects.get(appointment_id=appt_id)
    assert rating.status == "pending" and rating.stylist.display_name == "Asha"
    mail = MailOutbox.objects.filter(kind="invoice").get()
    assert invoice.number in mail.subject and "rate your stylist" in mail.body


def test_a_part_prepayment_leaves_a_balance_paid_at_the_salon(catalogue, customer, desk):
    SiteContent.objects.create(key="booking", value={"deposit_percent": 50})
    client, _ = customer
    appt_id = scheduled(client, desk[0], catalogue)
    invoice = checkout.complete_and_invoice(appt_id, method="upi")
    assert invoice.prepaid_amount == Decimal("150.00")
    assert invoice.balance_paid == Decimal("150.00")
    counter = Payment.objects.get(kind="checkout")
    assert counter.amount == Decimal("150.00") and counter.method == "upi"
    assert counter.reference.startswith("UPI-")


def test_invoice_numbers_count_up_without_repeating(catalogue, customer, desk):
    client, _ = customer
    # Book both visits first: a billed, unrated visit blocks new booking requests.
    one = scheduled(client, desk[0], catalogue, hour=11)
    two = scheduled(client, desk[0], catalogue, hour=14)
    first = checkout.complete_and_invoice(one)
    second = checkout.complete_and_invoice(two)
    assert first.number.endswith("00001") and second.number.endswith("00002")


def test_only_a_scheduled_visit_with_a_stylist_can_be_billed(catalogue, customer, desk):
    client, _ = customer
    request_id = requested(client, catalogue)
    with pytest.raises(checkout.CheckoutError):
        checkout.complete_and_invoice(request_id)  # still only a request
    appt_id = scheduled(client, desk[0], catalogue, hour=15)
    checkout.complete_and_invoice(appt_id)
    with pytest.raises(checkout.CheckoutError):
        checkout.complete_and_invoice(appt_id)  # already billed
    assert Invoice.objects.count() == 1


def test_a_paid_invoice_cannot_be_changed_or_deleted(visit):
    *_, invoice = visit
    invoice.total = Decimal("1.00")
    with pytest.raises(InvoiceError):
        invoice.save()
    with pytest.raises(InvoiceError):
        invoice.delete()
    item = InvoiceItem.objects.get(invoice=invoice)
    item.amount = Decimal("1.00")
    with pytest.raises(InvoiceError):
        item.save()
    with pytest.raises(InvoiceError):
        item.delete()
    invoice.refresh_from_db()
    assert invoice.total == Decimal("300.00")


# --------------------------------------------------------------------------- invoices API


def test_customer_sees_only_their_own_invoices(visit, make_user):
    client, _, _, invoice = visit
    listing = client.get("/api/my/invoices/")
    assert listing.status_code == 200
    rows = listing.json()
    assert [r["number"] for r in rows] == [invoice.number]
    detail = client.get(f"/api/my/invoices/{invoice.id}/").json()
    assert detail["items"][0]["description"].startswith("Haircut")
    assert detail["stylist_name"] == "Asha"
    assert "customer_email" not in detail  # only what the customer needs

    other = make_user(email="other@example.com")
    stranger = Client()
    assert login(stranger, other).status_code == 200
    assert stranger.get("/api/my/invoices/").json() == []
    assert stranger.get(f"/api/my/invoices/{invoice.id}/").status_code == 404


@pytest.mark.parametrize("role", ["receptionist", "stylist", "admin"])
def test_staff_cannot_use_the_customer_invoice_or_rating_api(visit, logged_in, role):
    _, _, _, invoice = visit
    rating = Rating.objects.get()
    staff, _ = logged_in(role)
    assert staff.get("/api/my/invoices/").status_code == 403
    assert staff.get(f"/api/my/invoices/{invoice.id}/").status_code == 403
    assert staff.get("/api/my/ratings/pending/").status_code == 403
    assert post(staff, f"/api/my/ratings/{rating.id}/", {"stars": 5}).status_code == 403


def test_guests_get_nothing():
    guest = Client()
    assert guest.get("/api/my/invoices/").status_code in (401, 403)
    assert guest.get("/api/my/ratings/pending/").status_code in (401, 403)


# --------------------------------------------------------------------------- ratings


def test_pending_rating_is_listed_for_the_customer(visit):
    client, *_ = visit
    body = client.get("/api/my/ratings/pending/").json()
    assert body["count"] == 1
    card = body["results"][0]
    assert card["stylist_name"] == "Asha" and card["service_name"] == "Haircut"
    assert "Hygiene" in body["tags"]


def test_rating_is_saved_once_and_cannot_change(visit):
    client, *_ = visit
    rating = Rating.objects.get()
    done = post(client, f"/api/my/ratings/{rating.id}/", {"stars": 5, "tags": []})
    assert done.status_code == 200 and done.json()["pending"] == 0
    rating.refresh_from_db()
    assert rating.status == "submitted" and rating.stars == 5 and rating.submitted_at
    again = post(
        client, f"/api/my/ratings/{rating.id}/", {"stars": 1, "comment": "changed my mind"}
    )
    assert again.status_code == 409
    rating.refresh_from_db()
    assert rating.stars == 5
    rating.stars = 2
    with pytest.raises(ValueError):
        rating.save()
    with pytest.raises(ValueError):
        rating.delete()


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"stars": 0},
        {"stars": 6},
        {"stars": "five"},
        {"stars": 1},
        {"stars": 2, "comment": "  "},
        {"stars": 3, "tags": ["Rude"]},
    ],
)
def test_invalid_ratings_are_refused(visit, body):
    client, *_ = visit
    rating = Rating.objects.get()
    assert post(client, f"/api/my/ratings/{rating.id}/", body).status_code == 400
    rating.refresh_from_db()
    assert rating.status == "pending"


def test_low_stars_need_a_comment_and_keep_the_tags(visit):
    client, *_ = visit
    rating = Rating.objects.get()
    response = post(
        client,
        f"/api/my/ratings/{rating.id}/",
        {"stars": 2, "comment": "Started 30 minutes late", "tags": ["Late", "Rushed", "Late"]},
    )
    assert response.status_code == 200
    rating.refresh_from_db()
    assert rating.tags == ["Late", "Rushed"] and rating.comment == "Started 30 minutes late"


def test_nobody_can_rate_someone_elses_visit(visit, make_user):
    rating = Rating.objects.get()
    other = make_user(email="other@example.com")
    stranger = Client()
    assert login(stranger, other).status_code == 200
    response = post(stranger, f"/api/my/ratings/{rating.id}/", {"stars": 5})
    assert response.status_code == 404
    assert stranger.get("/api/my/ratings/pending/").json()["count"] == 0
    rating.refresh_from_db()
    assert rating.status == "pending"


def test_a_visit_that_is_not_billed_has_nothing_to_rate(catalogue, customer, desk):
    client, _ = customer
    scheduled(client, desk[0], catalogue)  # paid, but the visit has not happened yet
    assert client.get("/api/my/ratings/pending/").json()["count"] == 0
    assert Rating.objects.count() == 0


# --------------------------------------------------------------------------- booking block


def test_new_booking_requests_are_refused_until_the_visit_is_rated(visit, catalogue):
    client, *_ = visit
    options = client.get("/api/booking/options/?service=haircut").json()
    assert options["pending_ratings"] == 1

    blocked = send_request(client, catalogue, start=day_at(5, 11).isoformat())
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "ratings_pending"
    assert "rate" in blocked.json()["detail"].lower()
    assert Appointment.objects.filter(status="requested").count() == 0

    rating = Rating.objects.get()
    assert post(client, f"/api/my/ratings/{rating.id}/", {"stars": 4}).status_code == 200
    assert client.get("/api/booking/options/?service=haircut").json()["pending_ratings"] == 0
    allowed = send_request(client, catalogue, start=day_at(5, 11).isoformat())
    assert allowed.status_code == 201


def test_another_customers_pending_rating_does_not_block_me(visit, catalogue, make_user):
    other = make_user(email="other@example.com")
    profile = CustomerProfile(user=other)
    profile.set_phone("9123456780")
    profile.save()
    client = Client()
    assert login(client, other).status_code == 200
    assert send_request(client, catalogue, start=day_at(5, 11).isoformat()).status_code == 201


# --------------------------------------------------------------------------- reminders


def test_a_reminder_goes_out_once_after_24_hours(visit):
    *_, appt_id, _ = visit
    assert ratings.send_due_reminders() == 0  # too early
    Rating.objects.update(created_at=timezone.now() - timedelta(hours=25))
    assert ratings.send_due_reminders() == 1
    assert ratings.send_due_reminders() == 0  # only once
    reminder = MailOutbox.objects.filter(subject__contains="how was your visit").get()
    assert reminder.to_email == "priya@example.com"


def test_no_reminder_for_a_rating_already_given(visit):
    client, *_ = visit
    rating = Rating.objects.get()
    post(client, f"/api/my/ratings/{rating.id}/", {"stars": 5})
    Rating.objects.update(created_at=timezone.now() - timedelta(hours=48))
    assert ratings.send_due_reminders() == 0


def test_reminder_command_runs(visit, capsys):
    call_command("send_rating_reminders")
    assert "0 rating reminder(s) sent" in capsys.readouterr().out


# --------------------------------------------------------------------------- dev command


def test_complete_demo_visit_bills_the_oldest_scheduled_visit(catalogue, customer, desk, settings):
    settings.SALON_DEV_TOOLS = True
    client, _ = customer
    appt_id = scheduled(client, desk[0], catalogue)
    call_command("complete_demo_visit")
    assert Appointment.objects.get(pk=appt_id).status == S.COMPLETED
    assert Invoice.objects.count() == 1 and Rating.objects.filter(status="pending").count() == 1
    with pytest.raises(CommandError):
        call_command("complete_demo_visit")  # nothing left to bill


def test_complete_demo_visit_refuses_to_run_outside_debug_mode(catalogue, customer, desk, settings):
    settings.SALON_DEV_TOOLS = False
    client, _ = customer
    scheduled(client, desk[0], catalogue)
    with pytest.raises(CommandError, match="SALON_DEBUG"):
        call_command("complete_demo_visit")
    assert Invoice.objects.count() == 0
