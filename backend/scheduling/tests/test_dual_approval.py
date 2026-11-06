"""Task 13A (dual approval), 13B (admin loses appointments and schedule) and 13C (sorry notes when
staff change a slot)."""

from datetime import timedelta

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog
from conftest import login
from core.jobs import booking_request_reminders
from core.models import MailOutbox
from notifications.models import Notification, SimulatedSms
from scheduling import approvals
from scheduling.models import Appointment, AppointmentStatus, SlotChange
from scheduling.tests.test_booking import (  # noqa: F401  (shared fixtures and helpers)
    catalogue,
    customer,
    day_at,
    desk,
    requested,
    send_request,
)

S = AppointmentStatus
PRIVATE_WORDS = (
    "Busy at that time",
    "Personal plans",
    "Outside my working hours",
    "personal_plans",
)


def post(client, url, body=None):
    return client.post(url, body or {}, content_type="application/json")


def stylist_pair(make_user, profile):
    user = make_user(role="stylist", full_name=profile.display_name)
    profile.user = user
    profile.save()
    client = Client()
    assert login(client, user).status_code == 200
    return client, user


@pytest.fixture
def asha(make_user, catalogue):
    return stylist_pair(make_user, catalogue["asha"])


@pytest.fixture
def ravi(make_user, catalogue):
    return stylist_pair(make_user, catalogue["ravi"])


def asked(customer_client, cat, who="asha", days=3, hour=11):
    stylist = str(cat[who].id) if who else None
    return requested(customer_client, cat, start=day_at(days, hour).isoformat(), stylist=stylist)


def reception_accept(desk, appt_id, stylist=None):
    body = {"stylist": str(stylist.id)} if stylist else {}
    return post(desk[0], f"/api/desk/appointments/{appt_id}/confirm/", body)


def appt_of(appt_id):
    return Appointment.objects.get(pk=appt_id)


def customer_view(customer_client, appt_id):
    return customer_client.get(f"/api/my/appointments/{appt_id}/").json()


# ------------------------------------------------------------------------------- 13A: approving


@pytest.mark.django_db
def test_booking_needs_both_sides_to_say_yes(customer, desk, asha, catalogue):
    appt_id = asked(customer[0], catalogue)
    appt = appt_of(appt_id)
    assert appt.status == S.REQUESTED
    assert (appt.reception_status, appt.stylist_status) == ("pending", "pending")

    assert reception_accept(desk, appt_id).status_code == 200
    appt = appt_of(appt_id)
    assert appt.status == S.REQUESTED and appt.reception_status == "accepted"
    assert customer_view(customer[0], appt_id)["approval"]["label"] == "Waiting for approval"

    assert post(asha[0], f"/api/stylist/requests/{appt_id}/accept/").status_code == 200
    appt = appt_of(appt_id)
    assert appt.status in (S.AWAITING_PAYMENT, S.SCHEDULED)
    assert customer_view(customer[0], appt_id)["approval"]["label"] == "Confirmed"
    assert MailOutbox.objects.filter(kind=MailOutbox.Kind.PAYMENT_LINK).exists()


@pytest.mark.django_db
def test_stylist_can_answer_first(customer, desk, asha, catalogue):
    appt_id = asked(customer[0], catalogue)
    assert post(asha[0], f"/api/stylist/requests/{appt_id}/accept/").status_code == 200
    assert appt_of(appt_id).status == S.REQUESTED
    assert reception_accept(desk, appt_id).status_code == 200
    assert appt_of(appt_id).status in (S.AWAITING_PAYMENT, S.SCHEDULED)


@pytest.mark.django_db
def test_an_any_request_needs_the_receptionist_to_pick_a_stylist_first(
    customer, desk, asha, ravi, catalogue
):
    appt_id = asked(customer[0], catalogue, who=None)
    # Nobody has been asked, so the stylists see nothing.
    assert asha[0].get("/api/stylist/requests/").json()["pending"] == []
    assert reception_accept(desk, appt_id).status_code in (400, 409)
    assert reception_accept(desk, appt_id, catalogue["asha"]).status_code == 200
    assert len(asha[0].get("/api/stylist/requests/").json()["pending"]) == 1
    assert ravi[0].get("/api/stylist/requests/").json()["pending"] == []


@pytest.mark.django_db
def test_stylist_decline_means_no_booking_and_a_polite_message_without_the_reason(
    customer, desk, asha, catalogue
):
    appt_id = asked(customer[0], catalogue)
    reception_accept(desk, appt_id)
    response = post(
        asha[0], f"/api/stylist/requests/{appt_id}/decline/", {"reason": "personal_plans"}
    )
    assert response.status_code == 200
    assert appt_of(appt_id).status == S.DECLINED_BY_STYLIST
    assert not MailOutbox.objects.filter(kind=MailOutbox.Kind.PAYMENT_LINK).exists()

    seen = customer_view(customer[0], appt_id)
    assert seen["approval"]["label"] == "Declined"
    assert "isn't available for this time" in seen["approval"]["message"]
    assert seen["rebook"]["service"] == "haircut"
    everything = str(seen) + str(customer[0].get("/api/my/appointments/").json())
    everything += str(customer[0].get("/api/notifications/").json())
    everything += "".join(
        m.body + m.subject for m in MailOutbox.objects.filter(to_email="priya@example.com")
    )
    everything += "".join(s.body for s in SimulatedSms.objects.all())
    for word in PRIVATE_WORDS:
        assert word not in everything
    assert "stylist_decline_reason" not in everything
    # The customer was told in all three ways.
    assert Notification.objects.filter(user=customer[1], kind="booking_outcome").exists()
    assert SimulatedSms.objects.exists()


@pytest.mark.django_db
def test_the_private_reason_is_visible_only_to_the_desk_and_that_stylist(
    customer, desk, asha, ravi, catalogue
):
    appt_id = asked(customer[0], catalogue)
    post(asha[0], f"/api/stylist/requests/{appt_id}/decline/", {"reason": "personal_plans"})
    row = desk[0].get(f"/api/desk/appointments/{appt_id}/").json()
    assert row["stylist_decline_reason"] == "personal_plans"
    assert row["stylist_decline_reason_label"] == "Personal plans"
    assert ravi[0].get(f"/api/stylist/appointments/{appt_id}/").status_code == 404


@pytest.mark.django_db
def test_receptionist_decline_gives_the_customer_a_polite_message_and_no_booking(
    customer, desk, asha, catalogue
):
    appt_id = asked(customer[0], catalogue)
    assert (
        post(
            desk[0], f"/api/desk/appointments/{appt_id}/reject/", {"reason": "Fully booked"}
        ).status_code
        == 200
    )
    assert appt_of(appt_id).status == S.DECLINED_BY_RECEPTION
    seen = customer_view(customer[0], appt_id)
    assert seen["approval"]["label"] == "Declined"
    assert "Fully booked" not in str(seen)
    # The stylist can no longer accept it.
    assert post(asha[0], f"/api/stylist/requests/{appt_id}/accept/").status_code in (404, 409)


@pytest.mark.django_db
def test_a_declined_request_can_go_to_another_stylist_but_nobody_overrides_the_decline(
    customer, desk, asha, ravi, catalogue
):
    appt_id = asked(customer[0], catalogue)
    reception_accept(desk, appt_id)
    post(asha[0], f"/api/stylist/requests/{appt_id}/decline/", {"reason": "busy"})
    # The receptionist cannot accept for the stylist, nor accept the request again.
    reception_accept(desk, appt_id)  # answering again changes nothing
    assert appt_of(appt_id).status == S.DECLINED_BY_STYLIST
    assert appt_of(appt_id).stylist_status == "declined"
    # But the request can be given to another stylist, which restarts the stylist's approval.
    response = post(
        desk[0],
        f"/api/desk/appointments/{appt_id}/reassign/",
        {"stylist": str(catalogue["ravi"].id), "reason": "stylist_unavailable"},
    )
    assert response.status_code == 200, response.content
    appt = appt_of(appt_id)
    assert appt.status == S.REQUESTED and appt.stylist_status == "pending"
    assert len(ravi[0].get("/api/stylist/requests/").json()["pending"]) == 1
    assert asha[0].get("/api/stylist/requests/").json()["pending"] == []


@pytest.mark.django_db
def test_nobody_else_can_see_or_answer_a_request(customer, desk, asha, ravi, catalogue, logged_in):
    appt_id = asked(customer[0], catalogue)
    # Another stylist: not listed, cannot accept or decline.
    assert ravi[0].get("/api/stylist/requests/").json()["pending"] == []
    assert post(ravi[0], f"/api/stylist/requests/{appt_id}/accept/").status_code == 404
    assert (
        post(ravi[0], f"/api/stylist/requests/{appt_id}/decline/", {"reason": "busy"}).status_code
        == 404
    )
    # A customer cannot accept, and neither can a receptionist for the stylist.
    assert post(customer[0], f"/api/stylist/requests/{appt_id}/accept/").status_code == 403
    assert post(desk[0], f"/api/stylist/requests/{appt_id}/accept/").status_code == 403
    assert Client().post(f"/api/stylist/requests/{appt_id}/accept/").status_code in (401, 403)
    # An admin has no part in any of it.
    admin, _ = logged_in("admin")
    assert post(admin, f"/api/stylist/requests/{appt_id}/accept/").status_code == 403
    assert post(admin, f"/api/desk/appointments/{appt_id}/confirm/").status_code == 403
    assert admin.get("/api/desk/appointments/").status_code == 403
    assert appt_of(appt_id).stylist_status == "pending"


@pytest.mark.django_db
def test_stylist_request_card_shows_a_first_name_only(customer, desk, asha, catalogue):
    appt_id = asked(customer[0], catalogue)
    card = asha[0].get("/api/stylist/requests/").json()["pending"][0]
    assert card["customer_first_name"] == "Priya"
    text = str(card)
    for word in ("Customer", "priya@example.com", "9876543210", "price", "amount"):
        assert word not in text
    assert card["can_answer"] is True and card["id"] == appt_id


@pytest.mark.django_db
def test_answering_twice_changes_nothing(customer, desk, asha, catalogue):
    appt_id = asked(customer[0], catalogue)
    assert post(asha[0], f"/api/stylist/requests/{appt_id}/accept/").status_code == 200
    again = post(asha[0], f"/api/stylist/requests/{appt_id}/accept/")
    assert again.status_code == 200
    assert reception_accept(desk, appt_id).status_code == 200
    assert reception_accept(desk, appt_id).status_code == 200
    assert appt_of(appt_id).status in (S.AWAITING_PAYMENT, S.SCHEDULED)
    assert MailOutbox.objects.filter(kind=MailOutbox.Kind.PAYMENT_LINK).count() == 1
    # A decline after an accept is refused.
    late = post(asha[0], f"/api/stylist/requests/{appt_id}/decline/", {"reason": "busy"})
    assert late.status_code in (404, 409)


@pytest.mark.django_db
def test_decline_is_idempotent(customer, desk, asha, catalogue):
    appt_id = asked(customer[0], catalogue)
    body = {"reason": "busy"}
    assert post(asha[0], f"/api/stylist/requests/{appt_id}/decline/", body).status_code == 200
    assert post(asha[0], f"/api/stylist/requests/{appt_id}/decline/", body).status_code == 200
    assert Notification.objects.filter(user=customer[1], kind="booking_outcome").count() == 1


@pytest.mark.django_db
def test_pending_request_holds_the_stylists_slot_and_decline_frees_it(
    customer, desk, asha, catalogue, make_user
):
    appt_id = asked(customer[0], catalogue)
    slots = (
        customer[0]
        .get(
            "/api/booking/slots/",
            {
                "service": "haircut",
                "variant": str(catalogue["short"].id),
                "stylist": str(catalogue["asha"].id),
                "date": day_at(3, 11).date().isoformat(),
            },
        )
        .json()["slots"]
    )
    assert not any(
        day_at(3, 11).isoformat() == s or s.startswith(day_at(3, 11).isoformat()[:16])
        for s in slots
    )
    # A second customer cannot take the same stylist at the same time.
    other = make_user(role="customer", email="other@example.com", full_name="Other Person")
    from people.models import CustomerProfile

    profile = CustomerProfile(user=other)
    profile.set_phone("9123456780")
    profile.save()
    client = Client()
    login(client, other)
    clash = send_request(
        client,
        catalogue,
        start=day_at(3, 11).isoformat(),
        stylist=str(catalogue["asha"].id),
        contact_email="other@example.com",
    )
    assert clash.status_code == 409
    post(asha[0], f"/api/stylist/requests/{appt_id}/decline/", {"reason": "busy"})
    free = send_request(
        client,
        catalogue,
        start=day_at(3, 11).isoformat(),
        stylist=str(catalogue["asha"].id),
        contact_email="other@example.com",
    )
    assert free.status_code == 201


@pytest.mark.django_db
def test_stylist_accept_is_blocked_when_they_are_no_longer_free(customer, desk, asha, catalogue):
    appt_id = asked(customer[0], catalogue)
    # The stylist took time off covering that day after the request was made.
    from people.models import DayOffRequest

    DayOffRequest.objects.create(
        stylist=catalogue["asha"],
        start_date=day_at(3, 11).date(),
        end_date=day_at(3, 11).date(),
        reason="Family",
        status="approved",
    )
    response = post(asha[0], f"/api/stylist/requests/{appt_id}/accept/")
    assert response.status_code == 400
    assert "time off" in response.json()["detail"]
    assert appt_of(appt_id).stylist_status == "pending"


@pytest.mark.django_db
def test_request_expires_before_the_visit_and_the_job_is_safe_to_run_twice(
    customer, desk, asha, catalogue
):
    appt_id = asked(customer[0], catalogue)
    Appointment.objects.filter(pk=appt_id).update(
        approval_expires_at=timezone.now() - timedelta(minutes=1)
    )
    assert approvals.expire_requests() == 1
    assert approvals.expire_requests() == 0
    assert appt_of(appt_id).status == S.EXPIRED
    seen = customer_view(customer[0], appt_id)
    assert seen["approval"]["label"] == "Expired"
    assert seen["rebook"]
    assert post(asha[0], f"/api/stylist/requests/{appt_id}/accept/").status_code in (404, 409)
    assert Notification.objects.filter(user=customer[1], kind="booking_outcome").count() == 1


@pytest.mark.django_db
def test_deadline_is_always_before_the_visit_starts():
    start = timezone.now() + timedelta(hours=5)
    now = timezone.now()
    assert approvals.approval_deadline(start, now) < start
    far = now + timedelta(days=10)
    assert approvals.approval_deadline(far, now) <= now + timedelta(hours=24, minutes=1)


@pytest.mark.django_db
def test_reminders_go_to_the_side_that_has_not_answered_and_not_twice(
    customer, desk, asha, catalogue
):
    appt_id = asked(customer[0], catalogue)
    reception_accept(desk, appt_id)
    Appointment.objects.filter(pk=appt_id).update(created_at=timezone.now() - timedelta(hours=3))
    before = Notification.objects.filter(user=asha[1]).count()
    approvals.send_reminders()
    approvals.send_reminders()  # a second run sends nothing new
    after = Notification.objects.filter(user=asha[1]).count()
    assert after == before + 1
    assert Notification.objects.filter(kind="request_reminder", user=asha[1]).count() == 1
    # The receptionist already answered, so only the stylist is nudged.
    assert not Notification.objects.filter(kind="request_reminder").exclude(user=asha[1]).exists()
    assert booking_request_reminders  # the job exists for run_jobs


@pytest.mark.django_db
def test_notifications_are_private_to_their_owner(customer, desk, asha, catalogue):
    asked(customer[0], catalogue)
    mine = asha[0].get("/api/notifications/").json()
    assert mine["unread"] >= 1
    theirs = customer[0].get("/api/notifications/").json()
    assert all(n["id"] not in {m["id"] for m in mine["results"]} for n in theirs["results"])
    assert post(asha[0], "/api/notifications/read/").json()["unread"] == 0
    assert customer[0].get("/api/notifications/").json()["unread"] >= 1  # untouched
    assert Client().get("/api/notifications/").status_code in (401, 403)


@pytest.mark.django_db
def test_admin_can_set_the_expiry_hours_and_reminders(logged_in):
    admin, _ = logged_in("admin")
    response = admin.patch(
        "/api/admin/settings/",
        {
            "booking": {
                "approval_hours": 12,
                "approval_reminder_first_hours": 1,
                "approval_reminder_second_hours": 6,
            }
        },
        content_type="application/json",
    )
    assert response.status_code == 200, response.content
    bad = admin.patch(
        "/api/admin/settings/",
        {
            "booking": {
                "approval_hours": 4,
                "approval_reminder_first_hours": 5,
                "approval_reminder_second_hours": 6,
            }
        },
        content_type="application/json",
    )
    assert bad.status_code == 400


# ------------------------------------------------------------------- 13B: out of the admin's reach


ADMIN_DENIED = [
    ("get", "/api/desk/appointments/"),
    ("get", "/api/desk/schedule/"),
    ("post", "/api/desk/bookings/"),
]


@pytest.mark.django_db
@pytest.mark.parametrize("method,url", ADMIN_DENIED)
def test_admin_cannot_reach_appointments_or_schedule(logged_in, method, url):
    admin, _ = logged_in("admin")
    assert getattr(admin, method)(url).status_code == 403


@pytest.mark.django_db
def test_admin_cannot_act_on_a_booking_at_all(customer, desk, catalogue, logged_in):
    admin, _ = logged_in("admin")
    appt_id = asked(customer[0], catalogue)
    for action in ("confirm", "reject", "reassign", "move", "cancel", "check-in", "no-show"):
        assert post(admin, f"/api/desk/appointments/{appt_id}/{action}/").status_code in (403, 404)
    assert admin.get(f"/api/desk/appointments/{appt_id}/").status_code in (403, 404)
    assert appt_of(appt_id).status == S.REQUESTED


@pytest.mark.django_db
def test_stylist_calendar_shows_only_their_own_bookings(customer, desk, asha, ravi, catalogue):
    appt_id = asked(customer[0], catalogue)
    reception_accept(desk, appt_id)
    post(asha[0], f"/api/stylist/requests/{appt_id}/accept/")
    Appointment.objects.filter(pk=appt_id).update(status=S.SCHEDULED)  # paid
    day = day_at(3, 11).date().isoformat()
    mine = asha[0].get("/api/stylist/calendar/", {"from": day, "to": day}).json()["days"]
    assert [v["id"] for d in mine for v in d["visits"]] == [appt_id]
    others = ravi[0].get("/api/stylist/calendar/", {"from": day, "to": day}).json()["days"]
    assert [v for d in others for v in d["visits"]] == []
    text = str(mine)
    assert "priya@example.com" not in text and "9876543210" not in text
    assert ravi[0].get(f"/api/stylist/appointments/{appt_id}/").status_code == 404


@pytest.mark.django_db
def test_calendar_is_denied_to_everyone_but_stylists(customer, desk, logged_in):
    assert customer[0].get("/api/stylist/calendar/").status_code == 403
    assert desk[0].get("/api/stylist/calendar/").status_code == 403
    admin, _ = logged_in("admin")
    assert admin.get("/api/stylist/calendar/").status_code == 403
    assert Client().get("/api/stylist/calendar/").status_code in (401, 403)


@pytest.mark.django_db
def test_the_receptionist_keeps_the_shop_wide_board(customer, desk, catalogue):
    asked(customer[0], catalogue)
    assert desk[0].get("/api/desk/appointments/").status_code == 200
    assert desk[0].get("/api/desk/schedule/").status_code == 200


# ------------------------------------------------------------ 13C: sorry notes for staff changes


def booked_pair(customer, desk, asha, catalogue):
    appt_id = asked(customer[0], catalogue)
    reception_accept(desk, appt_id)
    post(asha[0], f"/api/stylist/requests/{appt_id}/accept/")
    assert appt_of(appt_id).status in (S.AWAITING_PAYMENT, S.SCHEDULED)
    return appt_id


def sorry_notes(user):
    return Notification.objects.filter(user=user, kind="slot_change")


@pytest.mark.django_db
def test_receptionist_move_sends_a_sorry_note_in_all_three_ways(customer, desk, asha, catalogue):
    appt_id = booked_pair(customer, desk, asha, catalogue)
    mails = MailOutbox.objects.count()
    sms = SimulatedSms.objects.count()
    new_start = day_at(4, 14)
    response = post(
        desk[0],
        f"/api/desk/appointments/{appt_id}/move/",
        {
            "stylist": str(catalogue["asha"].id),
            "start": new_start.isoformat(),
            "reason": "schedule_change",
        },
    )
    assert response.status_code == 200, response.content
    assert sorry_notes(customer[1]).count() == 1
    note = sorry_notes(customer[1]).first()
    assert "Priya" in note.body or "Priya" in note.title
    assert "sorry" in (note.title + note.body).lower()
    assert "a change in our schedule" in note.body
    assert MailOutbox.objects.count() > mails
    assert SimulatedSms.objects.count() > sms
    change = SlotChange.objects.get(appointment_id=appt_id)
    assert change.kind == "moved" and change.reason == "schedule_change"
    assert AuditLog.objects.filter(action=AuditLog.Action.SLOT_CHANGE_NOTIFIED).exists()
    seen = customer_view(customer[0], appt_id)
    assert seen["pending_change"]["can_accept"] is True


@pytest.mark.django_db
def test_staff_must_pick_a_reason_category_before_saving(customer, desk, asha, catalogue):
    appt_id = booked_pair(customer, desk, asha, catalogue)
    body = {"stylist": str(catalogue["asha"].id), "start": day_at(4, 14).isoformat()}
    assert post(desk[0], f"/api/desk/appointments/{appt_id}/move/", body).status_code == 400
    bad = post(desk[0], f"/api/desk/appointments/{appt_id}/move/", {**body, "reason": "busy"})
    assert bad.status_code == 400  # the stylist's private reasons are not a category
    assert post(desk[0], f"/api/desk/appointments/{appt_id}/cancel/", {}).status_code == 400
    assert not SlotChange.objects.exists()


@pytest.mark.django_db
def test_cancelling_sends_a_sorry_note_and_never_a_private_reason(customer, desk, asha, catalogue):
    appt_id = booked_pair(customer, desk, asha, catalogue)
    response = post(
        desk[0],
        f"/api/desk/appointments/{appt_id}/cancel/",
        {"reason": "staff_emergency", "note": "internal: stylist unwell"},
    )
    assert response.status_code == 200, response.content
    assert appt_of(appt_id).status == S.CANCELLED
    note = sorry_notes(customer[1]).get()
    assert "an unexpected staff emergency" in note.body
    seen = str(customer_view(customer[0], appt_id)) + str(
        customer[0].get("/api/notifications/").json()
    )
    assert "stylist unwell" not in seen
    assert "stylist unwell" not in "".join(m.body for m in MailOutbox.objects.all())
    pending = customer_view(customer[0], appt_id)["pending_change"]
    assert pending["kind"] == "cancelled" and pending["can_accept"] is False


@pytest.mark.django_db
def test_stylist_moving_or_cancelling_their_own_visit_also_says_sorry(
    customer, desk, asha, catalogue
):
    appt_id = booked_pair(customer, desk, asha, catalogue)
    Appointment.objects.filter(pk=appt_id).update(status=S.SCHEDULED)
    new_start = day_at(4, 15)
    moved = post(
        asha[0],
        f"/api/stylist/appointments/{appt_id}/move/",
        {"start": new_start.isoformat(), "reason": "stylist_unavailable"},
    )
    assert moved.status_code == 200, moved.content
    assert sorry_notes(customer[1]).count() == 1
    cancelled = post(
        asha[0],
        f"/api/stylist/appointments/{appt_id}/cancel/",
        {"reason": "staff_emergency"},
    )
    assert cancelled.status_code == 200, cancelled.content
    assert sorry_notes(customer[1]).count() == 2
    assert SlotChange.objects.filter(appointment_id=appt_id, actor_role="stylist").count() == 2


@pytest.mark.django_db
def test_reassigning_to_another_stylist_says_sorry(customer, desk, asha, ravi, catalogue):
    appt_id = booked_pair(customer, desk, asha, catalogue)
    response = post(
        desk[0],
        f"/api/desk/appointments/{appt_id}/move/",
        {
            "stylist": str(catalogue["ravi"].id),
            "start": day_at(3, 11).isoformat(),
            "reason": "stylist_unavailable",
        },
    )
    assert response.status_code == 200, response.content
    change = SlotChange.objects.get(appointment_id=appt_id)
    assert change.kind == "reassigned" and change.new_stylist_name == "Ravi"
    assert sorry_notes(customer[1]).count() == 1


@pytest.mark.django_db
def test_customer_changes_never_send_a_sorry_note(customer, desk, asha, catalogue):
    appt_id = booked_pair(customer, desk, asha, catalogue)
    post(
        customer[0],
        f"/api/my/appointments/{appt_id}/reschedule/",
        {"preferred": day_at(5, 10).isoformat()},
    )
    post(customer[0], f"/api/my/appointments/{appt_id}/cancel/", {"reason": "plans changed"})
    assert not sorry_notes(customer[1]).exists()
    assert not SlotChange.objects.exists()


@pytest.mark.django_db
def test_a_retry_does_not_send_a_second_sorry_note(customer, desk, asha, catalogue):
    appt_id = booked_pair(customer, desk, asha, catalogue)
    body = {
        "stylist": str(catalogue["asha"].id),
        "start": day_at(4, 14).isoformat(),
        "reason": "schedule_change",
    }
    post(desk[0], f"/api/desk/appointments/{appt_id}/move/", body)
    post(desk[0], f"/api/desk/appointments/{appt_id}/move/", body)  # a double click or retry
    assert sorry_notes(customer[1]).count() == 1
    assert SlotChange.objects.filter(appointment_id=appt_id).count() == 1


@pytest.mark.django_db
def test_the_three_buttons_work_only_for_the_customers_own_booking(
    customer, desk, asha, catalogue, make_user
):
    appt_id = booked_pair(customer, desk, asha, catalogue)
    post(
        desk[0],
        f"/api/desk/appointments/{appt_id}/move/",
        {
            "stylist": str(catalogue["asha"].id),
            "start": day_at(4, 14).isoformat(),
            "reason": "schedule_change",
        },
    )
    # Someone else's customer account cannot answer for this booking.
    other = make_user(role="customer", email="other@example.com")
    stranger = Client()
    login(stranger, other)
    for answer in ("accept", "rebook", "cancel"):
        assert (
            post(
                stranger, f"/api/my/appointments/{appt_id}/change/", {"response": answer}
            ).status_code
            == 404
        )
    assert (
        desk[0].post(f"/api/my/appointments/{appt_id}/change/", {"response": "accept"}).status_code
        == 403
    )
    assert SlotChange.objects.get().response == "pending"
    # The owner can.
    ok = post(customer[0], f"/api/my/appointments/{appt_id}/change/", {"response": "accept"})
    assert ok.status_code == 200, ok.content
    assert SlotChange.objects.get().response == "accepted"
    assert customer_view(customer[0], appt_id)["pending_change"] is None


@pytest.mark.django_db
def test_customer_can_cancel_with_a_refund_after_a_staff_move(customer, desk, asha, catalogue):
    appt_id = booked_pair(customer, desk, asha, catalogue)
    post(
        desk[0],
        f"/api/desk/appointments/{appt_id}/move/",
        {
            "stylist": str(catalogue["asha"].id),
            "start": day_at(4, 14).isoformat(),
            "reason": "room_or_equipment",
        },
    )
    response = post(customer[0], f"/api/my/appointments/{appt_id}/change/", {"response": "cancel"})
    assert response.status_code == 200, response.content
    assert appt_of(appt_id).status == S.CANCELLED
    assert SlotChange.objects.get().response == "cancelled"


@pytest.mark.django_db
def test_stylists_and_customers_cannot_use_the_desk_move_and_cancel(
    customer, desk, asha, catalogue
):
    appt_id = booked_pair(customer, desk, asha, catalogue)
    body = {
        "stylist": str(catalogue["asha"].id),
        "start": day_at(4, 14).isoformat(),
        "reason": "other",
    }
    assert post(customer[0], f"/api/desk/appointments/{appt_id}/move/", body).status_code == 403
    assert post(asha[0], f"/api/desk/appointments/{appt_id}/move/", body).status_code == 403
    assert (
        post(asha[0], f"/api/desk/appointments/{appt_id}/cancel/", {"reason": "other"}).status_code
        == 403
    )
    assert not SlotChange.objects.exists()
