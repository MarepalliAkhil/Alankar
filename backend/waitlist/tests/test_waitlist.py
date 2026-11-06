"""Task 5e-1: waitlist - offers when a slot frees up, a real 15-minute hold, fair order."""

import threading
from datetime import timedelta

import pytest
from django.db import connection
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog
from conftest import login
from core.models import MailOutbox
from people.models import CustomerProfile
from scheduling.models import Appointment
from scheduling.tests.test_booking import (  # noqa: F401
    awaiting,
    catalogue,
    customer,
    day_at,
    desk,
    pay,
    payment_token,
    request_body,
)
from waitlist import engine
from waitlist.models import WaitlistEntry, WaitlistOffer
from website.models import SiteContent


def json_post(client, url, body=None):
    return client.post(url, body or {}, content_type="application/json")


def second_customer(make_user, name="Second", email="second@example.com"):
    user = make_user(role="customer", full_name=name, email=email)
    profile = CustomerProfile(user=user)
    profile.set_phone("9123456780")
    profile.save()
    c = Client()
    login(c, user)
    return c, user


def join_body(cat, days=3, **extra):
    return {
        "service": str(cat["haircut"].pk),
        "variant": str(cat["short"].pk),
        "window_start": day_at(days, 9).isoformat(),
        "window_end": day_at(days, 17).isoformat(),
        **extra,
    }


@pytest.fixture
def booked(catalogue, customer, desk):
    """Customer A holds a paid 11:00 slot with Asha on day 3."""
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue, hour=11, stylist="asha")
    assert pay(client, appt_id, link=payment_token(appt_id)).status_code == 200
    return appt_id


def test_joining_and_leaving(catalogue, customer):
    client, _ = customer
    r = json_post(client, "/api/my/waitlist/", join_body(catalogue))
    assert r.status_code == 201, r.content
    entry = r.json()
    assert entry["status"] == "waiting"
    assert len(client.get("/api/my/waitlist/").json()) == 1
    left = json_post(client, f"/api/my/waitlist/{entry['id']}/cancel/")
    assert left.status_code == 200 and left.json()["status"] == "cancelled"
    assert AuditLog.objects.filter(action="waitlist_joined").count() == 1
    assert AuditLog.objects.filter(action="waitlist_cancelled").count() == 1


def test_join_rules(catalogue, customer):
    client, _ = customer
    past = join_body(catalogue, days=-2)
    assert json_post(client, "/api/my/waitlist/", past).status_code == 400
    tiny = {
        **join_body(catalogue),
        "window_end": day_at(3, 9, 10).isoformat(),
    }
    assert json_post(client, "/api/my/waitlist/", tiny).status_code == 400
    assert json_post(client, "/api/my/waitlist/", join_body(catalogue)).status_code == 201
    assert json_post(client, "/api/my/waitlist/", join_body(catalogue)).status_code == 400


def test_a_stylist_who_does_not_do_the_service_is_refused(catalogue, customer):
    r = json_post(
        customer[0],
        "/api/my/waitlist/",
        join_body(catalogue, stylist=str(catalogue["meena"].pk)),
    )
    assert r.status_code == 404


def test_a_cancelled_booking_offers_the_slot_to_the_first_in_line(
    booked, catalogue, customer, make_user
):
    b_client, b_user = second_customer(make_user)
    json_post(b_client, "/api/my/waitlist/", join_body(catalogue))
    assert json_post(customer[0], f"/api/my/appointments/{booked}/cancel/").status_code == 200
    offer = WaitlistOffer.objects.get()
    assert offer.entry.customer == b_user and offer.status == "pending"
    assert offer.expires_at - timezone.now() <= timedelta(minutes=15, seconds=5)
    assert MailOutbox.objects.filter(to_email=b_user.email, subject__icontains="opened up").exists()
    assert AuditLog.objects.filter(action="waitlist_offered").count() == 1
    mine = b_client.get("/api/my/waitlist/").json()[0]
    assert mine["status"] == "offered"


def test_the_hold_blocks_other_customers_from_the_slot(
    booked, catalogue, customer, make_user, desk
):
    b_client, _ = second_customer(make_user)
    json_post(b_client, "/api/my/waitlist/", join_body(catalogue))
    json_post(customer[0], f"/api/my/appointments/{booked}/cancel/")
    offer = WaitlistOffer.objects.get()
    from scheduling import booking

    busy = booking.busy_ranges(
        stylist_ids=[offer.stylist_id], room_ids=[], day_from=offer.start, day_to=offer.end
    )
    assert busy, "the held slot must count as busy for everyone else"


def test_accepting_books_the_slot_and_confirms_it(booked, catalogue, customer, make_user):
    b_client, b_user = second_customer(make_user)
    json_post(b_client, "/api/my/waitlist/", join_body(catalogue))
    json_post(customer[0], f"/api/my/appointments/{booked}/cancel/")
    offer = WaitlistOffer.objects.get()
    r = json_post(b_client, f"/api/my/waitlist/offers/{offer.pk}/accept/")
    assert r.status_code == 200, r.content
    offer.refresh_from_db()
    assert offer.status == "accepted" and offer.entry.status == "booked"
    appt = Appointment.objects.get(pk=r.json()["appointment"])
    assert appt.customer == b_user and appt.status == "awaiting_payment"
    assert appt.start == offer.start and appt.stylist_id == offer.stylist_id


def test_declining_passes_the_slot_to_the_next_person(booked, catalogue, customer, make_user):
    b_client, _ = second_customer(make_user)
    c_client, c_user = second_customer(make_user, "Third", "third@example.com")
    json_post(b_client, "/api/my/waitlist/", join_body(catalogue))
    json_post(c_client, "/api/my/waitlist/", join_body(catalogue))
    json_post(customer[0], f"/api/my/appointments/{booked}/cancel/")
    first = WaitlistOffer.objects.get()
    assert json_post(b_client, f"/api/my/waitlist/offers/{first.pk}/decline/").status_code == 200
    second = WaitlistOffer.objects.get(status="pending")
    assert second.entry.customer == c_user
    assert AuditLog.objects.filter(action="waitlist_declined").count() == 1


def test_an_unanswered_offer_expires_and_moves_on(booked, catalogue, customer, make_user):
    b_client, _ = second_customer(make_user)
    c_client, c_user = second_customer(make_user, "Third", "third@example.com")
    json_post(b_client, "/api/my/waitlist/", join_body(catalogue))
    json_post(c_client, "/api/my/waitlist/", join_body(catalogue))
    json_post(customer[0], f"/api/my/appointments/{booked}/cancel/")
    WaitlistOffer.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
    assert engine.expire_offers() == 1
    statuses = sorted(WaitlistOffer.objects.values_list("status", flat=True))
    assert statuses == ["expired", "pending"]
    assert WaitlistOffer.objects.get(status="pending").entry.customer == c_user
    late = WaitlistOffer.objects.get(status="expired")
    r = json_post(b_client, f"/api/my/waitlist/offers/{late.pk}/accept/")
    assert r.status_code in (400, 409)
    assert AuditLog.objects.filter(action="waitlist_offer_expired").count() == 1


def test_with_nobody_left_an_expired_offer_frees_the_slot(booked, catalogue, customer, make_user):
    b_client, _ = second_customer(make_user)
    json_post(b_client, "/api/my/waitlist/", join_body(catalogue))
    json_post(customer[0], f"/api/my/appointments/{booked}/cancel/")
    WaitlistOffer.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
    engine.expire_offers()
    assert not WaitlistOffer.objects.filter(status="pending").exists()
    # the person still wants a slot: they go back to waiting (but are not offered this one twice)
    assert WaitlistEntry.objects.get().status == "waiting"


def test_the_hold_time_comes_from_settings(catalogue, customer):
    SiteContent.objects.update_or_create(
        key="booking", defaults={"value": {"waitlist_offer_minutes": 30}}
    )
    assert engine.offer_minutes() == 30


def test_only_the_offered_customer_can_answer(booked, catalogue, customer, make_user):
    b_client, _ = second_customer(make_user)
    json_post(b_client, "/api/my/waitlist/", join_body(catalogue))
    json_post(customer[0], f"/api/my/appointments/{booked}/cancel/")
    offer = WaitlistOffer.objects.get()
    r = json_post(customer[0], f"/api/my/waitlist/offers/{offer.pk}/accept/")
    assert r.status_code == 404
    assert json_post(customer[0], f"/api/my/waitlist/offers/{offer.pk}/decline/").status_code == 404
    assert WaitlistOffer.objects.get().status == "pending"


def test_customers_see_only_their_own_entries(catalogue, customer, make_user):
    json_post(customer[0], "/api/my/waitlist/", join_body(catalogue))
    other_client, _ = second_customer(make_user)
    assert other_client.get("/api/my/waitlist/").json() == []
    entry = WaitlistEntry.objects.get()
    assert json_post(other_client, f"/api/my/waitlist/{entry.pk}/cancel/").status_code == 404


@pytest.mark.parametrize("role", ["stylist", "receptionist", "admin"])
def test_staff_cannot_use_the_customer_waitlist(logged_in, catalogue, role):
    c = logged_in(role)[0]
    assert c.get("/api/my/waitlist/").status_code == 403
    assert json_post(c, "/api/my/waitlist/", join_body(catalogue)).status_code == 403


def test_guests_cannot_use_the_waitlist(client, catalogue):
    assert client.get("/api/my/waitlist/").status_code in (401, 403)


def test_admin_sees_the_whole_waitlist_and_can_cancel_an_entry(catalogue, customer, logged_in):
    json_post(customer[0], "/api/my/waitlist/", join_body(catalogue))
    admin_client = logged_in("admin")[0]
    rows = admin_client.get("/api/admin/waitlist/").json()
    rows = rows["results"] if isinstance(rows, dict) else rows
    assert len(rows) == 1
    entry = WaitlistEntry.objects.get()
    r = json_post(admin_client, f"/api/admin/waitlist/{entry.pk}/cancel/", {"reason": "duplicate"})
    assert r.status_code == 200
    assert WaitlistEntry.objects.get().status == "cancelled"


@pytest.mark.django_db(transaction=True)
def test_two_simultaneous_accepts_book_the_slot_only_once(booked, catalogue, customer, make_user):
    b_client, b_user = second_customer(make_user)
    json_post(b_client, "/api/my/waitlist/", join_body(catalogue))
    json_post(customer[0], f"/api/my/appointments/{booked}/cancel/")
    offer = WaitlistOffer.objects.get()
    results = []

    def go():
        try:
            engine.accept(offer.pk, customer=b_user)
            results.append("ok")
        except Exception:  # the loser is refused; either way no second booking appears
            results.append("refused")
        finally:
            connection.close()

    threads = [threading.Thread(target=go) for _ in range(2)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count("ok") == 1
    assert Appointment.objects.filter(customer=b_user).count() == 1
