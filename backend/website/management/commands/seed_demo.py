from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from inventory.models import Product, StockMovement
from people.models import StylistProfile
from scheduling.models import Room, Service, ServiceAddon, ServiceCategory, ServiceVariant
from website.demo_data import CATALOGUE, FAQS, PRODUCTS, ROOMS, SITE_CONTENT, TEAM
from website.models import KnowledgeEntry, SiteContent


class Command(BaseCommand):
    help = (
        "Load demo website content: Indian-salon services with prices, team profiles, "
        "rooms, booking rules, contact, hours, policies and FAQ. Safe to run again "
        "(existing items are kept)."
    )

    @transaction.atomic
    def handle(self, *args, **options):
        created = {
            "categories": 0,
            "services": 0,
            "team": 0,
            "rooms": 0,
            "content": 0,
            "faq": 0,
            "products": 0,
        }
        services_by_division: dict[str, list[Service]] = {}
        for c_order, (division, category_name, services) in enumerate(CATALOGUE):
            category, made = ServiceCategory.objects.get_or_create(
                slug=slugify(f"{division}-{category_name}"),
                defaults={"division": division, "name": category_name, "sort_order": c_order},
            )
            created["categories"] += int(made)
            for s_order, row in enumerate(services):
                name, audience, minutes, price, summary, variants, addons, tags = row
                service, made = Service.objects.get_or_create(
                    slug=slugify(name),
                    defaults={
                        "category": category,
                        "name": name,
                        "audience": audience,
                        "duration_minutes": minutes,
                        "price": price,
                        "summary": summary,
                        "tags": tags,
                        "sort_order": s_order,
                    },
                )
                created["services"] += int(made)
                services_by_division.setdefault(division, []).append(service)
                if made:
                    for v_order, (label, v_price, v_minutes) in enumerate(variants):
                        ServiceVariant.objects.create(
                            service=service,
                            label=label,
                            price=v_price,
                            duration_minutes=v_minutes,
                            sort_order=v_order,
                        )
                    for a_order, (label, a_price, a_minutes) in enumerate(addons):
                        ServiceAddon.objects.create(
                            service=service,
                            label=label,
                            price=a_price,
                            duration_minutes=a_minutes,
                            sort_order=a_order,
                        )
        # Flat pay per completed task: 30% of the cheapest price, rounded to whole rupees. The
        # admin edits these later (Task 5/6). Only services without a payout are filled in.
        for service in Service.objects.filter(task_payout__isnull=True):
            service.task_payout = (service.from_price * Decimal("0.30")).quantize(Decimal("1"))
            service.save(update_fields=["task_payout"])
        for order, (name, title, specialization, divisions) in enumerate(TEAM):
            profile, made = StylistProfile.objects.get_or_create(
                display_name=name,
                defaults={
                    "title": title,
                    "specialization": specialization,
                    "divisions": divisions,
                    "sort_order": order,
                },
            )
            created["team"] += int(made)
            if made:
                for division in divisions:
                    profile.services.add(*services_by_division.get(division, []))
        for order, (name, division) in enumerate(ROOMS):
            _, made = Room.objects.get_or_create(
                name=name, defaults={"division": division, "sort_order": order}
            )
            created["rooms"] += int(made)
        for order, (sku, name, category, price, gst, opening, low) in enumerate(PRODUCTS):
            product, made = Product.objects.get_or_create(
                sku=sku,
                defaults={
                    "name": name,
                    "category": category,
                    "unit_price": price,
                    "gst_percent": gst,
                    "low_stock_level": low,
                    "sort_order": order,
                },
            )
            created["products"] += int(made)
            if made:  # stock only ever enters through the ledger
                StockMovement.objects.create(
                    product=product,
                    delta=opening,
                    reason=StockMovement.Reason.OPENING,
                    note="Opening stock (demo data)",
                )
        for key, value in SITE_CONTENT.items():
            _, made = SiteContent.objects.get_or_create(key=key, defaults={"value": value})
            created["content"] += int(made)
        for order, (question, answer) in enumerate(FAQS):
            _, made = KnowledgeEntry.objects.get_or_create(
                question=question, defaults={"answer": answer, "sort_order": order}
            )
            created["faq"] += int(made)
        summary = ", ".join(f"{count} {name}" for name, count in created.items())
        self.stdout.write(self.style.SUCCESS(f"Demo content loaded ({summary} added)."))
