"""AIR is a limited actor: deny by default. Allowed actions work in cover; everything else is
refused, and the other roles cannot reach AIR's admin endpoints."""

import json
from pathlib import Path

import pytest
from django.conf import settings
from django.test import Client

from accounts.models import AuditLog
from air import actor, handover, service
from air.models import AirRequestState, SlotHold
from air.tests.conftest import make_hold, stylist_says_yes, submit
from conftest import login
from core import policy
from people.models import Rating
from scheduling import approvals, booking
from scheduling.models import Appointment, AppointmentStatus

S = AppointmentStatus
POLICY = json.loads(Path(settings.SALON_POLICY_PATH).read_text(encoding="utf-8"))
AIR_SPEC = POLICY["service_actors"]["air"]


# ---------------------------------------------------------------- the allow-list itself


def test_policy_file_and_code_agree_on_the_allow_list():
    assert set(AIR_SPEC["allow"]) == set(actor.ALLOWED_ACTIONS)
    assert AIR_SPEC["login"] is False  # no login, no token, no UI session
    assert set(AIR_SPEC["cover_free"]) == set(actor.COVER_FREE) <= set(actor.ALLOWED_ACTIONS)
    assert set(AIR_SPEC["never"]) == set(actor.NEVER)
    assert (
        set(AIR_SPEC["customer_assist"]) == set(actor.CUSTOMER_ASSIST) <= set(actor.ALLOWED_ACTIONS)
    )
    assert not set(actor.CUSTOMER_ASSIST) & set(actor.NEVER)


def test_air_actions_are_not_real_api_actions():
    # AIR has no endpoint; its actions live only under service_actors, never in `actions`.
    assert not set(AIR_SPEC["allow"]) & set(POLICY["actions"])


@pytest.mark.parametrize("action", sorted(actor.ALLOWED_ACTIONS))
def test_every_allowed_action_is_allowed(action):
    assert policy.service_actor_can("air", action) is True
    assert actor.allowed(action) is True


@pytest.mark.parametrize("action", actor.NEVER)
def test_every_forbidden_action_is_refused(action):
    assert policy.service_actor_can("air", action) is False
    assert actor.allowed(action) is False
    with pytest.raises(actor.AirDenied) as denied:
        actor.require(action)
    assert denied.value.code == "not_allowed"


@pytest.mark.parametrize(
    "action",
    [
        "",
        "air",
        "air.refund.create",
        "air.stylist.accept",
        "air.price.change",
        "air.discount.apply",
        "admin.users.edit",
        "chat.photos.open",
        "AIR.SERVICES.READ",
    ],
)
def test_anything_not_listed_is_denied_by_default(action):
    assert actor.allowed(action) is False
    assert policy.service_actor_can("air", action) is False
    assert policy.service_actor_can("somebody_else", "air.services.read") is False


def test_air_code_has_no_path_to_the_forbidden_things():
    """AIR's own modules never call the stylist side, refunds, discounts or price changes."""
    root = Path(__file__).resolve().parents[1]
    banned = (
        "stylist_accept(",
        "stylist_decline(",
        "reception_decline(",
        "Refund.objects",
        "create_refund",
        "apply_discount",
        "price_total =",
        "waive_fee",
        "desk_cancel(",
        "customer_flag(",
        "ChatPhoto",
        "photos.open",
    )
    sources = [
        p for p in root.rglob("*.py") if "tests" not in p.parts and "migrations" not in p.parts
    ]
    assert sources
    for path in sources:
        text = path.read_text(encoding="utf-8")
        for word in banned:
            assert word not in text, f"{path.name} mentions {word}"


# ---------------------------------------------------------------- allowed actions work in cover


@pytest.mark.django_db
def test_allowed_actions_succeed_while_covering(air_on, shopper, catalogue):
    assert service.list_services()
    from air.tests.conftest import day_at

    slots = service.free_slots(
        service=catalogue["haircut"],
        variant_id=catalogue["short"].id,
        addon_ids=[],
        day=day_at(3, 11).date(),
    )
    assert slots
    hold = make_hold(shopper, catalogue)
    assert hold.status == SlotHold.Status.ACTIVE
    appt = submit(shopper, hold)
    assert appt.reception_status == "accepted"  # AIR accepted the receptionist side
    assert appt.status == S.REQUESTED and appt.stylist_status == "pending"
    assert service.my_requests(shopper)[0]["id"] == str(appt.pk)
    approvals_done = stylist_says_yes(appt, catalogue)
    assert approvals_done.status in (S.AWAITING_PAYMENT, S.SCHEDULED)
    handover.handoff(appt.pk, reason="customer_asked")
    assert AirRequestState.objects.get(appointment=appt).handed_to_desk is True


# ---------------------------------------------------------------- denied: outside cover


@pytest.mark.django_db
def test_nothing_works_while_air_is_off(shopper, catalogue):
    for call in (
        lambda: service.list_services(),
        lambda: service.my_requests(shopper),
        lambda: make_hold(shopper, catalogue),
    ):
        with pytest.raises(actor.AirDenied) as denied:
            call()
        assert denied.value.code == "outside_cover"
    assert SlotHold.objects.count() == 0


@pytest.mark.django_db
def test_nothing_works_while_a_receptionist_is_signed_in(
    air_on, reception_user, shopper, catalogue
):
    from accounts import work

    work.start(reception_user)
    with pytest.raises(actor.AirDenied) as denied:
        make_hold(shopper, catalogue)
    assert denied.value.code == "outside_cover"
    with pytest.raises(actor.AirDenied):
        service.list_services()


@pytest.mark.django_db
def test_air_cannot_accept_or_resend_once_cover_has_ended(
    air_on, reception_user, shopper, catalogue
):
    from accounts import work
    from air import links

    appt = submit(shopper, make_hold(shopper, catalogue))
    stylist_says_yes(appt, catalogue)
    work.start(reception_user)  # a person arrives: cover ends
    with pytest.raises(actor.AirDenied):
        links.resend(appt.pk)
    with pytest.raises(actor.AirDenied):
        service.accept_reception(appt.pk)


# ---------------------------------------------------------------- denied: what AIR may not do


@pytest.mark.django_db
def test_air_never_accepts_for_the_stylist(air_on, shopper, catalogue):
    appt = submit(shopper, make_hold(shopper, catalogue))
    appt.refresh_from_db()
    assert appt.reception_status == "accepted"
    assert appt.stylist_status == "pending"  # still waiting for the real stylist
    assert appt.status == S.REQUESTED
    assert not hasattr(service, "stylist_accept")
    assert actor.allowed("stylist.accept") is False


@pytest.mark.django_db
def test_air_accepts_only_requests_it_created_from_a_confirmed_session(air_on, shopper, catalogue):
    from air.tests.conftest import day_at

    plain = booking.create_request(
        customer=shopper,
        service=catalogue["haircut"],
        variant_id=catalogue["short"].id,
        addon_ids=[],
        start=day_at(4, 11),
        stylist=catalogue["asha"],
        contact={"name": "Priya", "email": shopper.email, "phone": ""},
        notes="",
        allergies="",
    )
    with pytest.raises(actor.AirDenied) as denied:
        service.accept_reception(plain.pk)
    assert denied.value.code == "not_air_request"
    plain.refresh_from_db()
    assert plain.reception_status == "pending"


@pytest.mark.django_db
def test_air_needs_the_customers_explicit_confirmation(air_on, shopper, catalogue):
    hold = make_hold(shopper, catalogue)
    with pytest.raises(actor.AirDenied) as denied:
        service.submit_booking(
            customer=shopper,
            hold_id=hold.pk,
            contact={"name": "x", "email": shopper.email, "phone": ""},
            session_id="sess-1",
            customer_confirmed=False,
        )
    assert denied.value.code == "not_confirmed"
    with pytest.raises(actor.AirDenied):
        service.submit_booking(
            customer=shopper,
            hold_id=hold.pk,
            contact={"name": "x", "email": shopper.email, "phone": ""},
            session_id="",
            customer_confirmed=True,
        )
    assert Appointment.objects.count() == 0


@pytest.mark.django_db
def test_air_cannot_book_for_another_customer_or_use_their_hold(
    air_on, shopper, other_shopper, catalogue
):
    hold = make_hold(shopper, catalogue)
    with pytest.raises(actor.AirDenied) as denied:
        submit(other_shopper, hold)
    assert denied.value.code == "not_found"
    assert Appointment.objects.count() == 0


@pytest.mark.django_db
def test_air_only_makes_holds_for_customer_accounts(air_on, reception_user, catalogue):
    with pytest.raises(actor.AirDenied) as denied:
        make_hold(reception_user, catalogue)
    assert denied.value.code == "not_a_customer"


@pytest.mark.django_db
def test_the_mandatory_rating_block_is_respected(air_on, shopper, catalogue):
    done = Appointment.objects.create(
        customer=shopper,
        service=catalogue["haircut"],
        service_name="Haircut",
        duration_minutes=30,
        price_total=300,
        gst_amount=0,
        policy_accepted_at=booking.timezone.now(),
        amount_payable=300,
        status=S.COMPLETED,
        contact_name="Priya",
        contact_email=shopper.email,
        preferred_start=booking.timezone.now(),
    )
    Rating.objects.create(appointment=done, customer=shopper, status=Rating.Status.PENDING)
    hold = make_hold(shopper, catalogue)
    with pytest.raises(booking.BookingError) as blocked:
        submit(shopper, hold)
    assert blocked.value.code == "ratings_pending"
    assert Appointment.objects.exclude(pk=done.pk).count() == 0


@pytest.mark.django_db
def test_air_reads_only_the_customers_own_requests_and_never_private_reasons(
    air_on, shopper, other_shopper, catalogue
):
    mine = submit(shopper, make_hold(shopper, catalogue))
    theirs = submit(
        other_shopper, make_hold(other_shopper, catalogue, hour=14, session="s2"), session="s2"
    )
    approvals.stylist_decline(
        theirs.pk, profile=catalogue["asha"], actor=None, reason="personal_plans"
    )
    rows = service.my_requests(shopper)
    assert [r["id"] for r in rows] == [str(mine.pk)]
    assert "personal_plans" not in json.dumps(service.my_requests(shopper), default=str)
    assert str(theirs.pk) not in json.dumps(rows, default=str)
    # The decline reached the other customer only as a polite note, never as the private reason.
    from notifications.models import Notification

    text = " ".join(n.title + n.body for n in Notification.objects.filter(user=other_shopper))
    assert "Personal plans" not in text and "personal_plans" not in text


@pytest.mark.django_db
def test_air_never_opens_chat_photos_or_staff_private_fields():
    import air

    root = Path(air.__file__).parent
    for path in root.rglob("*.py"):
        if "tests" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        assert "stylist_decline_reason" not in text.replace("# ", ""), path.name
        assert "chat.models" not in text and "ChatMessage" not in text


# ---------------------------------------------------------------- other roles cannot call AIR


ENDPOINTS = [
    ("get", "/api/admin/air/settings/"),
    ("patch", "/api/admin/air/settings/"),
    ("get", "/api/admin/air/cover/"),
    ("post", "/api/admin/air/cover/"),
    ("get", "/api/admin/air/log/"),
]


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["customer", "receptionist", "stylist"])
@pytest.mark.parametrize("method,url", ENDPOINTS)
def test_other_roles_cannot_call_air_endpoints(logged_in, role, method, url):
    client, _ = logged_in(role)
    response = getattr(client, method)(
        url, {"mode": "on", "reason": "no"}, content_type="application/json"
    )
    assert response.status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize("method,url", ENDPOINTS)
def test_guests_cannot_call_air_endpoints(method, url):
    response = getattr(Client(), method)(url, {}, content_type="application/json")
    assert response.status_code in (401, 403)


@pytest.mark.django_db
def test_air_has_no_login(make_user):
    # There is no user, token or session for AIR: its only identity is the string "air".
    client = Client()
    assert login(client, make_user(role="admin"), role="admin").status_code == 200
    assert client.get("/api/admin/air/cover/").status_code == 200
    assert not AuditLog.objects.filter(email__icontains="air@").exists()
