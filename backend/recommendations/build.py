"""`build_recommendations`: turns completed visits into the stored tables, then evaluates.

Everything here is counting. The evaluation is a time split: the model is built only from visits
before a cutoff date and asked to predict the services customers booked for the first time after
it, compared with a plain "most booked" list (the popularity baseline).
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta
from itertools import permutations
from statistics import median

from django.db import transaction
from django.db.models import Avg, Count
from django.utils import timezone

from recommendations import engine
from recommendations.models import ServicePair, ServiceStat, Snapshot
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus

S = AppointmentStatus
KEEP_SUPPORT = 2  # pairs below this are not stored at all
QUIET_WEEKS = 8
QUIET_COUNT = 3
EVAL_TEST_SHARE = 0.25  # the newest quarter of visits is the test period
EVAL_MIN_CUSTOMERS = 5
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def visits(before: datetime | None = None) -> list[tuple]:
    qs = Appointment.objects.filter(status=S.COMPLETED, start__isnull=False)
    if before is not None:
        qs = qs.filter(start__lt=before)
    return list(qs.order_by("start").values_list("customer_id", "service_id", "start"))


def model_from(rows: list[tuple], *, now: datetime) -> tuple[dict, dict, dict]:
    """Pairs (source, target) -> (support, confidence, lift), 90-day bookings and repeat gaps."""
    services_of: dict = defaultdict(set)
    days: dict = defaultdict(list)
    bookings: Counter = Counter()
    for customer, service, start in rows:
        services_of[customer].add(service)
        days[(customer, service)].append(booking.local(start).date())
        if start >= now - timedelta(days=90):
            bookings[service] += 1
    n = len(services_of) or 1
    had: Counter = Counter()
    both: Counter = Counter()
    for services in services_of.values():
        had.update(services)
        both.update(permutations(services, 2))
    pairs = {}
    for (a, b), support in both.items():
        if support < KEEP_SUPPORT:
            continue
        confidence = support / had[a]
        lift = confidence / (had[b] / n)
        pairs[(a, b)] = (support, round(confidence, 4), round(lift, 4))
    repeat: dict = defaultdict(list)
    for (_customer, service), dates in days.items():
        for a, b in zip(dates, dates[1:], strict=False):
            gap = (b - a).days
            if engine.GAP_RANGE[0] <= gap <= engine.GAP_RANGE[1]:
                repeat[service].append(gap)
    gaps = {s: int(median(g)) for s, g in repeat.items() if len(g) >= 3}
    return pairs, dict(bookings), gaps


def ratings_by_service(before: datetime | None = None) -> dict:
    from people.models import Rating

    qs = Rating.objects.filter(
        status=Rating.Status.SUBMITTED, moderation=Rating.Moderation.ACTIVE, stars__isnull=False
    )
    if before is not None:
        qs = qs.filter(appointment__start__lt=before)
    rows = qs.values("appointment__service").annotate(avg=Avg("stars"), n=Count("id"))
    return {r["appointment__service"]: (round(float(r["avg"]), 2), r["n"]) for r in rows}


def quiet(now: datetime) -> list[dict]:
    """The quietest open hours over the last weeks (fewest visits started in that hour)."""
    since = now - timedelta(weeks=QUIET_WEEKS)
    starts = Appointment.objects.filter(
        status__in=(S.COMPLETED, S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS),
        start__gte=since,
        start__lt=now,
    ).values_list("start", flat=True)
    load: Counter = Counter()
    for start in starts:
        local = booking.local(start)
        load[(local.weekday(), local.hour)] += 1
    today = booking.local(now).date()
    buckets = []
    for offset in range(7):
        day = today + timedelta(days=offset)
        hours = booking.opening_hours(day)
        if not hours:
            continue
        open_at, close_at = hours
        hour = open_at.hour + (1 if open_at.minute else 0)
        while hour + 1 <= close_at.hour:
            buckets.append((load[(day.weekday(), hour)], day.weekday(), hour))
            hour += 1
    buckets.sort()
    out, seen_days = [], set()
    for count, weekday, hour in buckets:
        if weekday in seen_days:
            continue  # one time per day, so the list is easy to use
        seen_days.add(weekday)
        clock = f"{hour % 12 or 12} {'AM' if hour < 12 else 'PM'}"
        out.append(
            {
                "weekday": weekday,
                "hour": hour,
                "label": f"{WEEKDAY_NAMES[weekday]} around {clock}",
                "visits": count,
                "weeks": QUIET_WEEKS,
            }
        )
        if len(out) >= QUIET_COUNT:
            break
    return out


def evaluate(now: datetime, catalogue: dict | None = None) -> dict:
    """Hit rate at 5 and precision at 5 against the popularity baseline, on a time split."""
    rows = visits()
    if len(rows) < 20:
        return {"status": "not_enough_data", "visits": len(rows), "note": _note_small(len(rows))}
    cut_index = int(len(rows) * (1 - EVAL_TEST_SHARE))
    cutoff = rows[cut_index][2]
    train = [r for r in rows if r[2] < cutoff]
    test = [r for r in rows if r[2] >= cutoff]
    pairs, bookings, gaps = model_from(train, now=cutoff)
    ratings = ratings_by_service(before=cutoff)
    model = engine.Model(
        pairs={k: (v[0], v[2]) for k, v in pairs.items()},
        bookings=bookings,
        ratings=ratings,
        gaps=gaps,
    )
    catalogue = catalogue if catalogue is not None else engine.bookable()
    had_before: dict = defaultdict(set)
    for customer, service, _ in train:
        had_before[customer].add(service)
    new_after: dict = defaultdict(set)
    for customer, service, _ in test:
        if customer in had_before and service not in had_before[customer]:
            new_after[customer].add(service)
    results = {"model": [0, 0.0], "baseline": [0, 0.0]}
    customers = [c for c, wanted in new_after.items() if wanted & set(catalogue)]
    for customer in customers:
        wanted = new_after[customer]
        had = [catalogue[s] for s in had_before[customer] if s in catalogue]
        picks = [i.info.id for i in engine.score(had, catalogue, model, top=engine.TOP)]
        base = [c.id for c in engine.popularity(catalogue, model, skip=had_before[customer])]
        for key, ranked in (("model", picks), ("baseline", base)):
            hits = len(set(ranked[: engine.TOP]) & wanted)
            results[key][0] += 1 if hits else 0
            results[key][1] += hits / engine.TOP
    n = len(customers)
    out = {
        "status": "ok" if n >= EVAL_MIN_CUSTOMERS else "too_few",
        "cutoff": booking.local(cutoff).date().isoformat(),
        "train_visits": len(train),
        "test_visits": len(test),
        "customers": n,
        "k": engine.TOP,
        "evaluated_at": now.isoformat(),
    }
    if n:
        out["hit_rate"] = round(results["model"][0] / n, 3)
        out["precision"] = round(results["model"][1] / n, 3)
        out["baseline_hit_rate"] = round(results["baseline"][0] / n, 3)
        out["baseline_precision"] = round(results["baseline"][1] / n, 3)
    out["note"] = (
        "Measured on this database's own visits. On the demo database these are fictional "
        "customers, so the numbers show that the pipeline works, not how it would do with real "
        "customers."
        if n >= EVAL_MIN_CUSTOMERS
        else f"Only {n} customers booked something new after {out['cutoff']}: too few to measure."
    )
    return out


def _note_small(n: int) -> str:
    return f"Only {n} completed visits: not enough to measure anything yet."


def build(now: datetime | None = None, *, evaluate_too: bool = True) -> Snapshot:
    now = now or timezone.now()
    rows = visits()
    pairs, bookings, gaps = model_from(rows, now=now)
    ratings = ratings_by_service()
    customers: Counter = Counter()
    seen = set()
    for customer, service, _ in rows:
        if (customer, service) not in seen:
            seen.add((customer, service))
            customers[service] += 1
    from scheduling.models import Service

    service_ids = set(Service.objects.values_list("pk", flat=True))
    with transaction.atomic():
        ServicePair.objects.all().delete()
        ServicePair.objects.bulk_create(
            [
                ServicePair(source_id=a, target_id=b, support=s, confidence=c, lift=lift)
                for (a, b), (s, c, lift) in pairs.items()
                if a in service_ids and b in service_ids
            ]
        )
        ServiceStat.objects.all().delete()
        ServiceStat.objects.bulk_create(
            [
                ServiceStat(
                    service_id=sid,
                    bookings_90d=bookings.get(sid, 0),
                    customers=customers.get(sid, 0),
                    rating_avg=ratings.get(sid, (None, 0))[0],
                    rating_count=ratings.get(sid, (None, 0))[1],
                    typical_gap_days=gaps.get(sid),
                )
                for sid in service_ids
            ]
        )
        snap = Snapshot.load()
        snap.built_at = now
        snap.visits_used = len(rows)
        snap.pairs = len(pairs)
        snap.quiet_times = quiet(now)
        if evaluate_too:
            snap.evaluation = evaluate(now)
        snap.save()
    return snap
