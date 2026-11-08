"""The customer chat in basic (rule-based) mode: slot filling, holds, summary card, Send request,
who may use it, and how it behaves with and without desk cover."""

from datetime import datetime, timedelta

import pytest
from conftest import login
from django.test import Client
from django.utils import timezone

from accounts import work
from air.models import AIActionLog, AirRequestState, SlotHold
from air.tests.conftest import day_at, stylist_says_yes
from people.models import Rating
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus, Service
from website.models import SiteContent

S = AppointmentStatus


def signed_in(user):
    client = Client()
    assert login(client, user).status_code == 200
    return client


def ask(client, message=None, *, pick=None, sid="", basic=True):
    body = {"basic_mode": basic}
    if message is not None:
        body["message"] = message
    if pick is not None:
        body["pick"] = pick
    if sid:
        body["session_id"] = sid
    return client.post("/api/air/chat/", body, content_type="application/json")


def reply_of(response):
    assert response.status_code == 200, response.content
    data = response.json()
    return data["session_id"], data["reply"]


def date_text(days):
    d = day_at(days, 11)
    return f"{d.day}/{d.month}"


def send(client, sid, hold_id):
    return client.post(
        "/api/my/air/send-request/",
        {"hold_id": hold_id, "session_id": sid},
        content_type="application/json",
    )


def local_of(chip):
    return booking.local(datetime.fromisoformat(chip["pick"]["start"]))


def hour_of(chip):
    return local_of(chip).hour


def close_day(code):
    SiteContent.objects.update_or_create(
        key="booking", defaults={"value": {"weekly_hours": {code: None}}, "is_published": True}
    )


# ---------------------------------------------------------------- the booking card and the button


@pytest.mark.django_db
def test_a_full_request_in_one_sentence_holds_the_slot_and_shows_the_card(shopper, catalogue):
    client = signed_in(shopper)
    sid, reply = reply_of(ask(client, f"book haircut on {date_text(3)} at 11am with asha"))
    card = reply["card"]
    assert card["type"] == "booking" and card["service"] == "Haircut"
    assert card["stylist"] == "Asha" and card["price"].startswith("Rs.")
    assert card["gst_included"].startswith("Rs.") and card["duration_minutes"] == 30
    assert card["buttons"] == ["send", "change"]
    assert "only after" in reply["text"]  # never "confirmed" before payment
    hold = SlotHold.objects.get(pk=card["hold_id"])
    assert hold.customer_id == shopper.pk and hold.status == SlotHold.Status.ACTIVE
    assert Appointment.objects.count() == 0  # nothing is requested until the button is pressed


@pytest.mark.django_db
def test_send_request_is_the_only_thing_that_creates_the_request(shopper, catalogue):
    client = signed_in(shopper)
    sid, reply = reply_of(ask(client, f"book haircut on {date_text(3)} at 11am with asha"))
    for words in ("yes", "confirm", "yes please confirm my booking now", "send request"):
        ask(client, words, sid=sid)
    assert Appointment.objects.count() == 0  # words never submit
    response = send(client, sid, reply["card"]["hold_id"])
    assert response.status_code == 201, response.content
    body = response.json()
    appt = Appointment.objects.get(pk=body["request_id"])
    assert appt.status == S.REQUESTED and appt.customer_id == shopper.pk
    assert AirRequestState.objects.filter(appointment=appt).exists()
    assert "only after" in body["reply"]["text"] and "15 minutes" in body["reply"]["text"]
    again = send(client, sid, reply["card"]["hold_id"])
    assert again.json()["request_id"] == body["request_id"]
    assert Appointment.objects.count() == 1


@pytest.mark.django_db
def test_missing_slots_are_asked_one_at_a_time(shopper, catalogue):
    client = signed_in(shopper)
    sid, reply = reply_of(ask(client, "I want to book"))
    assert "Which service" in reply["text"] and reply["chips"]
    sid, reply = reply_of(ask(client, "haircut", sid=sid))
    assert "Which day" in reply["text"]
    assert [c["label"] for c in reply["chips"]][:2] == ["Today", "Tomorrow"]
    sid, reply = reply_of(ask(client, pick=reply["chips"][3]["pick"], sid=sid))
    assert "Free times" in reply["text"] and reply["chips"]
    sid, reply = reply_of(ask(client, pick=reply["chips"][0]["pick"], sid=sid))
    assert reply["card"]["type"] == "booking"


# ---------------------------------------------------------------- slot extraction (basic mode)


@pytest.mark.django_db
def test_hinglish_and_telugu_wording_fill_the_slots(shopper, catalogue):
    client = signed_in(shopper)
    _, reply = reply_of(ask(client, "kal evening haircut kavali"))
    assert reply["chips"], reply
    assert all(16 <= hour_of(c) < 20 for c in reply["chips"])
    tomorrow = booking.local(timezone.now() + timedelta(days=1)).date()
    assert str(tomorrow.day) in reply["text"]


@pytest.mark.django_db
def test_time_words_and_after_times(shopper, catalogue):
    client = signed_in(shopper)
    _, reply = reply_of(ask(client, f"haircut {date_text(3)} after 5"))
    assert reply["chips"] and all(hour_of(c) >= 17 for c in reply["chips"])
    _, reply = reply_of(ask(client, f"haircut {date_text(4)} morning"))
    assert reply["chips"] and all(10 <= hour_of(c) < 12 for c in reply["chips"])


@pytest.mark.django_db
def test_a_named_stylist_limits_the_times_to_that_stylist(shopper, catalogue):
    client = signed_in(shopper)
    _, reply = reply_of(ask(client, f"haircut {date_text(3)} evening with ravi"))
    assert reply["chips"] and all(c["label"].endswith("Ravi") for c in reply["chips"])
    _, reply = reply_of(ask(client, f"haircut {date_text(3)} 11am any stylist"))
    assert reply["card"]["type"] == "booking"


@pytest.mark.django_db
def test_a_service_we_do_not_offer_asks_which_one(shopper, catalogue):
    client = signed_in(shopper)
    _, reply = reply_of(ask(client, f"book laser hair removal {date_text(3)} 11am"))
    assert "Which service" in reply["text"]
    assert {c["label"] for c in reply["chips"]} == {"Haircut", "Facial"}


@pytest.mark.django_db
def test_an_inactive_service_is_not_offered_or_held(shopper, catalogue):
    Service.objects.filter(pk=catalogue["facial"].pk).update(is_active=False)
    client = signed_in(shopper)
    _, reply = reply_of(ask(client, f"book facial {date_text(3)} 11am"))
    assert "Which service" in reply["text"]
    assert [c["label"] for c in reply["chips"]] == ["Haircut"]
    assert SlotHold.objects.count() == 0


@pytest.mark.django_db
def test_a_past_date_is_not_accepted(shopper, catalogue):
    client = signed_in(shopper)
    _, reply = reply_of(ask(client, "book haircut on 1/1/2020 at 5pm"))
    assert "already passed" in reply["text"]
    assert reply["chips"][0]["label"] == "Today"
    assert SlotHold.objects.count() == 0


@pytest.mark.django_db
def test_a_closed_day_says_so_and_offers_the_nearest_free_times(shopper, catalogue):
    target = booking.local(timezone.now()).date() + timedelta(days=4)
    close_day(["mon", "tue", "wed", "thu", "fri", "sat", "sun"][target.weekday()])
    client = signed_in(shopper)
    _, reply = reply_of(ask(client, f"haircut {target.day}/{target.month} at 11am"))
    assert "closed" in reply["text"].lower()
    assert reply["chips"], reply  # real nearest free times on open days
    assert all(local_of(c).date() != target for c in reply["chips"])


@pytest.mark.django_db
def test_a_taken_time_offers_the_nearest_alternatives(air_on, shopper, other_shopper, catalogue):
    from air.tests.conftest import make_hold

    make_hold(other_shopper, catalogue, hour=11, days=3, stylist="asha", session="o-1")
    client = signed_in(shopper)
    _, reply = reply_of(ask(client, f"haircut {date_text(3)} at 11am with asha"))
    assert "Nothing is free" in reply["text"]
    assert reply["chips"] and all(c["pick"]["kind"] == "slot" for c in reply["chips"])


@pytest.mark.django_db
def test_changing_the_wish_releases_the_old_hold(shopper, catalogue):
    client = signed_in(shopper)
    sid, first = reply_of(ask(client, f"haircut {date_text(3)} 11am"))
    sid, second = reply_of(ask(client, f"actually {date_text(4)} 12pm", sid=sid))
    assert second["card"]["hold_id"] != first["card"]["hold_id"]
    assert SlotHold.objects.get(pk=first["card"]["hold_id"]).status == SlotHold.Status.RELEASED
    sid, third = reply_of(ask(client, pick={"kind": "change"}, sid=sid))
    assert SlotHold.objects.get(pk=second["card"]["hold_id"]).status == SlotHold.Status.RELEASED
    assert third["card"] is None


# ---------------------------------------------------------------- cover and the dual approval


@pytest.mark.django_db
def test_during_cover_air_accepts_only_the_receptionist_side(air_on, shopper, catalogue):
    client = signed_in(shopper)
    sid, reply = reply_of(ask(client, f"haircut {date_text(3)} 11am with asha"))
    body = send(client, sid, reply["card"]["hold_id"]).json()
    appt = Appointment.objects.get(pk=body["request_id"])
    assert appt.reception_status == "accepted" and appt.stylist_status == "pending"
    assert appt.status == S.REQUESTED  # still needs the stylist
    assert AIActionLog.objects.filter(action_type="accept_reception").count() == 1
    assert "AIR is covering the front desk" in body["reply"]["text"]
    stylist_says_yes(appt, catalogue)
    appt.refresh_from_db()
    assert appt.status == S.AWAITING_PAYMENT


@pytest.mark.django_db
def test_with_a_receptionist_present_the_request_waits_for_a_person(
    air_on, shopper, catalogue, reception_user
):
    work.start(reception_user)
    client = signed_in(shopper)
    sid, reply = reply_of(ask(client, f"haircut {date_text(3)} 11am with asha"))
    body = send(client, sid, reply["card"]["hold_id"]).json()
    appt = Appointment.objects.get(pk=body["request_id"])
    assert appt.reception_status == "pending" and appt.status == S.REQUESTED
    assert not AIActionLog.objects.filter(action_type="accept_reception").exists()
    assert "front desk will look at it" in body["reply"]["text"]


@pytest.mark.django_db
def test_with_air_switched_off_the_chat_still_works_and_a_person_answers(shopper, catalogue):
    client = signed_in(shopper)
    sid, reply = reply_of(ask(client, f"haircut {date_text(3)} 11am with asha"))
    body = send(client, sid, reply["card"]["hold_id"]).json()
    appt = Appointment.objects.get(pk=body["request_id"])
    assert appt.reception_status == "pending"
    assert not AIActionLog.objects.filter(action_type="accept_reception").exists()


@pytest.mark.django_db
def test_the_15_minute_stylist_window_and_the_45_minute_link(air_on, shopper, catalogue):
    client = signed_in(shopper)
    sid, reply = reply_of(ask(client, f"haircut {date_text(3)} 11am with asha"))
    appt = Appointment.objects.get(
        pk=send(client, sid, reply["card"]["hold_id"]).json()["request_id"]
    )
    assert abs((appt.approval_expires_at - timezone.now()) - timedelta(minutes=15)) < timedelta(
        seconds=30
    )
    approved = stylist_says_yes(appt, catalogue)
    gap = approved.awaiting_payment_until - timezone.now()
    assert timedelta(minutes=44) < gap <= timedelta(minutes=45)


# ---------------------------------------------------------------- blocks and denials


@pytest.mark.django_db
def test_the_mandatory_rating_block_links_to_the_rating_screen(shopper, catalogue):
    done = Appointment.objects.create(
        customer=shopper,
        service=catalogue["haircut"],
        service_name="Haircut",
        duration_minutes=30,
        price_total=300,
        gst_amount=0,
        policy_accepted_at=timezone.now(),
        amount_payable=300,
        status=S.COMPLETED,
        contact_name="Priya",
        contact_email=shopper.email,
        preferred_start=timezone.now(),
    )
    Rating.objects.create(appointment=done, customer=shopper, status=Rating.Status.PENDING)
    client = signed_in(shopper)
    _, reply = reply_of(ask(client, f"haircut {date_text(3)} 11am"))
    assert "rate your recent visit" in reply["text"].lower()
    assert reply["actions"] == [{"label": "Rate your visit", "url": "/customer/book"}]
    assert SlotHold.objects.count() == 0


@pytest.mark.django_db
def test_a_customer_cannot_send_or_confirm_for_another_customer(
    air_on, shopper, other_shopper, catalogue
):
    mine = signed_in(shopper)
    sid, reply = reply_of(ask(mine, f"haircut {date_text(3)} 11am with asha"))
    theirs = signed_in(other_shopper)
    response = send(theirs, sid, reply["card"]["hold_id"])
    assert response.status_code == 400 and response.json()["code"] == "not_found"
    assert Appointment.objects.count() == 0
    # a pending change belongs to one chat: someone else's session id finds nothing
    nothing = theirs.post(
        "/api/my/air/confirm/",
        {"kind": "order", "session_id": sid},
        content_type="application/json",
    )
    assert nothing.status_code == 409


@pytest.mark.django_db
def test_logged_out_visitors_get_general_answers_only(shopper, catalogue):
    guest = Client()
    _, reply = reply_of(ask(guest, "book a haircut tomorrow"))
    assert reply["needs_login"] is True and reply["actions"][0]["url"] == "/login"
    _, reply = reply_of(ask(guest, "Opening hours"))
    assert reply["needs_login"] is False
    _, reply = reply_of(ask(guest, "talk to a person"))
    assert "call the salon" in reply["text"].lower()
    assert send(guest, "x" * 10, "00000000-0000-0000-0000-000000000000").status_code in (401, 403)
    assert SlotHold.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["receptionist", "stylist", "admin"])
def test_staff_accounts_are_refused(make_user, role):
    client = signed_in(make_user(role=role))
    assert ask(client, "hello").status_code == 403
    assert send(client, "x" * 10, "00000000-0000-0000-0000-000000000000").status_code == 403
    confirm = client.post(
        "/api/my/air/confirm/",
        {"kind": "order", "session_id": "x" * 10},
        content_type="application/json",
    )
    assert confirm.status_code == 403
    assert client.get("/api/my/air/consent/").status_code == 403


@pytest.mark.django_db
def test_unknown_buttons_and_forged_picks_change_nothing(shopper, catalogue):
    client = signed_in(shopper)
    for pick in (
        {"kind": "nonsense"},
        {"kind": "slot", "start": "yesterday", "stylist_id": "x"},
        {"kind": "service", "service_id": "not-a-uuid"},
        {"kind": "cancel_booking", "request_id": "00000000-0000-0000-0000-000000000000"},
    ):
        assert ask(client, pick=pick).status_code == 200
    assert SlotHold.objects.count() == 0 and Appointment.objects.count() == 0


@pytest.mark.django_db
def test_my_requests_shows_only_customer_visible_words(air_on, shopper, other_shopper, catalogue):
    mine = signed_in(shopper)
    sid, reply = reply_of(ask(mine, f"haircut {date_text(3)} 11am with asha"))
    send(mine, sid, reply["card"]["hold_id"])
    theirs = signed_in(other_shopper)
    sid2, other = reply_of(ask(theirs, f"haircut {date_text(3)} 2pm with asha"))
    send(theirs, sid2, other["card"]["hold_id"])
    _, status = reply_of(ask(mine, "where is my request"))
    assert "Haircut" in status["text"] and "waiting for your stylist" in status["text"]
    assert status["text"].count("Haircut") == 1  # only my own
    for internal in ("requested", "reception_status", "stylist_status", "declined"):
        assert internal not in status["text"].lower()
