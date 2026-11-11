""" "Any stylist": AIR's rules assign a free stylist (scheduling/anystylist.py).

Rule-based and deterministic: works with the language-model layer OFF and whether or not a
receptionist is on duty. Allowed and denied cases.
"""

import threading
from datetime import timedelta

import pytest
from conftest import login
from django.db import connection
from django.test import Client
from django.utils import timezone
from notifications.models import Notification

from air import config
from air.models import AIActionLog
from core.models import MailOutbox
from people.models import DayOffRequest, Rating, StylistProfile
from scheduling import anystylist, approvals, booking
from scheduling.models import Appointment, AppointmentStatus, ApprovalStatus, StylistOffer
from scheduling.tests.test_booking import day_at, request_body, requested, send_request

S = AppointmentStatus
A = ApprovalStatus
Outcome = StylistOffer.Outcome


@pytest.fixture
def customer(shopper):
    client = Client()
    assert login(client, shopper).status_code == 200
    return client, shopper


@pytest.fixture
def desk(logged_in):
    """A receptionist signed in (on duty)."""
    return logged_in("receptionist")


@pytest.fixture
def team(catalogue):
    """Four stylists who do haircuts (enough for one offer and two reassignments)."""
    extra = []
    for name in ("Kiran", "Lata"):
        profile = StylistProfile.objects.create(display_name=f"{name} K", title="Stylist")
        profile.services.add(catalogue["haircut"])
        extra.append(profile)
    return [catalogue["asha"], catalogue["ravi"], *extra]


def appt(pk) -> Appointment:
    return Appointment.objects.get(pk=pk)


def any_request(client, catalogue, days=3, hour=11) -> str:
    return requested(client, catalogue, start=day_at(days, hour).isoformat())


def finished_visit(client, catalogue, stylist, stars, days):
    """A rated, finished visit for `stylist` (for the rating tie-break)."""
    pk = requested(client, catalogue, start=day_at(days, 10).isoformat(), stylist=str(stylist.id))
    Appointment.objects.filter(pk=pk).update(status=S.COMPLETED, stylist=stylist)
    Rating.objects.create(
        appointment_id=pk,
        customer=appt(pk).customer,
        stylist=stylist,
        status=Rating.Status.SUBMITTED,
        stars=stars,
    )


def decline(pk, reason="busy"):
    a = appt(pk)
    return approvals.stylist_decline(pk, profile=a.hold_stylist, actor=None, reason=reason)


# ------------------------------------------------------------------ who can be picked


@pytest.mark.django_db
def test_only_a_qualified_public_stylist_is_ever_picked(air_on, customer, catalogue, team):
    pk = any_request(customer[0], catalogue)
    a = appt(pk)
    assert a.any_stylist and a.preferred_stylist_id is None
    assert a.hold_stylist in team  # never "Hidden" (not shown) and never "Meena" (no haircut)
    assert a.stylist_status == A.PENDING and a.status == S.REQUESTED


@pytest.mark.django_db
def test_a_stylist_on_leave_or_off_shift_or_busy_is_never_picked(air_on, customer, catalogue, team):
    asha, ravi, kiran, lata = team
    day = booking.local(day_at(3, 11)).date()
    DayOffRequest.objects.create(
        stylist=asha, start_date=day, end_date=day, status=DayOffRequest.Status.APPROVED
    )
    ravi.weekly_hours = {booking.WEEKDAYS[day.weekday()]: ["14:00", "18:00"]}  # not at 11:00
    ravi.save()
    taken = requested(
        customer[0], catalogue, start=day_at(3, 11).isoformat(), stylist=str(kiran.id)
    )
    assert appt(taken).hold_stylist == kiran  # Kiran's 11:00 is held now
    pk = any_request(customer[0], catalogue, hour=11)
    assert appt(pk).hold_stylist == lata  # the only one on shift, not on leave, not busy


@pytest.mark.django_db
def test_fewest_bookings_that_day_wins(air_on, customer, catalogue, team):
    asha, ravi, kiran, lata = team
    for stylist, hour in ((asha, 10), (ravi, 13), (kiran, 15)):  # one request each that day
        requested(
            customer[0], catalogue, start=day_at(3, hour).isoformat(), stylist=str(stylist.id)
        )
    finished_visit(customer[0], catalogue, asha, 5, days=6)  # a better rating does not beat load
    pk = any_request(customer[0], catalogue, hour=11)
    assert appt(pk).hold_stylist == lata  # nothing else that day


@pytest.mark.django_db
def test_then_the_higher_rating_then_the_id(air_on, customer, catalogue, team):
    asha, ravi, kiran, lata = team
    finished_visit(customer[0], catalogue, ravi, 5, days=5)
    finished_visit(customer[0], catalogue, kiran, 4, days=6)
    order = anystylist.order_ids([s.id for s in team], day_at(3, 11))
    assert order[:2] == [ravi.id, kiran.id]
    unrated = sorted([asha.id, lata.id], key=str)
    assert order[2:] == unrated  # equal load and no rating: a stable order by id
    pk = any_request(customer[0], catalogue)
    assert appt(pk).hold_stylist == ravi


# ------------------------------------------------------------------ nobody free


@pytest.mark.django_db
def test_nobody_free_creates_no_request_and_offers_the_nearest_times(
    air_on, customer, catalogue, team, monkeypatch
):
    monkeypatch.setattr(anystylist, "pick", lambda appt, exclude_ids=(): None)
    before = Appointment.objects.count()
    response = send_request(customer[0], catalogue, start=day_at(3, 11).isoformat())
    assert response.status_code == 409
    body = response.json()
    assert body["slots"] and "No stylist is free" in body["detail"]
    assert Appointment.objects.count() == before  # nothing was created
    assert AIActionLog.objects.filter(action_type="no_stylist_free").exists()


# ------------------------------------------------------------------ two customers at once


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != "postgresql", reason="needs PostgreSQL row locks")
def test_two_customers_at_the_same_moment_never_get_the_same_stylist(
    air_on, catalogue, shopper, other_shopper
):
    ravi = catalogue["ravi"]
    catalogue["asha"].services.remove(catalogue["haircut"])  # Ravi is the only free stylist
    results = []

    def send(user):
        client = Client()
        login(client, user)
        results.append(
            client.post(
                "/api/booking/requests/",
                request_body(catalogue, start=day_at(3, 11).isoformat()),
                content_type="application/json",
            ).status_code
        )

    threads = [threading.Thread(target=send, args=(u,)) for u in (shopper, other_shopper)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(results) == [201, 409]  # one request, one nearest-time answer
    held = Appointment.objects.filter(hold_stylist=ravi, status=S.REQUESTED)
    assert held.count() == 1


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != "postgresql", reason="needs PostgreSQL row locks")
def test_two_customers_at_once_with_two_free_stylists_get_different_ones(
    air_on, catalogue, shopper, other_shopper
):
    results = []

    def send(user):
        client = Client()
        login(client, user)
        results.append(
            client.post(
                "/api/booking/requests/",
                request_body(catalogue, start=day_at(3, 11).isoformat()),
                content_type="application/json",
            ).status_code
        )

    threads = [threading.Thread(target=send, args=(u,)) for u in (shopper, other_shopper)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    stylists = list(
        Appointment.objects.filter(status=S.REQUESTED).values_list("hold_stylist_id", flat=True)
    )
    assert len(stylists) == len(set(stylists))  # never the same stylist at the same time


# ------------------------------------------------------------------ decline, timeout, limits


@pytest.mark.django_db
def test_a_decline_goes_to_the_next_free_stylist_and_keeps_the_desk_yes(
    air_on, customer, desk, catalogue, team
):
    pk = any_request(customer[0], catalogue)
    approvals.reception_accept(pk, actor=desk[1])
    first = appt(pk).hold_stylist
    decline(pk)
    a = appt(pk)
    assert a.status == S.REQUESTED and a.reception_status == A.ACCEPTED  # desk yes kept
    assert a.hold_stylist not in (None, first) and a.stylist_status == A.PENDING
    assert not MailOutbox.objects.filter(kind=MailOutbox.Kind.PAYMENT_LINK).exists()
    # The new stylist is asked exactly like a named request.
    assert a.hold_stylist in [r.hold_stylist for r in approvals.requests_for(a.hold_stylist)]
    assert AIActionLog.objects.filter(action_type="stylist_reassigned", reason_code="declined")
    # Both sides have now said yes: exactly one payment link.
    approvals.stylist_accept(pk, profile=a.hold_stylist, actor=None)
    assert appt(pk).status == S.AWAITING_PAYMENT
    assert MailOutbox.objects.filter(kind=MailOutbox.Kind.PAYMENT_LINK).count() == 1
    offers = list(appt(pk).offers.order_by("seq").values_list("outcome", flat=True))
    assert offers == [Outcome.DECLINED, Outcome.ACCEPTED]


@pytest.mark.django_db
def test_no_answer_in_time_also_moves_it_on(air_on, customer, catalogue, team):
    pk = any_request(customer[0], catalogue)
    first = appt(pk).hold_stylist
    StylistOffer.objects.filter(appointment_id=pk).update(
        answer_by=timezone.now() - timedelta(seconds=1)
    )
    approvals.expire_requests()
    a = appt(pk)
    assert a.status == S.REQUESTED and a.hold_stylist not in (None, first)
    assert list(a.offers.order_by("seq").values_list("outcome", flat=True)) == [
        Outcome.TIMED_OUT,
        Outcome.PENDING,
    ]
    assert AIActionLog.objects.filter(action_type="stylist_reassigned", reason_code="timed_out")


@pytest.mark.django_db
def test_at_most_two_more_stylists_then_the_usual_sorry_note(air_on, customer, catalogue, team):
    pk = any_request(customer[0], catalogue)
    asked = [appt(pk).hold_stylist]
    for _ in range(2):
        decline(pk)
        asked.append(appt(pk).hold_stylist)
    assert len(set(asked)) == 3 and appt(pk).status == S.REQUESTED
    decline(pk)  # the third stylist says no: no fourth offer
    a = appt(pk)
    assert a.status == S.DECLINED_BY_STYLIST
    assert a.offers.count() == 3
    note = Notification.objects.filter(user=a.customer).order_by("-created_at").first()
    assert "sorry" in note.body.lower() and "nearest times" in note.body
    assert AIActionLog.objects.filter(action_type="no_stylist_free", reason_code="reassign_limit")


@pytest.mark.django_db
def test_when_nobody_else_is_free_the_request_ends_with_the_sorry_note(air_on, customer, catalogue):
    # Only Asha and Ravi do haircuts: after both say no there is nobody left.
    pk = any_request(customer[0], catalogue)
    decline(pk)
    decline(pk)
    assert appt(pk).status == S.DECLINED_BY_STYLIST


@pytest.mark.django_db
def test_a_stylist_who_declined_is_never_offered_it_again(air_on, customer, catalogue, team):
    pk = any_request(customer[0], catalogue)
    first = appt(pk).hold_stylist
    decline(pk)
    decline(pk)
    assert first.id not in [appt(pk).hold_stylist_id]
    assert list(appt(pk).offers.values_list("stylist_id", flat=True)).count(first.id) == 1


# ------------------------------------------------------------------ manual reassign


def reassign(client, pk, stylist):
    return client.post(
        f"/api/desk/appointments/{pk}/reassign/",
        {"stylist": str(stylist.id), "reason": "other"},
        content_type="application/json",
    )


@pytest.mark.django_db
def test_the_receptionist_and_the_admin_can_move_it_with_the_same_checks(
    air_on, customer, desk, catalogue, team, logged_in
):
    pk = any_request(customer[0], catalogue)
    current = appt(pk).hold_stylist
    target = next(s for s in team if s != current)
    response = reassign(desk[0], pk, target)
    assert response.status_code == 200, response.content
    assert appt(pk).hold_stylist == target
    last = appt(pk).offers.order_by("-seq").first()
    assert last.by == StylistOffer.By.STAFF and last.actor == desk[1]
    assert appt(pk).offers.get(seq=1).outcome == Outcome.MOVED

    admin, _ = logged_in("admin")
    again = next(s for s in team if s not in (current, target))
    assert reassign(admin, pk, again).status_code == 200
    assert appt(pk).hold_stylist == again
    # Same checks: not a stylist who cannot do the service.
    refused = reassign(desk[0], pk, catalogue["meena"])
    assert refused.status_code == 400


@pytest.mark.django_db
def test_customers_and_stylists_cannot_move_it(air_on, customer, catalogue, team, logged_in):
    pk = any_request(customer[0], catalogue)
    stylist, _ = logged_in("stylist")
    target = next(s for s in team if s != appt(pk).hold_stylist)
    assert reassign(customer[0], pk, target).status_code == 403
    assert reassign(stylist, pk, target).status_code == 403
    assert appt(pk).offers.count() == 1


# ------------------------------------------------------------------ who sees what


@pytest.mark.django_db
def test_the_customer_never_sees_who_declined_or_why_but_staff_see_the_history(
    air_on, customer, desk, catalogue, team
):
    pk = any_request(customer[0], catalogue)
    first = appt(pk).hold_stylist
    decline(pk, reason="personal_plans")
    now_with = appt(pk).hold_stylist
    seen = customer[0].get(f"/api/my/appointments/{pk}/").json()
    everything = str(seen) + str(customer[0].get("/api/notifications/").json())
    everything += " ".join(m.body for m in MailOutbox.objects.filter(to_email=first.display_name))
    assert seen["any_stylist"] is True
    assert (
        seen["stylist_note"] == f"Stylist: {now_with.display_name.split(' ')[0]}, assigned by AIR"
    )
    assert first.display_name not in str(seen)
    assert "Personal plans" not in everything and "personal_plans" not in everything
    assert "stylist_offers" not in seen
    staff = desk[0].get(f"/api/desk/appointments/{pk}/").json()
    assert staff["any_stylist"] is True
    history = staff["stylist_offers"]
    assert [h["stylist_name"] for h in history] == [first.display_name, now_with.display_name]
    assert [h["outcome"] for h in history] == ["declined", "pending"]


@pytest.mark.django_db
def test_emails_say_the_stylist_was_assigned_by_air(air_on, customer, catalogue, team):
    pk = any_request(customer[0], catalogue)
    who = appt(pk).hold_stylist.display_name.split(" ")[0]
    mail = MailOutbox.objects.filter(subject__contains="booking request").latest("created_at")
    assert f"Stylist: {who}, assigned by AIR." in mail.body


# ------------------------------------------------------------------ either desk, LLM off


@pytest.mark.django_db
def test_it_works_in_cover_mode_with_the_language_model_off(
    air_on, customer, catalogue, team, django_capture_on_commit_callbacks
):
    from air.tests.test_desk_cover import send_form

    assert config.get_settings().master_enabled is False  # the language-model layer is OFF

    def commits():
        return django_capture_on_commit_callbacks(execute=True)

    a = send_form(customer[0], catalogue, commits, stylist=None)
    a.refresh_from_db()
    assert a.any_stylist and a.hold_stylist in team
    assert a.reception_status == A.ACCEPTED and a.reception_actor == "air"  # AIR covers the desk
    assert AIActionLog.objects.filter(booking_ref=a.pk, action_type="stylist_auto_assigned")


@pytest.mark.django_db
def test_it_works_with_a_receptionist_on_duty(air_on, customer, desk, catalogue, team):
    pk = any_request(customer[0], catalogue)
    a = appt(pk)
    assert a.hold_stylist is not None and a.reception_status == A.PENDING  # the desk decides
    assert reassign(desk[0], pk, a.hold_stylist).status_code == 400  # already with them


@pytest.mark.django_db
def test_the_chat_uses_the_same_order(air_on, catalogue, team):
    asha, ravi, kiran, lata = team
    ids = [s.id for s in team]
    assert anystylist.chat_pick(ids, day_at(3, 11)) == anystylist.order_ids(ids, day_at(3, 11))
