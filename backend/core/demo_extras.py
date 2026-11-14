"""ADD-ONLY demo data for every feature (`python manage.py seed_demo_extras`).

The one rule: add, never change or delete. Every step goes through the normal model and service
layer (encryption, blind indexes, audit entries and constraints all apply), checks free times before
booking anything, and only ever touches rows it creates itself. Nothing here calls reset_demo,
updates an existing row on purpose or deletes anything.

Idempotent: each step has a stable key ("step:<name>") in core.DemoExtra and is skipped when that
key exists. Every row a step creates is recorded as "row:<app.model>:<pk>" (found by comparing the
primary keys of every table before and after the step), which is how `remove_demo_extras` deletes
exactly those rows and nothing else.

Known, unavoidable side effects on existing rows: numbering counters move forward when an invoice,
order or sale number is issued (InvoiceSequence, OrderSequence, Sale numbers), and the derived
recommendation tables are rebuilt by build_recommendations at the end. See docs/START_HERE.md.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.apps import apps
from django.db import transaction
from django.test import override_settings
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog, User
from core import demo
from core.demo_story import Story, clock
from core.models import DemoExtra

PASSWORD = "Demo-Extra-2026!"
DOMAIN = "alankar.test"

# (short, full name, phone, marketing consent story)
CUSTOMERS = (
    ("kavya", "Kavya Extra (rich history)", "9000000101", "in"),
    ("nikhil", "Nikhil Extra (no history yet)", "9000000102", "none"),
    ("sana", "Sana Extra (unsubscribed)", "9000000103", "withdrawn"),
    ("tara", "Tara Extra (marketing consent)", "9000000104", "in"),
)

# Coupon codes that test one rule each. All new: a code that already exists is left alone.
COUPONS = (
    ("XTRA15", "15% off, up to Rs 300", {"kind": "percent", "value": "15", "max_discount": "300"}),
    (
        "XTRAFLAT150",
        "Rs 150 off a bill of Rs 1,499 or more",
        {"kind": "flat", "value": "150", "min_bill": "1499"},
    ),
    (
        "XTRAFIRST20",
        "20% off a first visit",
        {"kind": "percent", "value": "20", "max_discount": "250", "first_visit_only": True},
    ),
    (
        "XTRAPROD10",
        "10% off products only",
        {"kind": "percent", "value": "10", "applies_to": "products"},
    ),
    ("XTRAOLD25", "Expired 25% offer", {"kind": "percent", "value": "25", "expired": True}),
    (
        "XTRAUSED1",
        "One use only (already used)",
        {"kind": "flat", "value": "50", "total_limit": 1},
    ),
)

PRODUCTS = (
    ("XTRA-SERUM", "Extra Repair Hair Serum", "Hair care", "549"),
    ("XTRA-MASK", "Extra Calm Face Mask", "Skin care", "399"),
)

# Tables that are not data about the shop (sessions, tokens) or are rebuilt from history.
IGNORED = {
    "core.demoextra",
    "sessions.session",
    "contenttypes.contenttype",
    "auth.permission",
    "token_blacklist.outstandingtoken",
    "token_blacklist.blacklistedtoken",
}


def email(short: str) -> str:
    return f"{short}.extra@{DOMAIN}"


def tracked_models():
    for model in apps.get_models():
        if model._meta.label_lower in IGNORED or model._meta.proxy:
            continue
        if not model._meta.managed:
            continue
        yield model


def snapshot() -> dict:
    return {
        m._meta.label_lower: set(m._default_manager.values_list("pk", flat=True))
        for m in tracked_models()
    }


class Extras(Story):
    """Re-uses the demo story's helpers (free-time search, desk booking, billing, rating) with
    the four extra customers only."""

    def __init__(self, write=print, *, dry_run: bool = False):
        super().__init__(write)
        self.dry_run = dry_run
        self.added: dict[str, int] = {}
        self.extra: dict[str, User] = {
            short: u
            for short, *_ in CUSTOMERS
            if (u := User.objects.filter(email=email(short)).first()) is not None
        }

    # ------------------------------------------------------------------ bookkeeping

    @contextmanager
    def step(self, name: str):
        key = f"step:{name}"
        if DemoExtra.objects.filter(key=key).exists():
            self.write(f"  {name}: already added, skipped")
            yield None
            return
        before = snapshot()
        with transaction.atomic():
            yield True
            after = snapshot()
            made = 0
            for label, pks in after.items():
                for pk in sorted(pks - before.get(label, set()), key=str):
                    DemoExtra.objects.create(
                        key=f"row:{label}:{pk}", label=label, object_pk=str(pk)
                    )
                    made += 1
            DemoExtra.objects.create(key=key, label="step")
        self.added[name] = made
        self.write(f"  {name}: {made} rows added")

    def _customer_pick(self):
        return self.extra["kavya"]

    # Story._book chooses from the demo regulars; here only the rich-history extra customer.
    def _book(self, day, *, check_in: bool, regular: bool = True, who: str = "kavya"):
        saved = self.customers
        self.customers = {"x": self.extra[who]}
        try:
            with mock.patch("core.demo_story.REGULARS", ["x"]):
                return super()._book(day, check_in=check_in, regular=regular)
        finally:
            self.customers = saved

    def _request(self, who: str, **kw):
        saved = self.customers
        self.customers = {who: self.extra[who]}
        try:
            return super()._request(who, **kw)
        finally:
            self.customers = saved

    # ------------------------------------------------------------------ steps

    def customers_step(self):
        from marketing import consent

        with self.step("customers") as go:
            if not go:
                return
            for short, name, phone, story in CUSTOMERS:
                if User.objects.filter(email__iexact=email(short)).exists():
                    continue  # never touch an existing account
                user = demo.ensure_user("customer", email(short), name, PASSWORD, phone)
                profile = user.customer_profile
                if story in ("in", "withdrawn"):
                    with clock(timezone.now() - timedelta(days=40)):
                        consent.change(profile, True, "demo")
                if story == "withdrawn":
                    with clock(timezone.now() - timedelta(days=10)):
                        consent.change(profile, False, "unsubscribe")
                self.extra[short] = user

    def coupons_step(self):
        from marketing.models import Coupon

        with self.step("coupons") as go:
            if not go:
                return
            today = timezone.localdate()
            for code, name, spec in COUPONS:
                if Coupon.objects.filter(code=code).exists():
                    continue
                spec = dict(spec)
                if spec.pop("expired", False):
                    spec["starts_on"] = today - timedelta(days=60)
                    spec["ends_on"] = today - timedelta(days=5)
                for key in ("value", "max_discount", "min_bill"):
                    if key in spec:
                        spec[key] = Decimal(spec[key])
                Coupon.objects.create(
                    code=code, name=name, description=f"Demo extra: {name}.", **spec
                )

    def products_step(self):
        from inventory import stock
        from inventory.models import Product, StockMovement
        from scheduling.models import ServiceCategory

        with self.step("products") as go:
            if not go:
                return
            for sku, name, category, price in PRODUCTS:
                if Product.objects.filter(sku=sku).exists():
                    continue
                product = Product.objects.create(
                    sku=sku,
                    name=name,
                    category=category,
                    unit_price=Decimal(price),
                    description=f"Demo extra product ({category.lower()}).",
                )
                with transaction.atomic():
                    locked = Product.objects.select_for_update().get(pk=product.pk)
                    stock.move(
                        locked,
                        30,
                        StockMovement.Reason.OPENING,
                        actor=self.admin,
                        note="Demo extra",
                    )
            # Aftercare links: a new row in the link table (the category itself is not changed).
            serum = Product.objects.get(sku="XTRA-SERUM")
            mask = Product.objects.get(sku="XTRA-MASK")
            for division, product in (("salon", serum), ("beauty-parlor", mask)):
                category = ServiceCategory.objects.filter(division=division).first()
                if (
                    category is not None
                    and not category.recommended_products.filter(pk=product.pk).exists()
                ):
                    category.recommended_products.add(product)

    def history_step(self):
        """Sixty days of visits for the rich-history customer (and a few for Tara and Sana), billed
        with tips and rated, so ratings, loyalty, rebook cycles and co-occurrence have data."""
        from people.models import Rating

        with self.step("history") as go:
            if not go:
                return
            today = timezone.localdate()
            plan = [("kavya", d) for d in range(58, 2, -5)] + [
                ("tara", 50),
                ("tara", 30),
                ("tara", 12),
                ("sana", 45),
                ("sana", 20),
            ]
            for who, back in plan:
                day = today - timedelta(days=back)
                for shift in range(4):  # the next open day when that one is closed or full
                    appt = self._book(day + timedelta(days=shift), check_in=True, who=who)
                    if appt is not None:
                        self._bill(appt)
                        break
            for invoice in self.invoices:
                appt = invoice.appointment
                rating = Rating.objects.filter(appointment=appt, status="pending").first()
                if rating is None:
                    continue
                from people import ratings as rating_service

                stars = 5 if self.rng.random() < 0.7 else 4
                with clock(min(invoice.issued_at + timedelta(hours=6), timezone.now())):
                    rating_service.submit(
                        rating.pk,
                        customer=appt.customer,
                        stars=stars,
                        comment="Lovely as always." if stars == 5 else "Good, a little late.",
                        tags=[],
                    )

    def unrated_step(self):
        """Last of all (a pending rating blocks new requests): one more billed visit for Kavya,
        left unrated, so her dashboard shows the "Rate your last visit" block."""
        with self.step("unrated visit") as go:
            if not go:
                return
            today = timezone.localdate()
            for back in (2, 3, 4, 5, 6):
                appt = self._book(today - timedelta(days=back), check_in=True, who="kavya")
                if appt is not None:
                    self._bill(appt)
                    return

    def states_step(self):
        """Bookings in every lifecycle state for the extra customers, through the real code."""
        from scheduling import approvals
        from scheduling import booking as b

        with self.step("booking states") as go:
            if not go:
                return
            made = []
            rahul, priya = self._linked("salon"), self._linked("beauty-parlor")
            cut, parlor = self._cheap_service(rahul), self._cheap_service(priya)
            far = tuple(range(9, 15))
            # Requested: waiting for both sides.
            if self._request("tara", stylist=rahul, service=cut, offsets=far):
                made.append("requested")
            # Declined by the front desk / by the stylist.
            appt = self._request("sana", stylist=rahul, service=cut, offsets=far)
            if appt:
                approvals.reception_decline(appt.id, actor=self.desk[0], reason="Fully booked.")
                made.append("declined by the front desk")
            appt = self._request("tara", stylist=priya, service=parlor, offsets=far)
            if appt:
                approvals.reception_accept(appt.id, actor=self.desk[1])
                approvals.stylist_decline(appt.id, profile=priya, actor=priya.user, reason="busy")
                made.append("declined by the stylist")
            two_days_ago = timezone.now() - timedelta(days=2)
            with clock(two_days_ago):
                appt = self._request("sana", stylist=priya, service=parlor, offsets=(5, 6, 7, 8))
            if appt:
                approvals.expire_requests()
                made.append("expired")
            with clock(two_days_ago):
                appt = self._request("tara", stylist=rahul, service=cut, offsets=(5, 6, 7, 8))
                if appt:
                    approvals.reception_accept(appt.id, actor=self.desk[0])
                    approvals.stylist_accept(appt.id, profile=rahul, actor=rahul.user)
            if appt:
                b.expire_due()
                made.append("payment link expired")
            # Awaiting payment (accepted by a receptionist and the stylist).
            appt = self._request("kavya", stylist=priya, service=parlor, offsets=far)
            if appt:
                approvals.reception_accept(appt.id, actor=self.desk[0])
                approvals.stylist_accept(appt.id, profile=priya, actor=priya.user)
                made.append("awaiting payment")
            # Scheduled and paid with a coupon; then one cancelled and one moved by the salon.
            for code, who, then in (
                ("XTRA15", "kavya", None),
                ("XTRAUSED1", "tara", None),
                ("XTRAFLAT150", "kavya", "cancel"),
                ("", "tara", "move"),
            ):
                appt = self._request(who, stylist=rahul, service=cut, offsets=far)
                if not appt:
                    continue
                approvals.reception_accept(appt.id, actor=self.desk[1])
                approvals.stylist_accept(appt.id, profile=rahul, actor=rahul.user)
                appt.refresh_from_db()
                if code:
                    try:
                        b.apply_coupon(appt.id, customer=appt.customer, token=None, code=code)
                    except b.BookingError:
                        pass  # e.g. the minimum is not met: paid without the coupon
                b.pay(appt.id, customer=appt.customer, token=None, succeed=True)
                made.append(f"scheduled{' with ' + code if code else ''}")
                appt.refresh_from_db()
                if then == "cancel":
                    b.desk_cancel(appt.id, actor=self.desk[0], reason="schedule_change")
                    made.append("cancelled by the salon")
                elif then == "move":
                    minutes = int((appt.end - appt.start).total_seconds() // 60)
                    later = [
                        s
                        for s, _ in b.free_starts(
                            timezone.localdate(appt.start), minutes, [appt.stylist_id], staff=True
                        )
                        if s > appt.start
                    ]
                    if later:
                        b.reschedule(
                            appt.id,
                            actor=self.desk[0],
                            stylist=appt.stylist,
                            start=later[0],
                            room=appt.room,
                            reason="stylist_unavailable",
                        )
                        made.append("rescheduled by the salon")
            # Any stylist, then the desk gives it to someone else (one reassignment).
            appt = self._request("kavya", stylist=None, service=cut, offsets=far, any_stylist=True)
            if appt:
                appt.refresh_from_db()
                others = [
                    s
                    for s in b.qualified_stylists(appt.service, public_only=True)
                    if s.id != appt.hold_stylist_id
                ]
                for other in others:
                    try:
                        approvals.reassign(appt.id, actor=self.desk[0], stylist=other)
                        made.append("Any stylist, reassigned once")
                        break
                    except b.BookingError:
                        continue
            # Today: checked in and in progress (only while the shop is open).
            from scheduling import stylist as stylist_visits

            today = timezone.localdate()
            for start_service in (False, True):
                appt = self._book(today, check_in=False, who="tara")
                if appt is None:
                    continue
                b.check_in(appt.id, actor=self.desk[0])
                if start_service and appt.stylist.user_id:
                    stylist_visits.start(appt.id, profile=appt.stylist, actor=appt.stylist.user)
                    made.append("in progress")
                else:
                    made.append("checked in")
            self.write("    states: " + ", ".join(made))

    def air_step(self):
        """AIR covering the desk: it accepts the desk side of a request for an extra customer, the
        stylist says yes and it is paid through the simulated link; and one Any stylist request."""
        from air import config, desk, lifecycle
        from scheduling import approvals
        from scheduling import booking as b

        if not config.get_settings().air_enabled:
            self.write("  air: AIR is switched off in this database (left as it is), skipped")
            return
        with self.step("air") as go:
            if not go:
                return
            kiran = self._linked("spa")
            spa = self._cheap_service(kiran)
            appt = self._request("tara", stylist=kiran, service=spa, offsets=tuple(range(3, 12)))
            if appt:
                desk.process(appt.id, trigger="sweep")
                approvals.stylist_accept(appt.id, profile=kiran, actor=kiran.user)
                lifecycle.sync_request(appt.id)
                appt.refresh_from_db()
                if appt.status == "awaiting_payment":
                    b.pay(appt.id, customer=appt.customer, token=None, succeed=True)
                    lifecycle.sync_request(appt.id)
            rahul = self._linked("salon")
            appt = self._request(
                "sana",
                stylist=None,
                service=self._cheap_service(rahul),
                offsets=tuple(range(3, 12)),
                any_stylist=True,
            )
            if appt:
                desk.process(appt.id, trigger="sweep")

    def wallet_step(self):
        from wallet import selling
        from wallet.models import MembershipPlan, Package, PackageItem

        with self.step("wallet") as go:
            if not go:
                return
            kavya, tara = self.extra["kavya"], self.extra["tara"]
            selling.sell_gift_card(
                amount=Decimal("1000"),
                channel="online",
                buyer=tara,
                buyer_name=tara.full_name,
                recipient_name="Kavya",
                recipient_email=kavya.email,
                message="Enjoy your day!",
            )
            # A new package and plan of its own (existing ones are never changed).
            cut = self._cheap_service(self._linked("salon"))
            package = Package.objects.create(
                name="Demo extra: 3 haircuts",
                description="Three visits for the price of two and a half.",
                price=(cut.price * Decimal("2.5")).quantize(Decimal("1")),
            )
            PackageItem.objects.create(package=package, service=cut, quantity=3)
            selling.sell_package(package.id, kavya, channel="online")
            plan = MembershipPlan.objects.create(
                name="Demo extra: Silver",
                description="10% off services for a month.",
                price=Decimal("499"),
                discount_percent=Decimal("10"),
            )
            selling.join_membership(plan.id, kavya, channel="online")

    def shop_step(self):
        from inventory.models import Product
        from shop import orders

        with self.step("shop orders") as go:
            if not go:
                return
            serum = Product.objects.get(sku="XTRA-SERUM")
            mask = Product.objects.get(sku="XTRA-MASK")
            for who, items, paid in (
                ("kavya", [{"product": str(serum.id), "quantity": 1}], True),
                ("tara", [{"product": str(mask.id), "quantity": 2}], False),
            ):
                user = self.extra[who]
                address = {
                    "full_name": user.full_name.split(" (")[0],
                    "mobile": "+91 90000 00101",
                    "line1": "1, Demo Street, Flat 2A",
                    "line2": "Labbipet",
                    "landmark": "Near the demo park",
                    "city": "Vijayawada",
                    "state": "Andhra Pradesh",
                    "pincode": "520010",
                }
                order = orders.place(user, items, address=address)
                if paid:
                    orders.pay(order.id, customer=user, succeed=True)

    def marketing_step(self):
        from marketing.models import Campaign, CampaignRecipient

        with self.step("marketing") as go:
            if not go:
                return
            now = timezone.now()
            Campaign.objects.create(
                name="Demo extra: draft",
                subject="A little something for you",
                body="A draft that has not been sent.",
                kind=Campaign.Kind.FOR_YOU,
                created_by=self.admin,
            )
            when = timezone.localtime(now + timedelta(days=3)).replace(
                hour=11, minute=0, second=0, microsecond=0
            )
            Campaign.objects.create(
                name="Demo extra: scheduled",
                subject="Most booked this month",
                body="Our most booked services.",
                kind=Campaign.Kind.MOST_BOOKED,
                status=Campaign.Status.SCHEDULED,
                scheduled_for=when,
                approved_at=now,
                approved_by=self.admin,
                created_by=self.admin,
            )
            sent_at = now - timedelta(days=6)
            sent = Campaign.objects.create(
                name="Demo extra: sent",
                subject="Time to rebook",
                body="Your usual visit is due.",
                kind=Campaign.Kind.REBOOK,
                status=Campaign.Status.SENT,
                sent_at=sent_at,
                approved_at=sent_at,
                approved_by=self.admin,
                created_by=self.admin,
                recipient_count=2,
                skipped_count=1,
            )
            # Only the extra customers: two with consent got it, one who withdrew was skipped.
            CampaignRecipient.objects.create(
                campaign=sent,
                user=self.extra["kavya"],
                status=CampaignRecipient.Status.SENT,
                sent_at=sent_at,
                clicked_at=sent_at + timedelta(hours=3),
                clicks=2,
            )
            CampaignRecipient.objects.create(
                campaign=sent,
                user=self.extra["tara"],
                status=CampaignRecipient.Status.SENT,
                sent_at=sent_at,
            )
            CampaignRecipient.objects.create(
                campaign=sent,
                user=self.extra["sana"],
                status=CampaignRecipient.Status.SKIPPED,
                reason="no marketing consent",
            )

    # ------------------------------------------------------------------ run

    STEPS = (
        "customers_step",
        "coupons_step",
        "products_step",
        "history_step",
        "states_step",
        "air_step",
        "wallet_step",
        "shop_step",
        "marketing_step",
        "unrated_step",
        "demo_coupons_step",
    )

    def demo_coupons_step(self):
        """The owner's demo coupons (core/demo_coupons.py): skipped when that admin is missing."""
        from core import demo_coupons

        try:
            demo_coupons.seed(self.write)
        except demo_coupons.NoOwnerAdmin as exc:
            self.write(f"  demo coupons: skipped ({exc})")

    def run_extras(self):
        # Only the simulated outbox: never a real email or text, even if SMTP is set up.
        with (
            override_settings(SALON_SMTP_CONFIGURED=False),
            mock.patch("core.mail.smtp_configured", return_value=False),
        ):
            for name in self.STEPS:
                getattr(self, name)()
                if name == "customers_step" and len(self.extra) < len(CUSTOMERS):
                    self.write("  Some extra customers already exist under another setup.")
        return self.added


def requirements_missing() -> str:
    """The extras build on the demo staff and catalogue; refuse politely without them."""
    for address in ("owner@demo.example.com", "reception@demo.example.com"):
        if not User.objects.filter(email=address).exists():
            return f"The demo accounts are missing ({address}). Load the demo first."
    from scheduling.models import Service

    if not Service.objects.filter(is_active=True).exists():
        return "The demo catalogue is missing. Load the demo first."
    return ""


def seed(write=print, *, dry_run: bool = False) -> dict:
    with transaction.atomic():
        extras = Extras(write, dry_run=dry_run)
        added = extras.run_extras()
        if sum(added.values()):
            audit(AuditLog.Action.DEMO_EXTRAS, actor=None, by="demo-seed", added=added)
        if dry_run:
            transaction.set_rollback(True)
    return added


def report() -> dict:
    rows = DemoExtra.objects.filter(key__startswith="row:")
    by_label: dict[str, int] = {}
    for label in rows.values_list("label", flat=True):
        by_label[label] = by_label.get(label, 0) + 1
    steps = list(DemoExtra.objects.filter(key__startswith="step:").values_list("key", flat=True))
    return {"steps": [s[5:] for s in steps], "rows": by_label}


def remove(write=print) -> int:
    """Deletes ONLY the rows recorded as created by seed_demo_extras, newest first, then their
    records. Rows that other code still protects are retried; anything left is reported."""
    from django.db.models import ProtectedError
    from django.db.utils import IntegrityError

    removed = 0
    with transaction.atomic():
        left = list(DemoExtra.objects.filter(key__startswith="row:").order_by("-id"))
        for _attempt in range(8):
            if not left:
                break
            keep = []
            for tag in left:
                model = apps.get_model(tag.label)
                rows = model._default_manager.filter(pk=tag.object_pk)
                try:
                    with transaction.atomic():
                        try:
                            rows.delete()
                        except (PermissionError, ValueError):
                            # Append-only logs refuse a normal delete; this row was created by
                            # the seed itself (it is tagged), so it is removed directly.
                            rows._raw_delete(rows.db)
                    tag.delete()
                    removed += 1
                except (ProtectedError, IntegrityError):
                    keep.append(tag)
            if len(keep) == len(left):
                break
            left = keep
        if not left:
            DemoExtra.objects.filter(key__startswith="step:").delete()
        audit(AuditLog.Action.DEMO_EXTRAS, actor=None, by="demo-seed", removed=removed)
    if left:
        write(f"  {len(left)} rows could not be removed (still in use): {left[0].label}...")
    return removed
