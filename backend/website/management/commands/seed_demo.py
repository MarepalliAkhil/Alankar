from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from people.models import StylistProfile
from scheduling.models import Service, ServiceAddon, ServiceCategory, ServiceVariant
from website.demo_data import CATALOGUE, FAQS, SITE_CONTENT, TEAM
from website.models import KnowledgeEntry, SiteContent


class Command(BaseCommand):
    help = (
        "Load demo website content: Indian-salon services with prices, team profiles, "
        "contact, hours, policies and FAQ. Safe to run again (existing items are kept)."
    )

    @transaction.atomic
    def handle(self, *args, **options):
        created = {"categories": 0, "services": 0, "team": 0, "content": 0, "faq": 0}
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
