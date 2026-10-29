"""A fictional seven-week story for demos: visits, invoices, ratings, stock and payroll.

Everything is made up (people at demo.example.com, products and suppliers from the demo catalogue).
The history is built through the same code the app uses (booking, checkout, ratings, purchasing,
payroll), with the clock set to the moment each step "happened", so every number is consistent:
invoices add up, stock is a ledger, ratings feed the stylist pay, and the audit log is dated.
The random choices use a fixed seed, so the story is the same every time.
"""

from __future__ import annotations

import random
from contextlib import contextmanager
from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest import mock

from django.test import override_settings
from django.utils import timezone

from accounts.models import User
from billing import checkout
from billing.models import Invoice
from core import demo
from inventory import purchasing, stock
from inventory.models import Product, StockMovement, Supplier
from people import payroll
from people import ratings as rating_service
from people.models import Rating, StylistProfile
from scheduling import booking
from scheduling.models import Appointment, Service

HISTORY_DAYS = 49  # seven weeks
SEED = 20260101

# Customers who have visited before, and two who are new (so the online booking flow still works
# for them: a customer with an unrated visit must rate it before booking online).
REGULARS = ["meera", "vikram", "anita", "sameer"]
NEWCOMERS = ["divya", "karthik"]

COMMENTS = {
    5: [
        "Lovely service, very gentle.",
        "Exactly what I asked for.",
        "Quick and neat. Thank you!",
        "",
    ],
    4: ["Good, a little wait at the start.", "Nice result.", ""],
    3: ["Okay, but it ran late.", ""],
    2: ["Not what I asked for."],
}
# Per stylist: the chance of each star count (1..5). Different on purpose, so the pay bands differ.
STAR_ODDS = {
    "Rahul": [0, 0.02, 0.05, 0.23, 0.70],
    "Kiran": [0.02, 0.06, 0.17, 0.40, 0.35],
    "Priya": [0, 0.03, 0.10, 0.37, 0.50],
}
TIPS = [0, 0, 0, 0, 20, 30, 50, 100]
METHODS = ["cash", "cash", "upi", "upi", "card"]


@contextmanager
def clock(moment: datetime):
    """Everything inside happens at `moment` (including created_at / issued_at stamps)."""
    with mock.patch("django.utils.timezone.now", return_value=moment):
        yield


def _local(day, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute), tzinfo=timezone.get_current_timezone())


class Story:
    def __init__(self, write=print):
        self.write = write
        self.rng = random.Random(SEED)
        self.counts = {"visits": 0, "invoices": 0, "ratings": 0, "cancelled": 0, "no_show": 0}
        self.admin = User.objects.get(email="owner@demo.example.com")
        self.desk = [
            User.objects.get(email="reception@demo.example.com"),
            User.objects.get(email="reception2@demo.example.com"),
            self.admin,
        ]
        self.customers = {
            short: User.objects.get(email=f"{short}@demo.example.com")
            for short in REGULARS + NEWCOMERS
        }
        self.stylists = list(StylistProfile.objects.filter(display_name__in=STAR_ODDS))
        self.services = [
            s
            for s in Service.objects.filter(is_active=True).prefetch_related("variants", "addons")
            if s.price and s.duration_minutes <= 120
        ]
        self.products = list(Product.objects.filter(is_active=True))
        self.invoices: list[Invoice] = []

    # ------------------------------------------------------------------ helpers

    def _contact(self, user: User) -> dict:
        return {"name": user.full_name, "email": user.email, "phone": "9000000000"}

    def _variant_id(self, service: Service):
        variants = [v for v in service.variants.all() if v.is_active]
        return str(variants[0].id) if variants else None

    def _pick_service_and_stylist(self):
        for _ in range(50):
            service = self.rng.choice(self.services)
            able = [
                s
                for s in self.stylists
                if s.id in set(booking.qualified_stylists(service).values_list("id", flat=True))
            ]
            if able:
                return service, self.rng.choice(able)
        raise RuntimeError("No service has a stylist who offers it. Run seed_demo first.")

    def _free_start(self, day, service, stylist, variant_id):
        minutes = booking.quote(service, variant_id, []).duration_minutes
        starts = [s for s, _ in booking.free_starts(day, minutes, [stylist.id], staff=True)]
        return self.rng.choice(starts) if starts else None

    def _book(self, day, *, check_in: bool, regular: bool = True):
        """One desk booking on `day` (walk-in or phone). Returns the appointment or None."""
        service, stylist = self._pick_service_and_stylist()
        variant_id = self._variant_id(service)
        customer = self.customers[self.rng.choice(REGULARS)]
        with clock(_local(day, 0, 1)):
            start = self._free_start(day, service, stylist, variant_id)
            if start is None:
                return None
            source = self.rng.choice(["walk_in", "phone"])
            appt = booking.create_desk_booking(
                actor=self.rng.choice(self.desk),
                customer=customer,
                service=service,
                variant_id=variant_id,
                addon_ids=[],
                start=start,
                stylist=stylist,
                room=None,
                source=source,
                contact=self._contact(customer),
                notes="",
                allergies="",
                check_in_now=False,
            )
        self.counts["visits"] += 1
        return appt

    # ------------------------------------------------------------------ one day of history

    def _bill(self, appt: Appointment):
        actor = self.rng.choice(self.desk)
        with clock(appt.start):
            booking.check_in(appt.id, actor=actor)
        with clock(appt.end):
            data = {"appointment": str(appt.id), "tip": str(self.rng.choice(TIPS))}
            if self.rng.random() < 0.3:
                data["products"] = [
                    {"product": str(self.rng.choice(self.products).id), "quantity": 1}
                ]
            q = checkout.quote(appt.id, data, actor=actor)
            due = q["totals"].payable_now + q["tip"]
            data["payments"] = (
                [{"method": self.rng.choice(METHODS), "amount": str(due)}] if due > 0 else []
            )
            invoice = checkout.checkout(appt.id, data, actor=actor)
        self.invoices.append(invoice)
        self.counts["invoices"] += 1

    def _day(self, day):
        if booking.opening_hours(day) is None:
            return
        busy_day = day.weekday() >= 4  # Friday to Sunday are busier
        for _ in range(self.rng.randint(3, 6) if busy_day else self.rng.randint(1, 4)):
            appt = self._book(day, check_in=True)
            if appt is None:
                continue
            roll = self.rng.random()
            if roll < 0.04:
                with clock(appt.start - timedelta(hours=3)):
                    booking.desk_cancel(
                        appt.id,
                        actor=self.rng.choice(self.desk),
                        reason="Customer phoned to cancel.",
                    )
                self.counts["cancelled"] += 1
            elif roll < 0.07:
                with clock(appt.start + timedelta(minutes=20)):
                    booking.mark_no_show(appt.id, actor=self.rng.choice(self.desk))
                self.counts["no_show"] += 1
            else:
                self._bill(appt)

    # ------------------------------------------------------------------ ratings

    def _rate(self):
        """Visits older than three days are rated; newer ones only about half the time, so the
        desk and the customer pages show a few "please rate" prompts."""
        now = timezone.now()
        for invoice in self.invoices:
            if invoice.issued_at > now - timedelta(days=3) and self.rng.random() < 0.5:
                continue
            appt = Appointment.objects.select_related("stylist").get(pk=invoice.appointment_id)
            odds = STAR_ODDS[appt.stylist.display_name]
            stars = self.rng.choices([1, 2, 3, 4, 5], weights=odds)[0]
            comment = (
                self.rng.choice(COMMENTS.get(stars, ["Not good."]))
                if stars > 1
                else "Rude and slow."
            )
            when = min(invoice.issued_at + timedelta(hours=self.rng.randint(2, 30)), now)
            tags = ["Late"] if stars <= 3 and self.rng.random() < 0.4 else []
            rating = Rating.objects.get(appointment_id=invoice.appointment_id)
            with clock(when):
                rating_service.submit(
                    rating.pk, customer=appt.customer, stars=stars, comment=comment, tags=tags
                )
            self.counts["ratings"] += 1

    # ------------------------------------------------------------------ stock

    def _stock_story(self, today):
        """A delivery in week 3, one breakage, and two products running low now."""
        supplier, _ = Supplier.objects.get_or_create(
            name="Demo Beauty Supplies",
            defaults={"contact_person": "Demo Supplier", "email": "supplies@demo.example.com"},
        )
        pick = sorted(self.products, key=lambda p: p.name)[:4]
        with clock(_local(today - timedelta(days=28), 11)):
            order = purchasing.create(
                supplier=supplier,
                lines=[
                    {
                        "product": str(p.id),
                        "quantity": 20,
                        "unit_cost": (p.unit_price * Decimal("0.6")).quantize(Decimal("0.01")),
                    }
                    for p in pick
                ],
                expected_on=today - timedelta(days=26),
                notes="Demo restock.",
                actor=self.admin,
            )
            purchasing.send(order.id, actor=self.admin)
        with clock(_local(today - timedelta(days=26), 15)):
            purchasing.receive(
                order.id,
                [{"line": line.id, "quantity": 20} for line in order.lines.all()],
                note="Delivery checked.",
                actor=self.admin,
            )
        victim = pick[0]
        with clock(_local(today - timedelta(days=15), 17)):
            stock.move(
                victim, -1, StockMovement.Reason.WASTAGE, actor=self.admin, note="Bottle dropped."
            )
        # Leave two products at or below their low-stock level so the alert has something to show.
        for product in sorted(self.products, key=lambda p: p.name)[-2:]:
            level = stock.level(product)
            if level > product.low_stock_level:
                with clock(_local(today - timedelta(days=1), 18)):
                    stock.move(
                        product,
                        -(level - product.low_stock_level),
                        StockMovement.Reason.ADJUSTMENT,
                        actor=self.admin,
                        note="Stock count: shelf was short.",
                    )

    # ------------------------------------------------------------------ payroll

    def _payroll(self, today):
        previous = (today.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
        run = payroll.create(previous, actor=self.admin)
        payroll.approve(run.id, actor=self.admin)
        payroll.mark_paid(run.id, "DEMO-PAYOUT-1", actor=self.admin)
        self.write(f"  payroll for {previous}: created, approved and marked paid")

    # ------------------------------------------------------------------ what is happening now

    def _live(self, today):
        """Work for the desk now: an online request, a held slot and a few bookings."""
        made = []
        now = timezone.now()
        for offset in (1, 2, 3):
            day = today + timedelta(days=offset)
            appt = self._book(day, check_in=False)
            if appt:
                made.append("scheduled booking")
        service, stylist = self._pick_service_and_stylist()
        variant_id = self._variant_id(service)
        for who, hold in (("karthik", False), ("divya", True)):
            customer = self.customers[who]
            for offset in (4, 5, 6):
                day = today + timedelta(days=offset)
                if booking.opening_hours(day) is None:
                    continue
                minutes = booking.quote(service, variant_id, []).duration_minutes
                starts = [s for s, _ in booking.free_starts(day, minutes, [stylist.id]) if s > now]
                if not starts:
                    continue
                start = starts[len(starts) // 2]
                appt = booking.create_request(
                    customer=customer,
                    service=service,
                    variant_id=variant_id,
                    addon_ids=[],
                    start=start,
                    stylist=stylist,
                    contact=self._contact(customer),
                    notes="",
                    allergies="",
                )
                if hold:
                    booking.confirm(
                        appt.id, actor=self.desk[0], stylist=stylist, start=start, room=None
                    )
                    made.append("booking waiting for the customer's payment")
                else:
                    made.append("new online request")
                break
        self.write("  live today: " + ", ".join(made))

    # ------------------------------------------------------------------ run

    def run(self):
        today = timezone.localdate()
        with override_settings(SALON_SMTP_CONFIGURED=False):
            self.write(f"Building {HISTORY_DAYS} days of history (this takes a minute)...")
            for back in range(HISTORY_DAYS, 0, -1):
                self._day(today - timedelta(days=back))
            self._rate()
            self._stock_story(today)
            self._payroll(today)
            self._live(today)
        c = self.counts
        self.write(
            f"  {c['visits']} visits: {c['invoices']} billed, {c['ratings']} rated, "
            f"{c['cancelled']} cancelled, {c['no_show']} no-shows"
        )


def build(write=print) -> Story:
    demo.ensure_staff(demo.DEMO_STAFF)
    demo.ensure_customers(demo.DEMO_CUSTOMERS)
    story = Story(write)
    story.run()
    return story
