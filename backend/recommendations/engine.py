"""The recommendation engine: plain, explainable arithmetic over booking history.

Signals (each between 0 and 1, then weighted):
  together  customers who had a service you had also had this one (lift, with a minimum support)
  similar   same category as something you had, or shared tags
  interest  in a category you chose yourself on your profile
  popular   booked often in the last 90 days
  rated     well rated by guests (only with enough ratings)

It never reads gender, age, caste, religion or any other sensitive attribute, nor the encrypted
profile fields (phone, allergies, preferences). Every item comes with a plain reason.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from statistics import median

from django.db.models import Q
from django.utils import timezone

from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus, Service

S = AppointmentStatus
UPCOMING = (S.REQUESTED, S.AWAITING_PAYMENT, S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS)

WEIGHTS = {"together": 0.35, "similar": 0.20, "interest": 0.15, "popular": 0.15, "rated": 0.15}
MIN_SUPPORT = 3  # customers who had both, before "booked together" counts
MIN_LIFT = 1.2  # how much more likely than chance
MIN_RATINGS = 3  # ratings needed before "well rated" counts
PER_CATEGORY = 2  # at most this many items from one category
TOP = 5
REBOOK_EARLY_DAYS = 3  # remind this many days before the usual gap is reached
REBOOK_MAX = 3  # the most overdue first
DEFAULT_GAP = {"salon": 30, "spa": 30, "beauty-parlor": 21}
GAP_RANGE = (7, 180)  # repeat gaps outside this range are ignored
POPULAR_REASON_AT = 0.6


@dataclass(frozen=True)
class Info:
    id: object
    name: str
    slug: str
    category_id: object
    category: str
    division: str
    tags: frozenset
    duration: int
    price: str


@dataclass
class Item:
    info: Info
    score: float
    reasons: list[str]
    parts: dict = field(default_factory=dict)
    pinned: bool = False


@dataclass
class Model:
    """What the scoring needs: built from the stored tables, or in memory for the evaluation."""

    pairs: dict  # (source_id, target_id) -> (support, lift)
    bookings: dict  # service_id -> bookings in the last 90 days
    ratings: dict  # service_id -> (average, count)
    gaps: dict  # service_id -> typical repeat gap in days


def info_of(service: Service) -> Info:
    return Info(
        id=service.id,
        name=service.name,
        slug=service.slug,
        category_id=service.category_id,
        category=service.category.name,
        division=service.category.division,
        tags=frozenset(str(t).lower() for t in (service.tags or [])),
        duration=service.min_duration,
        price=str(service.from_price),
    )


def bookable(excluded=()) -> dict:
    """Active services in an active category that at least one public stylist offers."""
    qs = (
        Service.objects.filter(is_active=True, category__is_active=True)
        .exclude(pk__in=list(excluded))
        .filter(
            Q(stylist_profiles__is_public=True)
            & (Q(stylist_profiles__user__isnull=True) | Q(stylist_profiles__user__is_active=True))
        )
        .select_related("category")
        .prefetch_related("variants")
        .distinct()
    )
    return {s.id: info_of(s) for s in qs}


def stored_model() -> Model:
    from recommendations.models import ServicePair, ServiceStat

    pairs = {
        (p.source_id, p.target_id): (p.support, p.lift)
        for p in ServicePair.objects.all().only("source", "target", "support", "lift")
    }
    bookings, ratings, gaps = {}, {}, {}
    for st in ServiceStat.objects.all():
        bookings[st.service_id] = st.bookings_90d
        if st.rating_count:
            ratings[st.service_id] = (st.rating_avg or 0.0, st.rating_count)
        if st.typical_gap_days:
            gaps[st.service_id] = st.typical_gap_days
    return Model(pairs=pairs, bookings=bookings, ratings=ratings, gaps=gaps)


# --------------------------------------------------------------------------- scoring


def score(
    had: list[Info],
    candidates: dict,
    model: Model,
    *,
    interests: set = frozenset(),
    skip: set = frozenset(),
    top: int = TOP,
    names: dict | None = None,
) -> list[Item]:
    """Ranks `candidates` (id -> Info) for someone who had `had`. Pure: no database access."""
    names = names or {}
    had_ids = {h.id for h in had}
    peak = max(model.bookings.values(), default=0) or 1
    items: list[Item] = []
    for cid, c in candidates.items():
        if cid in had_ids or cid in skip:
            continue
        parts, reasons = {}, []
        # together
        best, best_src = 0.0, None
        for h in had:
            support, lift = model.pairs.get((h.id, cid), (0, 0.0))
            if support >= MIN_SUPPORT and lift >= MIN_LIFT and lift > best:
                best, best_src = lift, h
        if best_src is not None:
            parts["together"] = min(1.0, best / 3.0)
            reasons.append(f"Often booked together with {best_src.name}")
        # similar
        sim, sim_src = 0.0, None
        for h in had:
            value = 0.0
            if h.category_id == c.category_id:
                value = 1.0
            elif h.division == c.division:
                value = 0.4
            if h.tags and c.tags:
                value = min(1.0, value + 0.5 * len(h.tags & c.tags) / len(h.tags | c.tags))
            if value > sim:
                sim, sim_src = value, h
        if sim > 0:
            parts["similar"] = sim
            if sim_src is not None and (sim_src.category_id == c.category_id or sim >= 0.6):
                reasons.append(f"Similar to {sim_src.name}, which you had")
        # interest
        if c.category_id in interests:
            parts["interest"] = 1.0
            reasons.append(f"Matches your interest: {c.category}")
        # popular
        pop = model.bookings.get(cid, 0) / peak
        if pop > 0:
            parts["popular"] = pop
            if pop >= POPULAR_REASON_AT:
                reasons.append("One of our most booked services")
        # rated
        avg, count = model.ratings.get(cid, (0.0, 0))
        if count >= MIN_RATINGS:
            parts["rated"] = max(0.0, min(1.0, (avg - 3.0) / 2.0))
            if avg >= 4.0:
                reasons.append(f"Rated {avg:.1f} out of 5 by {count} guests")
        total = sum(WEIGHTS[k] * v for k, v in parts.items())
        if total <= 0:
            continue
        if not reasons:
            reasons.append("Popular with our guests")
        items.append(Item(info=c, score=round(total, 4), reasons=reasons, parts=parts))
    items.sort(key=lambda i: (-i.score, i.info.name))
    return diverse(items, top)


def diverse(items: list[Item], top: int) -> list[Item]:
    """At most PER_CATEGORY items from one category."""
    out, per = [], Counter()
    for item in items:
        if per[item.info.category_id] >= PER_CATEGORY:
            continue
        per[item.info.category_id] += 1
        out.append(item)
        if len(out) >= top:
            break
    return out


def popularity(candidates: dict, model: Model, *, skip=frozenset(), top=TOP) -> list:
    """The baseline: most booked first (ignores who you are)."""
    ranked = sorted(
        (c for cid, c in candidates.items() if cid not in skip),
        key=lambda c: (-model.bookings.get(c.id, 0), c.name),
    )
    return ranked[:top]


# --------------------------------------------------------------------------- one customer


@dataclass
class History:
    visits: list  # (service_id, start, stylist_id), oldest first
    last: dict  # service_id -> last visit date
    own_gaps: dict  # service_id -> median own repeat gap
    stylist_for: dict  # service_id -> the stylist they had most for it
    usual_stylist: object | None
    usual_weekday: int | None
    usual_hour: int | None


def history(user, *, before: datetime | None = None) -> History:
    qs = Appointment.objects.filter(customer=user, status=S.COMPLETED, start__isnull=False)
    if before is not None:
        qs = qs.filter(start__lt=before)
    visits = list(qs.order_by("start").values_list("service_id", "start", "stylist_id"))
    last, dates, per_service_stylist = {}, defaultdict(list), defaultdict(Counter)
    for sid, start, stylist in visits:
        day = booking.local(start).date()
        last[sid] = day
        dates[sid].append(day)
        if stylist:
            per_service_stylist[sid][stylist] += 1
    own_gaps = {}
    for sid, days in dates.items():
        gaps = [
            (b - a).days
            for a, b in zip(days, days[1:], strict=False)
            if GAP_RANGE[0] <= (b - a).days
        ]
        gaps = [g for g in gaps if g <= GAP_RANGE[1]]
        if gaps:
            own_gaps[sid] = int(median(gaps))
    recent = visits[-10:]
    stylists = Counter(v[2] for v in recent if v[2])
    weekdays = Counter(booking.local(v[1]).weekday() for v in recent)
    hours = Counter(booking.local(v[1]).hour for v in recent)

    def usual(counter):
        if not counter:
            return None
        value, count = counter.most_common(1)[0]
        return value if count >= 2 else None

    return History(
        visits=visits,
        last=last,
        own_gaps=own_gaps,
        stylist_for={sid: c.most_common(1)[0][0] for sid, c in per_service_stylist.items()},
        usual_stylist=usual(stylists),
        usual_weekday=usual(weekdays),
        usual_hour=usual(hours),
    )


def prefs_of(user):
    from recommendations.models import CustomerPrefs

    prefs, _ = CustomerPrefs.objects.get_or_create(user=user)
    return prefs


def personal_on(user) -> bool:
    from recommendations.models import RecSettings

    if not RecSettings.load().enabled:
        return False
    return prefs_of(user).enabled


def upcoming_services(user) -> set:
    return set(
        Appointment.objects.filter(customer=user, status__in=UPCOMING).values_list(
            "service_id", flat=True
        )
    )


def skipped(user) -> set:
    from recommendations.models import NotInterested

    return set(NotInterested.objects.filter(user=user).values_list("service_id", flat=True))


def for_you(user, *, top=TOP, model: Model | None = None, catalogue: dict | None = None) -> list:
    from recommendations.models import RecSettings

    settings_ = RecSettings.load()
    catalogue = (
        catalogue
        if catalogue is not None
        else bookable(settings_.excluded_services.values_list("pk", flat=True))
    )
    model = model or stored_model()
    hist = history(user)
    had = [catalogue[sid] for sid in dict.fromkeys(v[0] for v in hist.visits) if sid in catalogue]
    # Services no longer bookable still count as "had" for similarity, by their catalogue info.
    gone = [sid for sid in dict.fromkeys(v[0] for v in hist.visits) if sid not in catalogue]
    if gone:
        had += [
            info_of(s)
            for s in Service.objects.filter(pk__in=gone)
            .select_related("category")
            .prefetch_related("variants")
        ]
    interests = set(prefs_of(user).interests.values_list("pk", flat=True))
    skip = skipped(user) | upcoming_services(user) | set(rebook_ids(user, hist, model, catalogue))
    return score(had, catalogue, model, interests=interests, skip=skip, top=top)


# --------------------------------------------------------------------------- rebook


def gap_for(sid, hist: History, model: Model, info: Info | None) -> int:
    if sid in hist.own_gaps:
        return hist.own_gaps[sid]
    if sid in model.gaps:
        return model.gaps[sid]
    return DEFAULT_GAP.get(info.division if info else "", 30)


def rebook_ids(user, hist: History, model: Model, catalogue: dict, today: date | None = None):
    today = today or timezone.localdate()
    out = []
    upcoming = upcoming_services(user)
    for sid, last in hist.last.items():
        if sid not in catalogue or sid in upcoming:
            continue
        gap = gap_for(sid, hist, model, catalogue.get(sid))
        if (today - last).days >= gap - REBOOK_EARLY_DAYS:
            out.append(sid)
    return out


def next_usual_start(hist: History, today: date) -> datetime:
    """The next date on the customer's usual weekday (or tomorrow) at their usual hour (or 11)."""
    day = today + timedelta(days=1)
    if hist.usual_weekday is not None:
        while day.weekday() != hist.usual_weekday:
            day += timedelta(days=1)
    hour = hist.usual_hour if hist.usual_hour is not None else 11
    return datetime.combine(day, time(hour, 0), tzinfo=timezone.get_current_timezone())


def rebook(user, *, model: Model | None = None, catalogue: dict | None = None, slots=True) -> list:
    """Services that are due again, each with a plain reason and up to three real free times."""
    from people.models import StylistProfile
    from recommendations.models import RecSettings

    settings_ = RecSettings.load()
    catalogue = (
        catalogue
        if catalogue is not None
        else bookable(settings_.excluded_services.values_list("pk", flat=True))
    )
    model = model or stored_model()
    hist = history(user)
    today = timezone.localdate()
    skip = skipped(user)
    out = []
    for sid in rebook_ids(user, hist, model, catalogue, today):
        if sid in skip:
            continue
        info = catalogue[sid]
        gap = gap_for(sid, hist, model, info)
        since = (today - hist.last[sid]).days
        reason = (
            f"You usually come back for {info.name} about every {gap} days; "
            f"your last visit was {since} days ago."
        )
        entry = {
            "service": info,
            "reason": reason,
            "last_visit": hist.last[sid].isoformat(),
            "gap_days": gap,
            "cycle": hist.last[sid],
            "overdue": since / gap if gap else 0,
            "stylist": None,
            "slots": [],
        }
        out.append(entry)
    out.sort(key=lambda e: (-e["overdue"], e["service"].name))
    out = out[:REBOOK_MAX]
    if slots:
        for entry in out:
            sid = entry["service"].id
            service = Service.objects.get(pk=sid)
            qualified = list(
                booking.qualified_stylists(service, public_only=True).values_list("id", flat=True)
            )
            usual = hist.stylist_for.get(sid) or hist.usual_stylist
            ids = [usual] if usual in qualified else qualified
            if not ids:
                continue
            around = next_usual_start(hist, today)
            found = booking.nearest_slots(around, entry["service"].duration, ids, count=3)
            entry["slots"] = [s.isoformat() for s in found]
            if len(ids) == 1:
                profile = StylistProfile.objects.filter(pk=ids[0]).first()
                if profile:
                    entry["stylist"] = {"id": str(profile.id), "name": profile.display_name}
    return out


# --------------------------------------------------------------------------- other placements


def addon(user, service: Service, stylist_id, start: datetime) -> dict | None:
    """A service often booked with `service` that the SAME stylist can do right after it.

    Only suggested when that stylist is really free for the whole add-on, starting when the first
    service ends. Returns None otherwise.
    """
    from people.models import StylistProfile
    from recommendations.models import RecSettings, ServicePair

    settings_ = RecSettings.load()
    if not settings_.enabled:
        return None
    first = booking.quote(service, None, [])
    end = start + timedelta(minutes=first.duration_minutes)
    pairs = (
        ServicePair.objects.filter(
            source=service, support__gte=MIN_SUPPORT, lift__gte=MIN_LIFT, target__is_active=True
        )
        .exclude(target__in=settings_.excluded_services.all())
        .exclude(target__in=skipped(user))
        .select_related("target", "target__category")
        .order_by("-lift", "-support")
    )
    profile = StylistProfile.objects.filter(pk=stylist_id).first()
    if profile is None:
        return None
    for pair in pairs[:5]:
        target = pair.target
        if not booking.qualified_stylists(target).filter(pk=profile.pk).exists():
            continue
        minutes = target.min_duration
        free = dict(booking.free_starts(booking.local(end).date(), minutes, [profile.pk]))
        if profile.pk in free.get(end, []):
            return {
                "service": info_of(target),
                "start": end.isoformat(),
                "stylist": {"id": str(profile.id), "name": profile.display_name},
                "reason": f"Often booked together with {service.name}",
            }
    return None


def aftercare(user, *, top=3) -> dict | None:
    """Products for the last completed visit: the team's picks for that category first, then
    products often bought with that service."""
    from inventory.models import Product
    from scheduling.models import AppointmentProduct

    last = (
        Appointment.objects.filter(customer=user, status=S.COMPLETED)
        .select_related("service", "service__category")
        .order_by("-start")
        .first()
    )
    if last is None:
        return None
    service = last.service
    picks: list = []
    reasons: dict = {}
    for p in service.category.recommended_products.filter(is_active=True, sold_online=True):
        picks.append(p)
        reasons[p.pk] = f"Our team suggests it after {service.category.name.lower()} services"
    counted = (
        AppointmentProduct.objects.filter(appointment__service=service)
        .values_list("product_id", flat=True)
        .order_by()
    )
    for pid, _ in Counter(counted).most_common(10):
        if pid in reasons:
            continue
        p = Product.objects.filter(pk=pid, is_active=True, sold_online=True).first()
        if p:
            picks.append(p)
            reasons[p.pk] = f"Often bought with {service.name}"
    if not picks:
        return None
    return {
        "after": service.name,
        "products": [
            {
                "id": str(p.pk),
                "name": p.name,
                "price": str(p.unit_price),
                "reason": reasons[p.pk],
            }
            for p in picks[:top]
        ],
    }


def quiet_times() -> list:
    from recommendations.models import Snapshot

    return list(Snapshot.load().quiet_times or [])


def prefer_stylists(user, ids: list) -> list:
    """AIR alternatives: the customer's usual stylist first (only when personal recommendations
    are on). Otherwise the order is unchanged."""
    if user is None or not getattr(user, "is_authenticated", False) or not ids:
        return list(ids)
    if not personal_on(user):
        return list(ids)
    usual = history(user).usual_stylist
    return sorted(ids, key=lambda i: 0 if i == usual else 1)


def rate_first(user) -> dict | None:
    from people.models import Rating

    pending = (
        Rating.objects.filter(customer=user, status=Rating.Status.PENDING)
        .select_related("appointment", "stylist")
        .order_by("-created_at")
        .first()
    )
    if pending is None:
        return None
    return {
        "rating_id": str(pending.pk),
        "service": pending.appointment.service_name,
        "stylist": pending.stylist.display_name if pending.stylist else "",
    }
