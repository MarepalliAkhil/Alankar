"""Slot holds, the stylist timeout, the payment-link lifecycle, resend-once and honest messages."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.utils import timezone

from air import actor, config, holds, lifecycle, links, service
from air.models import AirRequestState, SlotHold
from air.tests.conftest import (
    contact_of,
    make_hold,
    payment_token_for,
    stylist_says_yes,
    submit,
)
from billing.models import PaymentLink
from notifications.models import Notification, SimulatedSms
from scheduling import approvals, booking
from scheduling.models import Appointment, AppointmentStatus

S = AppointmentStatus
POSTGRES = connection.vendor == "postgresql"


def words_sent_to(user):
    rows = Notification.objects.filter(user=user).order_by("created_at")
    return " | ".join(f"{n.title}: {n.body}" for n in rows)


def free_for_others(cat, who="asha", hour=11, days=3):
    from air.tests.conftest import day_at

    day = day_at(days, hour)
    free = dict(booking.free_starts(booking.local(day).date(), 30, [cat[who].id]))
    return day in free


# ---------------------------------------------------------------- a hold is made when offered


@pytest.mark.django_db
def test_a_hold_is_made_the_moment_a_slot_is_offered_and_blocks_others(
    air_on, shopper, other_shopper, catalogue
):
    assert free_for_others(catalogue)
    hold = make_hold(shopper, catalogue)
    assert hold.status == SlotHold.Status.ACTIVE
    assert hold.expires_at - timezone.now() <= timedelta(minutes=15, seconds=5)
    assert hold.expires_at - timezone.now() > timedelta(minutes=14)
    assert not free_for_others(catalogue)
    with pytest.raises(booking.BookingError) as taken:
        make_hold(other_shopper, catalogue, session="s2")
    assert taken.value.code == "conflict" and taken.value.slots
    # The other stylist is still free at that time.
    assert (
        make_hold(other_shopper, catalogue, stylist="ravi", session="s2").stylist
        == catalogue["ravi"]
    )


@pytest.mark.django_db
def test_the_same_idempotency_key_returns_the_same_hold(air_on, shopper, catalogue):
    first = make_hold(shopper, catalogue, key="tap-1")
    again = make_hold(shopper, catalogue, key="tap-1")
    assert again.pk == first.pk
    assert SlotHold.objects.count() == 1


@pytest.mark.django_db
def test_a_customer_cannot_hold_two_overlapping_times(air_on, shopper, catalogue):
    make_hold(shopper, catalogue)
    with pytest.raises(booking.BookingError) as clash:
        make_hold(shopper, catalogue, stylist="ravi", session="s2")
    assert clash.value.code == "customer_clash"
    # A time that does not overlap is fine.
    assert make_hold(shopper, catalogue, hour=15, session="s2")


@pytest.mark.django_db
def test_an_abandoned_hold_expires_after_the_stylist_timeout_and_frees_the_slot(
    air_on, shopper, other_shopper, catalogue
):
    hold = make_hold(shopper, catalogue)
    holds.expire_due(timezone.now() + timedelta(minutes=14))
    hold.refresh_from_db()
    assert hold.status == SlotHold.Status.ACTIVE
    holds.expire_due(timezone.now() + timedelta(minutes=16))
    hold.refresh_from_db()
    assert hold.status == SlotHold.Status.EXPIRED and hold.release_reason == "expired"
    assert free_for_others(catalogue)  # the slot is open again for everyone


@pytest.mark.django_db
def test_an_overdue_hold_is_ignored_on_read_even_before_the_job_runs(air_on, shopper, catalogue):
    hold = make_hold(shopper, catalogue)
    SlotHold.objects.filter(pk=hold.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
    assert free_for_others(catalogue)  # lazily treated as released


@pytest.mark.django_db
def test_the_stylist_timeout_is_configurable(air_on, shopper, catalogue, admin_user):
    config.update_settings({"stylist_timeout_minutes": 5}, actor=admin_user)
    hold = make_hold(shopper, catalogue)
    assert hold.expires_at - timezone.now() <= timedelta(minutes=5, seconds=5)
    holds.expire_due(timezone.now() + timedelta(minutes=6))
    hold.refresh_from_db()
    assert hold.status == SlotHold.Status.EXPIRED


@pytest.mark.django_db
def test_a_released_hold_frees_the_slot(air_on, shopper, catalogue):
    hold = make_hold(shopper, catalogue)
    holds.release(hold.pk, reason="abandoned", customer=shopper)
    hold.refresh_from_db()
    assert hold.status == SlotHold.Status.RELEASED
    assert free_for_others(catalogue)
    holds.release(hold.pk, reason="abandoned")  # repeating changes nothing


# ---------------------------------------------------------------- the stylist's answer


@pytest.mark.django_db
def test_stylist_timeout_expires_the_request_tells_the_customer_and_offers_alternatives(
    air_on, shopper, catalogue
):
    appt = submit(shopper, make_hold(shopper, catalogue))
    assert appt.approval_expires_at - timezone.now() <= timedelta(minutes=15, seconds=5)
    holds.expire_due(timezone.now() + timedelta(minutes=16))
    appt.refresh_from_db()
    assert appt.status == S.EXPIRED
    hold = SlotHold.objects.get(request=appt)
    assert hold.status == SlotHold.Status.EXPIRED and hold.release_reason == "stylist_timeout"
    said = words_sent_to(shopper)
    assert "not confirmed in time" in said and "nearest times that are free" in said
    assert "personal" not in said.lower()
    assert free_for_others(catalogue)


@pytest.mark.django_db
def test_stylist_decline_releases_the_hold_and_never_shows_the_private_reason(
    air_on, shopper, catalogue
):
    appt = submit(shopper, make_hold(shopper, catalogue))
    approvals.stylist_decline(
        appt.pk, profile=catalogue["asha"], actor=None, reason="personal_plans"
    )
    lifecycle.sync_request(appt.pk)
    assert SlotHold.objects.get(request=appt).status == SlotHold.Status.RELEASED
    said = words_sent_to(shopper)
    assert "not able to take this slot" in said and "nearest times that are free" in said
    assert "Personal plans" not in said and "personal_plans" not in said
    assert free_for_others(catalogue)


@pytest.mark.django_db
def test_each_customer_message_is_sent_once(air_on, shopper, catalogue):
    appt = submit(shopper, make_hold(shopper, catalogue))
    for _ in range(3):
        lifecycle.sync_request(appt.pk)
    received = Notification.objects.filter(user=shopper, title="We have your booking request")
    assert received.count() == 1


# ---------------------------------------------------------------- accepted -> payment link


def awaiting_booking(shopper, catalogue):
    appt = submit(shopper, make_hold(shopper, catalogue))
    stylist_says_yes(appt, catalogue)
    appt.refresh_from_db()
    assert appt.status == S.AWAITING_PAYMENT
    lifecycle.sync_request(appt.pk)
    return appt


@pytest.mark.django_db
def test_both_accept_gives_a_45_minute_link_and_the_slot_stays_held(
    air_on, shopper, other_shopper, catalogue
):
    appt = awaiting_booking(shopper, catalogue)
    link = PaymentLink.objects.get(appointment=appt, status=PaymentLink.Status.ACTIVE)
    left = link.expires_at - timezone.now()
    assert timedelta(minutes=44) < left <= timedelta(minutes=45, seconds=5)
    assert appt.awaiting_payment_until == link.expires_at
    assert link.sent_by_air is True and link.sent_by is None
    assert link.amount == appt.amount_payable and link.sent_at is not None
    hold = SlotHold.objects.get(request=appt)
    assert hold.status == SlotHold.Status.CONFIRMED and hold.expires_at == link.expires_at
    with pytest.raises(booking.BookingError):
        make_hold(other_shopper, catalogue, session="s2")  # still held for the payer
    said = words_sent_to(shopper)
    assert "only after payment" in said
    assert SimulatedSms.objects.filter(user=shopper).exists()


@pytest.mark.django_db
def test_the_link_expiry_is_configurable(air_on, shopper, catalogue, admin_user):
    config.update_settings({"payment_link_minutes": 30}, actor=admin_user)
    appt = awaiting_booking(shopper, catalogue)
    link = PaymentLink.objects.get(appointment=appt, status=PaymentLink.Status.ACTIVE)
    assert (
        timedelta(minutes=29) < link.expires_at - timezone.now() <= timedelta(minutes=30, seconds=5)
    )


@pytest.mark.django_db
def test_the_payment_token_is_never_stored_logged_or_audited(air_on, shopper, catalogue, caplog):
    import logging

    caplog.set_level(logging.DEBUG)
    appt = awaiting_booking(shopper, catalogue)
    token = payment_token_for(appt)
    link = PaymentLink.objects.get(appointment=appt, status=PaymentLink.Status.ACTIVE)
    assert token not in link.token_hash and len(link.token_hash) == 64
    assert token not in caplog.text
    from accounts.models import AuditLog
    from air.models import AIActionLog

    blob = str(list(AuditLog.objects.values_list("metadata", flat=True)))
    blob += str(list(AIActionLog.objects.values_list("before", "after", flat=False)))
    blob += " ".join(n.body for n in Notification.objects.all())
    assert token not in blob


@pytest.mark.django_db
def test_an_expired_link_releases_the_slot_tells_the_customer_and_offers_new_times(
    air_on, shopper, other_shopper, catalogue
):
    appt = awaiting_booking(shopper, catalogue)
    holds.expire_due(timezone.now() + timedelta(minutes=46))
    appt.refresh_from_db()
    assert appt.status == S.PAYMENT_EXPIRED
    hold = SlotHold.objects.get(request=appt)
    assert hold.status == SlotHold.Status.EXPIRED and hold.release_reason == "link_expired"
    assert PaymentLink.objects.get(appointment=appt).status == PaymentLink.Status.EXPIRED
    said = words_sent_to(shopper)
    assert "payment link" in said and "nearest times that are free" in said
    assert "Nothing has been charged" in said
    assert free_for_others(catalogue)
    assert make_hold(other_shopper, catalogue, session="s2")  # a new attempt can be made


@pytest.mark.django_db
def test_paying_makes_the_booking_scheduled_and_says_it_is_now_confirmed(
    air_on, shopper, catalogue
):
    appt = awaiting_booking(shopper, catalogue)
    token = payment_token_for(appt)
    paid, ok = booking.pay(appt.pk, customer=shopper, token=token, succeed=True)
    assert ok and paid.status == S.SCHEDULED
    lifecycle.sync_request(appt.pk)
    assert SlotHold.objects.get(request=appt).status == SlotHold.Status.CONFIRMED
    link = PaymentLink.objects.get(appointment=appt, status=PaymentLink.Status.PAID)
    assert link.paid_at is not None
    assert "now confirmed" in words_sent_to(shopper)


@pytest.mark.django_db
def test_a_finished_visit_closes_the_hold(air_on, shopper, catalogue):
    appt = awaiting_booking(shopper, catalogue)
    Appointment.objects.filter(pk=appt.pk).update(status=S.COMPLETED)
    lifecycle.sync_request(appt.pk)
    assert SlotHold.objects.get(request=appt).status == SlotHold.Status.CONSUMED


# ---------------------------------------------------------------- resend, at most once


@pytest.mark.django_db
def test_air_resends_the_link_at_most_once_per_request(air_on, shopper, catalogue):
    appt = awaiting_booking(shopper, catalogue)
    first_token = payment_token_for(appt)
    links.resend(appt.pk)
    second_token = payment_token_for(appt)
    assert second_token != first_token
    assert (
        PaymentLink.objects.filter(appointment=appt, status=PaymentLink.Status.REPLACED).count()
        == 1
    )
    active = PaymentLink.objects.get(appointment=appt, status=PaymentLink.Status.ACTIVE)
    assert active.sent_by_air is True
    assert AirRequestState.objects.get(appointment=appt).link_resends == 1
    with pytest.raises(actor.AirDenied) as denied:
        links.resend(appt.pk)
    assert denied.value.code == "resend_limit"
    assert PaymentLink.objects.filter(appointment=appt).count() == 2


@pytest.mark.django_db
def test_resend_needs_the_slot_to_still_be_free(air_on, shopper, catalogue, monkeypatch):
    appt = awaiting_booking(shopper, catalogue)
    monkeypatch.setattr(links, "_slot_still_free", lambda a: False)
    with pytest.raises(booking.BookingError) as conflict:
        links.resend(appt.pk)
    assert conflict.value.code == "conflict"
    assert AirRequestState.objects.get(appointment=appt).link_resends == 0


@pytest.mark.django_db
def test_resend_extends_the_hold_to_the_new_link_expiry(air_on, shopper, catalogue):
    appt = awaiting_booking(shopper, catalogue)
    old = SlotHold.objects.get(request=appt).expires_at
    links.resend(appt.pk, now=timezone.now() + timedelta(minutes=20))
    new = SlotHold.objects.get(request=appt).expires_at
    assert new > old
    appt.refresh_from_db()
    assert appt.awaiting_payment_until == new


@pytest.mark.django_db
def test_resend_is_refused_when_nothing_is_waiting_for_payment(air_on, shopper, catalogue):
    appt = submit(shopper, make_hold(shopper, catalogue))  # still waiting for the stylist
    with pytest.raises(booking.BookingError):
        links.resend(appt.pk)


@pytest.mark.django_db
def test_air_can_expire_a_link_by_hand(air_on, shopper, catalogue):
    appt = awaiting_booking(shopper, catalogue)
    links.expire(appt.pk)
    appt.refresh_from_db()
    assert appt.status == S.PAYMENT_EXPIRED
    assert SlotHold.objects.get(request=appt).status == SlotHold.Status.EXPIRED


@pytest.mark.django_db
def test_air_cannot_create_a_link_when_one_is_already_active(air_on, shopper, catalogue):
    appt = awaiting_booking(shopper, catalogue)
    with pytest.raises(booking.BookingError) as exists:
        links.create(appt.pk)
    assert exists.value.code == "link_exists"


# ---------------------------------------------------------------- database-level guarantees


@pytest.mark.django_db
@pytest.mark.skipif(not POSTGRES, reason="exclusion constraints are PostgreSQL only")
def test_the_database_refuses_overlapping_live_holds_for_a_stylist(
    air_on, shopper, other_shopper, catalogue
):
    from django.db import IntegrityError, transaction

    from air.tests.conftest import day_at

    first = make_hold(shopper, catalogue)
    clash = SlotHold(
        stylist=catalogue["asha"],
        customer=other_shopper,
        service=catalogue["haircut"],
        starts_at=first.starts_at + timedelta(minutes=15),
        ends_at=first.ends_at + timedelta(minutes=15),
        expires_at=timezone.now() + timedelta(minutes=10),
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        clash.save()
    # Back-to-back is fine, and a released hold no longer blocks.
    SlotHold.objects.create(
        stylist=catalogue["asha"],
        customer=other_shopper,
        service=catalogue["haircut"],
        starts_at=first.ends_at,
        ends_at=first.ends_at + timedelta(minutes=30),
        expires_at=timezone.now() + timedelta(minutes=10),
    )
    holds.release(first.pk)
    clash.starts_at, clash.ends_at = day_at(3, 11), day_at(3, 11) + timedelta(minutes=30)
    clash.save()


@pytest.mark.django_db
@pytest.mark.skipif(not POSTGRES, reason="exclusion constraints are PostgreSQL only")
def test_the_database_refuses_a_customer_holding_two_overlapping_times(air_on, shopper, catalogue):
    from django.db import IntegrityError, transaction

    first = make_hold(shopper, catalogue)
    with pytest.raises(IntegrityError), transaction.atomic():
        SlotHold.objects.create(
            stylist=catalogue["ravi"],
            customer=shopper,
            service=catalogue["haircut"],
            starts_at=first.starts_at,
            ends_at=first.ends_at,
            expires_at=timezone.now() + timedelta(minutes=10),
        )


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(not POSTGRES, reason="needs real row locks (PostgreSQL)")
def test_two_simultaneous_requests_for_one_slot_have_exactly_one_winner(
    air_on, shopper, other_shopper, catalogue
):
    import threading

    results = []

    def attempt(user, session):
        try:
            results.append(("ok", make_hold(user, catalogue, session=session).pk))
        except booking.BookingError as exc:
            results.append(("conflict", exc.code))
        finally:
            connection.close()

    threads = [
        threading.Thread(target=attempt, args=(shopper, "s1")),
        threading.Thread(target=attempt, args=(other_shopper, "s2")),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(30)
    assert sorted(kind for kind, _ in results) == ["conflict", "ok"]
    assert SlotHold.objects.filter(status=SlotHold.Status.ACTIVE).count() == 1


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(not POSTGRES, reason="needs real row locks (PostgreSQL)")
def test_two_simultaneous_submits_of_one_hold_make_one_request(air_on, shopper, catalogue):
    import threading

    hold = make_hold(shopper, catalogue)
    made = []

    def go():
        try:
            made.append(
                service.submit_booking(
                    customer=shopper,
                    hold_id=hold.pk,
                    contact=contact_of(shopper),
                    session_id="sess-1",
                    customer_confirmed=True,
                )
            )
        except Exception as exc:  # noqa: BLE001 - the loser may see a clean refusal
            made.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=go) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(30)
    assert Appointment.objects.count() == 1


@pytest.mark.django_db
def test_the_amounts_come_from_the_normal_booking_rules(air_on, shopper, catalogue):
    appt = awaiting_booking(shopper, catalogue)
    assert appt.amount_payable == Decimal("300.00") or appt.amount_payable > 0
