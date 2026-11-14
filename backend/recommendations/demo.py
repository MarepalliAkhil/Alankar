"""Demo data for recommendations: fictional "archive" guests with visit patterns.

The demo story (core/demo_story.py) picks services at random, which gives a recommender nothing to
learn. These guests follow simple, invented habits (for example a pedicure after a manicure) in the
year before the story starts, so "Often booked together" and the offline evaluation have something
real to find. They are completed visits only (no invoices, ratings or payments), they end before
the story's seven weeks begin, and none of them can sign in.
"""

from __future__ import annotations

import random
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.utils import timezone

from accounts.models import User
from people.models import CustomerProfile
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus, Service

SEED = 20261112
GUESTS = 120
FIRST_DAY_BACK = 360
LAST_DAY_BACK = 50  # the demo story covers the last 49 days
EMAIL = "guest{n:03d}@archive.demo.example.com"

# (main service, the service often added, how often the main one repeats in days)
HABITS = [
    ("mens-haircut", "beard-trim-shape", 28),
    ("womens-haircut", "hair-spa", 42),
    ("womens-haircut", "blow-dry-styling", 42),
    ("global-hair-colour", "hair-spa", 45),
    ("swedish-massage", "foot-reflexology", 30),
    ("deep-tissue-massage", "head-neck-shoulder", 30),
    ("classic-facial", "eyebrow-threading", 28),
    ("manicure", "pedicure", 21),
    ("de-tan-facial", "body-scrub-polish", 35),
]


def _start(day, rng) -> datetime:
    hour = rng.choice([10, 11, 12, 14, 15, 16, 17, 18])
    return datetime.combine(day, time(hour, 0), tzinfo=timezone.get_current_timezone())


def build(write=print) -> int:
    rng = random.Random(SEED)
    services = {s.slug: s for s in Service.objects.select_related("category")}
    habits = [(a, b, g) for a, b, g in HABITS if a in services and b in services]
    if not habits:
        write("  Recommendation demo: the catalogue has none of the expected services; skipped.")
        return 0
    stylists = {
        slug: list(booking.qualified_stylists(s, public_only=True)) for slug, s in services.items()
    }
    today = timezone.localdate()
    users = []
    for n in range(1, GUESTS + 1):
        email = EMAIL.format(n=n)
        user = User(
            email=email, username=email, full_name=f"Archive Guest {n:03d}", role="customer"
        )
        user.set_unusable_password()
        users.append(user)
    User.objects.bulk_create(users, ignore_conflicts=True)
    users = list(User.objects.filter(email__endswith="@archive.demo.example.com").order_by("email"))
    profiles = []
    for i, user in enumerate(users):
        if CustomerProfile.objects.filter(user=user).exists():
            continue
        profile = CustomerProfile(user=user)
        profile.set_phone(f"98{i:08d}")
        if i % 2 == 0:
            profile.set_marketing(True)
        profiles.append(profile)
    CustomerProfile.objects.bulk_create(profiles)
    from marketing.consent import VERSION
    from marketing.models import ConsentRecord

    ConsentRecord.objects.bulk_create(
        [
            ConsentRecord(user_id=p.user_id, opted_in=True, version=VERSION, source="demo")
            for p in profiles
            if p.marketing_opt_in
        ]
    )
    rows = []
    for user in users:
        if Appointment.objects.filter(customer=user).exists():
            continue
        for main, extra, gap in rng.sample(habits, k=rng.choice([1, 1, 2])):
            keen = rng.random() < 0.75  # most guests take the add-on now and then...
            first_extra = rng.randint(0, 7)  # ...but only from their n-th visit on
            day = today - timedelta(days=rng.randint(LAST_DAY_BACK + 60, FIRST_DAY_BACK))
            visit = 0
            while (today - day).days > LAST_DAY_BACK:
                rows.append(_visit(user, services[main], stylists[main], day, rng))
                visit += 1
                if keen and visit > first_extra and rng.random() < 0.7:
                    later = day + timedelta(days=rng.randint(0, 6))
                    if (today - later).days > LAST_DAY_BACK:
                        rows.append(_visit(user, services[extra], stylists[extra], later, rng))
                day += timedelta(days=gap + rng.randint(-4, 6))
    rows = [r for r in rows if r is not None]
    Appointment.objects.bulk_create(rows)
    write(f"  Recommendation demo: {len(users)} archive guests, {len(rows)} past visits.")
    return len(rows)


def _visit(user, service: Service, stylists, day, rng):
    if not stylists:
        return None
    start = _start(day, rng)
    minutes = service.min_duration
    price = Decimal(service.from_price)
    stylist = rng.choice(stylists)
    return Appointment(
        customer=user,
        service=service,
        service_name=service.name,
        duration_minutes=minutes,
        price_total=price,
        gst_amount=Decimal("0"),
        amount_payable=price,
        preferred_start=start,
        preferred_stylist=stylist,
        stylist=stylist,
        start=start,
        end=start + timedelta(minutes=minutes),
        status=AppointmentStatus.COMPLETED,
        reception_status="accepted",
        stylist_status="accepted",
        source=Appointment.Source.PHONE,
        contact_name=user.full_name,
        contact_email=user.email,
        policy_accepted_at=start,
    )
