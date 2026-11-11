"""Who accepted my request, and the shared sorry notes.

The front desk's yes is recorded once (`scheduling.acceptance.record`) whether a receptionist or
AIR gave it. Customers see only the actor type and a ready-made label; the receptionist's name
and id, and a stylist's private decline reason, never reach a customer response.
"""

import importlib
import re
from datetime import timedelta

import pytest
from django.apps import apps as django_apps
from django.test import Client
from django.utils import timezone

from air import config
from air.models import AIActionLog
from billing.models import Payment
from conftest import login
from core import mail
from core.models import MailOutbox
from notifications import sorry, templates
from notifications.models import Notification, SimulatedSms
from scheduling import acceptance, approvals, booking, timeline
from scheduling.models import Appointment, AppointmentStatus, SlotChange
from scheduling.tests.test_booking import day_at
from scheduling.tests.test_dual_approval import post, stylist_pair

from .test_desk_cover import send_form, stylist_accepts

S = AppointmentStatus
FRONT_DESK = "Accepted by our front desk"
AIR_LABEL = "Accepted by AIR, our virtual receptionist (the front desk was closed)"


@pytest.fixture
def customer(shopper):
    """(a signed-in browser for the customer, the customer)."""
    client = Client()
    assert login(client, shopper).status_code == 200
    return client, shopper


@pytest.fixture
def asha(make_user, catalogue):
    return stylist_pair(make_user, catalogue["asha"])


@pytest.fixture
def commits(django_capture_on_commit_callbacks):
    """Runs the after-commit hooks, as the real server does when a request finishes."""

    def run():
        return django_capture_on_commit_callbacks(execute=True)

    return run


def air_off():
    obj = config.get_settings()
    obj.air_enabled = False
    obj.save()


def receptionist_accepts(appt, user):
    with_commit = approvals.reception_accept(appt.pk, actor=user)
    return with_commit


def bell(user):
    return " ".join(
        f"{n.title} {n.body}" for n in Notification.objects.filter(user=user).order_by("created_at")
    )


def mails(email="priya@example.com"):
    return " ".join(m.subject + " " + m.body for m in MailOutbox.objects.filter(to_email=email))


# ------------------------------------------------------------ the two ways of accepting


@pytest.mark.django_db
def test_a_receptionist_acceptance_shows_the_front_desk_label_everywhere(
    air_on, customer, asha, catalogue, commits, reception_user
):
    air_off()
    client, shopper = customer
    appt = send_form(client, catalogue, commits)
    with commits():
        receptionist_accepts(appt, reception_user)
    appt.refresh_from_db()
    assert appt.reception_actor == "receptionist"
    assert appt.reception_user_id == reception_user.id and appt.reception_accepted_at

    seen = client.get(f"/api/my/appointments/{appt.pk}/").json()
    assert seen["reception_actor"] == "receptionist" and seen["reception_label"] == FRONT_DESK
    step = next(s for s in seen["timeline"] if s["key"] == "front_desk")
    assert step["state"] == "done" and step["text"] == FRONT_DESK and step["at"]
    assert FRONT_DESK in bell(shopper)
    assert FRONT_DESK in mails()
    assert "virtual receptionist" not in bell(shopper) + mails()


@pytest.mark.django_db
def test_an_air_acceptance_shows_the_air_label_with_the_closed_desk_note_everywhere(
    air_on, customer, asha, catalogue, commits
):
    client, shopper = customer
    appt = send_form(client, catalogue, commits)
    appt.refresh_from_db()
    assert appt.reception_actor == "air" and appt.reception_user_id is None
    assert appt.reception_accepted_at is not None

    seen = client.get(f"/api/my/appointments/{appt.pk}/").json()
    assert seen["reception_actor"] == "air" and seen["reception_label"] == AIR_LABEL
    assert "front desk was closed" in seen["reception_label"]
    step = next(s for s in seen["timeline"] if s["key"] == "front_desk")
    assert step["state"] == "done" and step["text"] == AIR_LABEL
    stylist_accepts(asha, appt, commits)
    assert AIR_LABEL in bell(shopper)
    assert AIR_LABEL in mails()
    for text in (bell(shopper), mails()):
        assert not re.search(r"\bAIR (is|was) (a|an) (person|human|woman|man)\b", text, re.I)


@pytest.mark.django_db
def test_both_paths_use_the_same_service_function(
    air_on, customer, asha, catalogue, commits, reception_user, monkeypatch
):
    seen = []
    real = acceptance.record

    def spy(appt, **kwargs):
        seen.append(kwargs)
        return real(appt, **kwargs)

    monkeypatch.setattr(acceptance, "record", spy)
    client, _ = customer
    send_form(client, catalogue, commits)  # AIR's way
    air_off()
    other = send_form(client, catalogue, commits, start=day_at(4, 14).isoformat())
    with commits():
        receptionist_accepts(other, reception_user)  # the person's way
    assert [bool(k.get("by_air")) for k in seen] == [True, False]


@pytest.mark.django_db
def test_a_booking_the_desk_confirms_itself_also_records_the_front_desk(
    air_on, customer, catalogue, commits, reception_user
):
    air_off()
    appt = send_form(customer[0], catalogue, commits)
    assert appt.reception_actor == ""
    booking.confirm(
        appt.pk,
        actor=reception_user,
        stylist=catalogue["asha"],
        start=appt.preferred_start,
        room=None,
    )
    appt.refresh_from_db()
    assert appt.reception_actor == "receptionist" and appt.reception_user_id == reception_user.id


# ------------------------------------------------------------ what customers can and cannot see


@pytest.mark.django_db
def test_the_customer_api_never_has_the_receptionists_name_or_id_or_a_private_reason(
    air_on, customer, asha, catalogue, commits, reception_user
):
    air_off()
    client, shopper = customer
    appt = send_form(client, catalogue, commits)
    with commits():
        receptionist_accepts(appt, reception_user)
    with commits():
        response = post(
            asha[0], f"/api/stylist/requests/{appt.pk}/decline/", {"reason": "personal_plans"}
        )
    assert response.status_code == 200
    everything = str(client.get("/api/my/appointments/").json())
    everything += str(client.get(f"/api/my/appointments/{appt.pk}/").json())
    everything += str(client.get("/api/notifications/").json()) + mails() + bell(shopper)
    everything += " ".join(s.body for s in SimulatedSms.objects.all())
    assert "Rita Desk" not in everything and str(reception_user.id) not in everything
    for private in ("Personal plans", "personal_plans", "Busy at that time", "Outside my working"):
        assert private not in everything
    assert "reception_user" not in everything and "confirmed_by" not in everything


@pytest.mark.django_db
def test_staff_views_keep_what_they_show_today(
    air_on, customer, asha, catalogue, commits, reception_user
):
    client, _ = customer
    by_air = send_form(client, catalogue, commits)
    air_off()
    desk_client = (Client(), reception_user)  # signs in only now: a person present stops AIR
    assert login(desk_client[0], reception_user).status_code == 200
    by_person = send_form(client, catalogue, commits, start=day_at(4, 14).isoformat())
    with commits():
        receptionist_accepts(by_person, reception_user)
    rows = {r["id"]: r for r in desk_client[0].get("/api/desk/appointments/").json()["results"]}
    assert rows[str(by_air.pk)]["reception_by_air"] is True
    assert rows[str(by_person.pk)]["reception_by_air"] is False
    assert rows[str(by_air.pk)]["reception_accepted_at"]


@pytest.mark.django_db
def test_a_customer_sees_only_their_own_requests(
    air_on, customer, other_shopper, asha, catalogue, commits
):
    appt = send_form(customer[0], catalogue, commits)
    other = Client()
    assert login(other, other_shopper).status_code == 200
    assert other.get(f"/api/my/appointments/{appt.pk}/").status_code == 404
    assert other.get("/api/my/appointments/").json() in ([], {"results": []}) or not str(
        other.get("/api/my/appointments/").json()
    ).count(str(appt.pk))


# ------------------------------------------------------------ the sorry notes


SAMPLE = {
    "first_name": "Priya",
    "service": "Haircut",
    "when": "Wed 11 Nov 2026, 11:00 AM",
    "old_when": "Wed 11 Nov 2026, 11:00 AM",
    "new_when": "Thu 12 Nov 2026, 02:00 PM",
    "stylist": "Asha K",
    "stylist_first": "Asha",
    "reason": "a change in our schedule",
    "next_slots": sorry.next_slots_sentence("Thu 12 Nov 2026, 10:00 AM; Thu 12 Nov 2026, 11:00 AM"),
    "contact": sorry.contact_sentence("+91 90000 00000"),
    "payment_note": templates.PAYMENT_NOTES["none"],
}


@pytest.mark.parametrize("event", sorted(sorry.APOLOGY_EVENTS))
def test_every_apology_event_has_all_five_parts(event):
    five = {
        name: templates.render_text(text, **SAMPLE) for name, text in sorry.parts(event).items()
    }
    assert list(five) == list(sorry.PARTS_ORDER) and all(five.values())
    assert "sorry" in five["apology"].lower()
    assert SAMPLE["service"] in five["what"]
    assert five["next"]
    assert "+91 90000 00000" in five["step"]
    assert five["money"] == templates.PAYMENT_NOTES["none"]
    key = sorry.APOLOGY_EVENTS[event]
    body = templates.render(key, "body", **SAMPLE)
    assert all(part in body for part in five.values())
    assert "sorry" in templates.render(key, "sms", **SAMPLE).lower()
    assert "sorry" in templates.render(key, "subject", **SAMPLE).lower()


def test_the_stylist_decline_copy_matches_the_agreed_wording():
    body = templates.render("customer_declined_by_stylist", "body", **SAMPLE)
    assert body.startswith(
        "We're sorry, Asha is not able to take this slot. We know this isn't what you were "
        "hoping for."
    )
    assert "Here are the nearest times that are free: Thu 12 Nov 2026, 10:00 AM;" in body
    assert "You can also call us on +91 90000 00000." in body


def test_no_slots_means_book_again_and_no_phone_means_the_front_desk():
    assert "book again" in sorry.next_slots_sentence("").lower()
    assert sorry.contact_sentence("") == "You can also contact our front desk."


def test_apology_templates_name_no_staff_and_give_no_private_reason_or_invented_promise():
    for key in set(sorry.APOLOGY_EVENTS.values()) | set(sorry.ALIASES):
        for field in ("title", "body", "sms", "subject"):
            text = templates.TEMPLATES[key][field]
            assert "{stylist}" not in text  # only the first name placeholder is allowed
            assert "{reception" not in text
            private_words = [v for k, v in templates.DECLINE_REASONS.items() if k != "other"]
            for private in (*private_words, "personal_plans", "personal plans"):
                assert private.lower() not in text.lower()
            assert not re.search(
                r"within \d|\d+ (hours?|days?|minutes?)|guarantee|promise", text, re.I
            )
    # The money sentence can only be one of the four real ones.
    assert set(templates.PAYMENT_NOTES) == {"valid", "refund", "none", "contact"}
    assert (
        templates.PAYMENT_NOTES["contact"] == "Our front desk will contact you about your payment."
    )
    assert "Rs. {amount}" in templates.PAYMENT_NOTES["refund"]  # the amount is the real request


def test_good_news_and_customer_changes_never_apologise():
    for key in sorry.NON_APOLOGY_KEYS:
        if key not in templates.TEMPLATES:
            continue
        for field in ("title", "body", "sms", "subject"):
            if field in templates.TEMPLATES[key]:
                text = templates.TEMPLATES[key][field].lower()
                assert "sorry" not in text and "apolog" not in text, (key, field)
    assert "customer_front_desk_accepted" in templates.TEMPLATES


@pytest.mark.django_db
def test_a_change_the_customer_makes_is_acknowledged_without_an_apology(
    air_on, customer, asha, catalogue, commits, reception_user
):
    air_off()
    client, shopper = customer
    appt = send_form(client, catalogue, commits)
    with commits():
        receptionist_accepts(appt, reception_user)
        stylist_accepts(asha, appt, commits)
    appt.refresh_from_db()
    before = MailOutbox.objects.count()
    booking.customer_cancel(appt.pk, customer=shopper, reason="Plans changed")
    new = MailOutbox.objects.order_by("created_at")[before:]
    assert new
    assert all("sorry" not in (m.subject + m.body).lower() for m in new)
    assert any("cancelled" in m.body for m in new)


@pytest.mark.django_db
def test_emails_have_text_and_html_and_escape_every_value(
    air_on, customer, asha, catalogue, commits
):
    air_off()
    client, shopper = customer
    appt = send_form(client, catalogue, commits)
    Appointment.objects.filter(pk=appt.pk).update(contact_name="<b>Eve</b> & Co")
    appt.refresh_from_db()
    from notifications import service as notify_service

    notify_service.tell_customer(appt, "booking_outcome", "customer_declined_by_stylist")
    message = MailOutbox.objects.order_by("-created_at").first()
    text, html = mail.render_message(message)
    assert "<b>Eve</b>" in text and "sorry" in text.lower()
    assert "&lt;b&gt;Eve&lt;/b&gt;" in html and "<b>Eve</b>" not in html
    assert "<img" not in html.lower() and "pixel" not in html.lower()
    assert "sorry" in message.subject.lower()
    # five short paragraphs in the plain text
    assert text.count("\n\n") >= 5


@pytest.mark.django_db
def test_a_stylist_decline_sends_a_real_sorry_note_with_slots_and_no_name_but_the_first(
    air_on, customer, asha, catalogue, commits, reception_user
):
    air_off()
    client, shopper = customer
    appt = send_form(client, catalogue, commits)
    with commits():
        receptionist_accepts(appt, reception_user)
    with commits():
        post(asha[0], f"/api/stylist/requests/{appt.pk}/decline/", {"reason": "busy"})
    note = Notification.objects.filter(user=shopper).order_by("-created_at").first()
    first = catalogue["asha"].display_name.split(" ")[0]
    assert note.body.startswith(f"We're sorry, {first} is not able to take this slot.")
    assert "Nothing has been charged." in note.body
    assert "Rita" not in note.body
    seen = client.get(f"/api/my/appointments/{appt.pk}/").json()
    assert seen["sorry_note"]["event"] == "stylist_declined"
    assert seen["sorry_note"]["text"] == note.body  # the page and the bell agree word for word
    assert seen["sorry_note"]["nearest_slots"]


# ------------------------------------------------------------ the page: timeline and sorry notes


_days = iter(range(6, 60))


def make_appt(customer_pair, catalogue, commits, **fields):
    appt = send_form(
        customer_pair[0], catalogue, commits, start=day_at(next(_days), 11).isoformat()
    )
    if fields:
        Appointment.objects.filter(pk=appt.pk).update(**fields)
    return Appointment.objects.get(pk=appt.pk)


def states(appt):
    return {s["key"]: s["state"] for s in timeline.timeline(appt)}


@pytest.mark.django_db
def test_the_timeline_renders_for_every_state(air_on, customer, asha, catalogue, commits):
    air_off()
    fresh = make_appt(customer, catalogue, commits)
    assert [s["label"] for s in timeline.timeline(fresh)] == [
        "Requested",
        "Front desk accepted",
        "Stylist accepted",
        "Payment link sent",
        "Paid",
        "Confirmed",
    ]
    assert states(fresh) == {
        "requested": "done",
        "front_desk": "waiting",
        "stylist": "waiting",
        "payment_link": "waiting",
        "paid": "waiting",
        "confirmed": "waiting",
    }
    assert [s["text"] for s in timeline.timeline(fresh)][1:] == ["Waiting"] * 5

    declined = make_appt(customer, catalogue, commits, status=S.DECLINED_BY_STYLIST)
    assert states(declined)["stylist"] == "problem" and states(declined)["confirmed"] == "stopped"
    refused = make_appt(customer, catalogue, commits, status=S.DECLINED_BY_RECEPTION)
    assert states(refused)["front_desk"] == "problem"
    expired = make_appt(customer, catalogue, commits, status=S.EXPIRED)
    assert states(expired)["front_desk"] == "stopped"
    lapsed = make_appt(
        customer, catalogue, commits, status=S.PAYMENT_EXPIRED, reception_actor="receptionist"
    )
    assert states(lapsed)["payment_link"] in ("problem", "stopped")
    cancelled = make_appt(customer, catalogue, commits, status=S.CANCELLED)
    assert states(cancelled)["confirmed"] == "stopped"


@pytest.mark.django_db
def test_the_timeline_shows_each_actor_then_payment_link_expiry_paid_and_confirmed(
    air_on, customer, asha, catalogue, commits, reception_user, shopper
):
    client, shopper = customer
    appt = send_form(client, catalogue, commits)  # AIR accepts
    assert next(s for s in timeline.timeline(appt) if s["key"] == "front_desk")["text"] == AIR_LABEL
    stylist_accepts(asha, appt, commits)
    steps = {s["key"]: s for s in timeline.timeline(appt)}
    assert steps["stylist"]["state"] == "done"
    assert catalogue["asha"].display_name in steps["stylist"]["text"]
    assert steps["payment_link"]["state"] == "done" and "pay by" in steps["payment_link"]["text"]
    assert steps["payment_link"]["expires_at"]
    assert steps["paid"]["state"] == "waiting" and steps["confirmed"]["state"] == "waiting"

    from air.tests.conftest import payment_token_for

    with commits():
        paid, ok = booking.pay(
            appt.pk, customer=shopper, token=payment_token_for(appt), succeed=True
        )
    assert ok
    paid = Appointment.objects.get(pk=appt.pk)
    done = {s["key"]: s["state"] for s in timeline.timeline(paid)}
    assert done["paid"] == "done" and done["confirmed"] == "done"


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("status", "event"),
    [
        (S.DECLINED_BY_STYLIST, "stylist_declined"),
        (S.DECLINED_BY_RECEPTION, "reception_declined"),
        (S.EXPIRED, "timed_out"),
        (S.PAYMENT_EXPIRED, "link_expired"),
    ],
)
def test_declined_and_expired_states_show_a_sorry_note_with_the_next_action(
    air_on, customer, asha, catalogue, commits, status, event
):
    air_off()
    appt = make_appt(customer, catalogue, commits, status=status)
    seen = customer[0].get(f"/api/my/appointments/{appt.pk}/").json()
    note = seen["sorry_note"]
    assert note["event"] == event and set(note["parts"]) == set(sorry.PARTS_ORDER)
    assert all(note["parts"].values()) and "sorry" in note["parts"]["apology"].lower()
    assert note["nearest_slots"] and all(s["start"] and s["label"] for s in note["nearest_slots"])
    assert "Nothing has been charged." in note["parts"]["money"]


@pytest.mark.django_db
def test_a_salon_move_and_a_salon_cancellation_show_a_sorry_note_but_the_customers_own_do_not(
    air_on, customer, asha, catalogue, commits, reception_user
):
    air_off()
    appt = make_appt(customer, catalogue, commits, status=S.SCHEDULED)
    SlotChange.objects.create(
        appointment=appt,
        seq=1,
        kind="moved",
        reason="schedule_change",
        old_start=appt.preferred_start,
        new_start=appt.preferred_start + timedelta(days=1),
    )
    note = timeline.sorry_note(Appointment.objects.get(pk=appt.pk))
    assert note["event"] == "moved" and "a change in our schedule" in note["parts"]["what"]
    assert "Nothing has been charged." in note["parts"]["money"]

    Appointment.objects.filter(pk=appt.pk).update(status=S.CANCELLED)
    SlotChange.objects.create(
        appointment=appt,
        seq=2,
        kind="cancelled",
        reason="staff_emergency",
        old_start=appt.preferred_start,
    )
    assert timeline.sorry_note(Appointment.objects.get(pk=appt.pk))["event"] == "cancelled"

    # The customer cancelled for themself (no salon cancellation recorded): no apology.
    mine = make_appt(customer, catalogue, commits, status=S.CANCELLED)
    assert timeline.sorry_note(mine) is None
    # Good news states never get one either.
    ok = make_appt(customer, catalogue, commits, status=S.SCHEDULED)
    assert timeline.sorry_note(ok) is None


@pytest.mark.django_db
def test_a_paid_booking_the_salon_cancels_says_only_what_the_refund_flow_does(
    air_on, customer, asha, catalogue, commits
):
    air_off()
    from billing.models import Refund

    appt = make_appt(customer, catalogue, commits, status=S.CANCELLED)
    payment = Payment.objects.create(
        appointment=appt, amount="300.00", status=Payment.Status.SUCCEEDED, method="card"
    )
    SlotChange.objects.create(
        appointment=appt,
        seq=1,
        kind="cancelled",
        reason="staff_emergency",
        old_start=appt.preferred_start,
    )
    note = timeline.sorry_note(Appointment.objects.get(pk=appt.pk))
    assert note["parts"]["money"] == "Our front desk will contact you about your payment."
    Refund.objects.create(
        payment=payment, amount="300.00", status=Refund.Status.PENDING_APPROVAL, reason="x"
    )
    note = timeline.sorry_note(Appointment.objects.get(pk=appt.pk))
    assert note["parts"]["money"] == (
        "We have asked our team to approve a refund of your online payment of Rs. 300.00."
    )


# ------------------------------------------------------------ the migration backfill


@pytest.mark.django_db
def test_the_migration_backfill_sets_the_right_actor_type(
    air_on, customer, asha, catalogue, commits, reception_user
):
    client, _ = customer
    by_air = send_form(client, catalogue, commits)
    air_off()
    by_person = send_form(client, catalogue, commits, start=day_at(4, 14).isoformat())
    with commits():
        receptionist_accepts(by_person, reception_user)
    untouched = send_form(client, catalogue, commits, start=day_at(5, 15).isoformat())
    assert AIActionLog.objects.filter(booking_ref=by_air.pk, action_type="accept_reception")
    # Pretend these rows pre-date the new fields.
    Appointment.objects.update(reception_actor="", reception_user=None, reception_accepted_at=None)
    Appointment.objects.filter(pk=by_person.pk).update(confirmed_by=reception_user)

    migration = importlib.import_module("scheduling.migrations.0010_reception_acceptance")
    migration.backfill(django_apps, None)

    air_row = Appointment.objects.get(pk=by_air.pk)
    person_row = Appointment.objects.get(pk=by_person.pk)
    assert air_row.reception_actor == "air" and air_row.reception_user_id is None
    assert air_row.reception_accepted_at is not None
    assert person_row.reception_actor == "receptionist"
    assert person_row.reception_user_id == reception_user.id
    assert person_row.reception_accepted_at is not None
    assert Appointment.objects.get(pk=untouched.pk).reception_actor == ""
    assert timezone.now() - person_row.reception_accepted_at < timedelta(minutes=5)
