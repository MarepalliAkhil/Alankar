"""The scoring rules, the build, the evaluation and the placements (no HTTP)."""

from __future__ import annotations

import inspect
from datetime import timedelta

import pytest
from django.utils import timezone

from people.models import CustomerProfile, Rating
from recommendations import build, demo, engine, reminders
from recommendations.models import (
    CustomerPrefs,
    NotInterested,
    RebookReminder,
    RecSettings,
    ServicePair,
    ServiceStat,
)
from recommendations.tests.conftest import customer_with_profile, visit
from scheduling import booking
from scheduling.models import AppointmentStatus

pytestmark = pytest.mark.django_db


def info(service):
    return engine.info_of(service)


def model(**over):
    base = {"pairs": {}, "bookings": {}, "ratings": {}, "gaps": {}}
    base.update(over)
    return engine.Model(**base)


# --------------------------------------------------------------------------- pure scoring


def test_booked_together_needs_minimum_support_and_lift(shop):
    cut, trim, mani = info(shop["cut"]), info(shop["trim"]), info(shop["mani"])
    cands = {trim.id: trim, mani.id: mani}
    weak = model(pairs={(cut.id, mani.id): (engine.MIN_SUPPORT - 1, 5.0)})
    items = engine.score([cut], cands, weak)
    assert all("Often booked together" not in " ".join(i.reasons) for i in items)
    strong = model(pairs={(cut.id, mani.id): (engine.MIN_SUPPORT, 2.5)})
    top = engine.score([cut], cands, strong)[0]
    assert top.info.id == mani.id
    assert top.reasons[0] == "Often booked together with Cut"
    low_lift = model(pairs={(cut.id, mani.id): (10, engine.MIN_LIFT - 0.1)})
    assert (
        "together" not in engine.score([cut], {mani.id: mani}, low_lift)[0].parts
        if engine.score([cut], {mani.id: mani}, low_lift)
        else True
    )


def test_every_item_has_a_plain_reason_and_scores_are_weighted(shop):
    cut = info(shop["cut"])
    cands = {info(s).id: info(s) for s in (shop["trim"], shop["wash"], shop["colour"])}
    items = engine.score([cut], cands, model(bookings={shop["colour"].id: 9}))
    assert items and all(i.reasons and all(r for r in i.reasons) for i in items)
    for item in items:
        assert item.score == pytest.approx(
            round(sum(engine.WEIGHTS[k] * v for k, v in item.parts.items()), 4)
        )
    assert any("Similar to Cut, which you had" in i.reasons for i in items)


def test_no_more_than_two_from_one_category(shop, make_user):
    hair = [info(shop[k]) for k in ("trim", "wash")]
    extra = info(
        shop["cut"].__class__.objects.create(
            category=shop["hair"], name="Fringe", slug="fringe", summary="x", price=100
        )
    )
    cands = {i.id: i for i in [*hair, extra, info(shop["mani"])]}
    pop = model(bookings={i.id: 10 for i in cands.values()})
    items = engine.score([], cands, pop, top=5)
    per = {}
    for i in items:
        per[i.info.category_id] = per.get(i.info.category_id, 0) + 1
    assert max(per.values()) <= engine.PER_CATEGORY


def test_interests_and_ratings_count_only_as_described(shop):
    mani = info(shop["mani"])
    interest = engine.score([], {mani.id: mani}, model(), interests={mani.category_id})
    assert interest[0].reasons == ["Matches your interest: Nails"]
    few = model(ratings={mani.id: (5.0, engine.MIN_RATINGS - 1)}, bookings={mani.id: 1})
    assert "rated" not in engine.score([], {mani.id: mani}, few)[0].parts
    enough = model(ratings={mani.id: (4.6, engine.MIN_RATINGS)})
    assert "Rated 4.6 out of 5 by 3 guests" in engine.score([], {mani.id: mani}, enough)[0].reasons


def test_the_engine_never_reads_sensitive_attributes():
    """Deny by default: no gender, age, caste, religion, the service audience (who a service is
    meant for) or the customer's private profile fields in the code of the engine or the build
    (names only; the comments that promise this are not code)."""
    import io
    import tokenize

    names = set()
    for module in (engine, build, reminders):
        for tok in tokenize.generate_tokens(io.StringIO(inspect.getsource(module)).readline):
            if tok.type == tokenize.NAME:
                names.add(tok.string.lower())
    banned = {
        "gender",
        "sex",
        "age",
        "birth",
        "dob",
        "caste",
        "religion",
        "ethnicity",
        "audience",
        "allergies",
        "preferences",
        "phone",
        "customer_profile",
    }
    assert not names & banned, names & banned


def test_private_profile_fields_do_not_change_recommendations(crowd, shop, make_user):
    build.build()
    user = customer_with_profile(make_user, "private@example.com")
    visit(user, shop["cut"], 30, shop["asha"])
    before = [(i.info.id, i.reasons) for i in engine.for_you(user)]
    profile = CustomerProfile.objects.get(user=user)
    profile.allergies = "Nuts"
    profile.preferences = "Female stylist only; I am 45; Hindu"
    profile.save()
    assert [(i.info.id, i.reasons) for i in engine.for_you(user)] == before


# --------------------------------------------------------------------------- the build


def test_build_counts_pairs_with_lift_and_stats(crowd, shop):
    snap = build.build()
    pair = ServicePair.objects.get(source=shop["mani"], target=shop["pedi"])
    assert pair.support == 4
    assert pair.confidence == pytest.approx(1.0)
    assert pair.lift == pytest.approx(2.0)  # 4 of 8 customers had a pedicure
    assert ServicePair.objects.get(source=shop["cut"], target=shop["trim"]).support == 6
    assert snap.visits_used == 22 and snap.pairs == ServicePair.objects.count()
    stat = ServiceStat.objects.get(service=shop["cut"])
    assert stat.bookings_90d == 8 and stat.customers == 8
    assert len(snap.quiet_times) == 3 and all("around" in q["label"] for q in snap.quiet_times)


def test_ratings_feed_service_stats(crowd, shop):
    appt = visit(crowd[0], shop["colour"], 10, shop["ravi"])
    Rating.objects.create(
        appointment=appt,
        customer=crowd[0],
        stylist=shop["ravi"],
        status=Rating.Status.SUBMITTED,
        stars=5,
    )
    build.build()
    stat = ServiceStat.objects.get(service=shop["colour"])
    assert stat.rating_count == 1 and stat.rating_avg == 5.0


def test_evaluation_is_honest_when_data_is_small(shop, make_user):
    user = customer_with_profile(make_user, "few@example.com")
    visit(user, shop["cut"], 10)
    result = build.build().evaluation
    assert result["status"] == "not_enough_data"
    assert "not enough" in result["note"]


def test_time_split_evaluation_beats_popularity_on_patterned_history(shop, make_user):
    """Customers had a Cut, and later many added a Trim; the popularity list is led by Mani."""
    fillers = []
    for n in range(6):
        extra = shop["mani"].__class__.objects.create(
            category=shop["nails"], name=f"Nail art {n}", slug=f"nail-art-{n}", summary="x", price=1
        )
        shop["meena"].services.add(extra)
        fillers.append(extra)
    for i in range(40):
        user = customer_with_profile(make_user, f"mani{i}@example.com")
        visit(user, shop["mani"], 100 - i, shop["meena"])
        for extra in fillers:
            visit(user, extra, 99 - i, shop["meena"])
    for i in range(30):
        user = customer_with_profile(make_user, f"cut{i}@example.com")
        visit(user, shop["cut"], 200 - i, shop["asha"])
        visit(user, shop["trim"], 199 - i, shop["asha"])
    for i in range(12):
        user = customer_with_profile(make_user, f"late{i}@example.com")
        visit(user, shop["cut"], 250 - i, shop["asha"])
        visit(user, shop["trim"], 5 + i, shop["asha"])
    result = build.evaluate(timezone.now())
    assert result["status"] == "ok" and result["customers"] >= build.EVAL_MIN_CUSTOMERS
    assert result["hit_rate"] > result["baseline_hit_rate"]
    assert result["precision"] >= result["baseline_precision"]
    assert result["k"] == 5 and "fictional" in result["note"]


# --------------------------------------------------------------------------- one customer


def test_for_you_respects_not_interested_exclusions_and_upcoming(crowd, shop, make_user):
    build.build()
    user = customer_with_profile(make_user, "fy@example.com")
    visit(user, shop["cut"], 40, shop["asha"])
    names = [i.info.name for i in engine.for_you(user)]
    assert names[0] == "Trim"
    NotInterested.objects.create(user=user, service=shop["trim"])
    assert "Trim" not in [i.info.name for i in engine.for_you(user)]
    settings_ = RecSettings.load()
    settings_.excluded_services.add(shop["wash"])
    assert "Wash" not in [i.info.name for i in engine.for_you(user)]
    visit(user, shop["colour"], -3, status=AppointmentStatus.SCHEDULED)
    assert "Colour" not in [i.info.name for i in engine.for_you(user)]


def test_rebook_is_due_after_the_usual_gap_with_real_free_slots(shop, make_user):
    user = customer_with_profile(make_user, "rb@example.com")
    for days in (95, 65, 35):  # every 30 days, with Asha
        visit(user, shop["cut"], days, shop["asha"])
    (entry,) = engine.rebook(user)
    assert entry["service"].name == "Cut" and entry["gap_days"] == 30
    assert "about every 30 days" in entry["reason"] and "35 days ago" in entry["reason"]
    assert entry["stylist"]["name"] == "Asha" and len(entry["slots"]) == 3
    from datetime import datetime

    for iso in entry["slots"]:
        start = datetime.fromisoformat(iso)
        free = dict(booking.free_starts(booking.local(start).date(), 30, [shop["asha"].id]))
        assert shop["asha"].id in free[start]
    visit(user, shop["cut"], -2, status=AppointmentStatus.SCHEDULED)
    assert engine.rebook(user) == []


def test_not_due_yet_is_not_shown(shop, make_user):
    user = customer_with_profile(make_user, "early@example.com")
    visit(user, shop["cut"], 10, shop["asha"])
    assert engine.rebook(user) == []


def test_rebook_reminder_once_per_cycle_and_email_only_with_consent(shop, make_user):
    from core.models import MailOutbox
    from notifications.models import Notification

    yes = customer_with_profile(make_user, "yes@example.com", opted_in=True)
    no = customer_with_profile(make_user, "no@example.com")
    off = customer_with_profile(make_user, "off@example.com", opted_in=True)
    CustomerPrefs.objects.create(user=off, enabled=False)
    for user in (yes, no, off):
        visit(user, shop["cut"], 40, shop["asha"])
    assert reminders.send_due() == 2
    assert reminders.send_due() == 0  # same cycle: nothing new
    assert Notification.objects.filter(kind="rebook").count() == 2
    assert not Notification.objects.filter(user=off).exists()
    (mail,) = MailOutbox.objects.filter(kind="marketing")
    assert mail.to_email == yes.email and "unsubscribe" in mail.body
    assert RebookReminder.objects.get(user=yes).emailed is True
    assert RebookReminder.objects.get(user=no).emailed is False
    # A new visit starts a new cycle.
    visit(yes, shop["cut"], 35, shop["asha"])
    RebookReminder.objects.filter(user=yes).update(cycle=timezone.localdate() - timedelta(days=99))
    assert reminders.send_due() == 1


def test_switching_off_stops_everything_personal(crowd, shop, make_user):
    build.build()
    user = customer_with_profile(make_user, "sw@example.com")
    visit(user, shop["cut"], 40, shop["asha"])
    CustomerPrefs.objects.create(user=user, enabled=False)
    assert engine.personal_on(user) is False
    assert engine.prefer_stylists(user, [shop["ravi"].id, shop["asha"].id]) == [
        shop["ravi"].id,
        shop["asha"].id,
    ]


def test_air_alternatives_put_the_usual_stylist_first(shop, make_user):
    user = customer_with_profile(make_user, "usual@example.com")
    for days in (60, 30):
        visit(user, shop["cut"], days, shop["asha"])
    ids = [shop["ravi"].id, shop["asha"].id]
    assert engine.prefer_stylists(user, ids) == [shop["asha"].id, shop["ravi"].id]
    assert engine.prefer_stylists(None, ids) == ids


def test_addon_only_when_the_same_stylist_is_free_right_after(crowd, shop, make_user):
    build.build()
    user = customer_with_profile(make_user, "add@example.com")
    start = booking.local(timezone.now()).replace(hour=12, minute=0, second=0, microsecond=0)
    start += timedelta(days=2)
    found = engine.addon(user, shop["mani"], shop["meena"].id, start)
    assert found["service"].name == "Pedi" and found["stylist"]["name"] == "Meena"
    assert found["start"] == (start + timedelta(minutes=30)).isoformat()
    assert found["reason"] == "Often booked together with Mani"
    # Asha does not do pedicures: no suggestion with her.
    assert engine.addon(user, shop["mani"], shop["asha"].id, start) is None
    # Meena is busy right after the manicure: no suggestion.
    busy = visit(user, shop["pedi"], 0, shop["meena"], status=AppointmentStatus.SCHEDULED)
    busy.start = start + timedelta(minutes=30)
    busy.end = busy.start + timedelta(minutes=30)
    busy.save()
    assert engine.addon(user, shop["mani"], shop["meena"].id, start) is None


def test_aftercare_products_follow_the_last_visit(shop, make_user):
    from inventory.models import Product

    oil = Product.objects.create(sku="OIL", name="Hair oil", category="Hair", unit_price=300)
    shop["hair"].recommended_products.add(oil)
    user = customer_with_profile(make_user, "care@example.com")
    assert engine.aftercare(user) is None
    visit(user, shop["cut"], 3, shop["asha"])
    after = engine.aftercare(user)
    assert after["after"] == "Cut" and after["products"][0]["name"] == "Hair oil"
    assert "Our team suggests it" in after["products"][0]["reason"]


def test_rate_your_last_visit_comes_first(shop, make_user):
    user = customer_with_profile(make_user, "rate@example.com")
    appt = visit(user, shop["cut"], 2, shop["asha"])
    Rating.objects.create(appointment=appt, customer=user, stylist=shop["asha"])
    assert engine.rate_first(user) == {
        "rating_id": str(Rating.objects.get().pk),
        "service": "Cut",
        "stylist": "Asha",
    }


def test_demo_builds_patterned_guests_that_cannot_sign_in(db):
    from django.core.management import call_command

    call_command("seed_demo", verbosity=0)
    count = demo.build(write=lambda _t: None)
    assert count > 500
    from accounts.models import User

    guests = User.objects.filter(email__endswith="@archive.demo.example.com")
    assert guests.count() == demo.GUESTS
    assert not any(g.has_usable_password() for g in guests)
    assert demo.build(write=lambda _t: None) == 0  # safe to run again
    snap = build.build()
    assert snap.evaluation["status"] in ("ok", "too_few")
