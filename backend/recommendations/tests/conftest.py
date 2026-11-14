from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from django.test import Client
from django.utils import timezone

from conftest import login
from people.models import CustomerProfile, StylistProfile
from scheduling.models import Appointment, AppointmentStatus, Service, ServiceCategory


@pytest.fixture
def shop(db):
    """Two categories in two divisions, six services and three public stylists."""
    hair = ServiceCategory.objects.create(division="salon", name="Hair", slug="t-hair")
    colour = ServiceCategory.objects.create(division="salon", name="Colour", slug="t-colour")
    nails = ServiceCategory.objects.create(division="beauty-parlor", name="Nails", slug="t-nails")

    def svc(cat, name, minutes=30, price="500", tags=()):
        return Service.objects.create(
            category=cat,
            name=name,
            slug=name.lower().replace(" ", "-"),
            summary=name,
            price=Decimal(price),
            duration_minutes=minutes,
            tags=list(tags),
        )

    s = {
        "cut": svc(hair, "Cut"),
        "trim": svc(hair, "Trim", 20),
        "wash": svc(hair, "Wash", 15),
        "colour": svc(colour, "Colour", 60),
        "mani": svc(nails, "Mani"),
        "pedi": svc(nails, "Pedi"),
    }
    asha = StylistProfile.objects.create(display_name="Asha", title="Stylist")
    ravi = StylistProfile.objects.create(display_name="Ravi", title="Stylist")
    meena = StylistProfile.objects.create(display_name="Meena", title="Nails")
    for p in (asha, ravi):
        p.services.add(s["cut"], s["trim"], s["wash"], s["colour"])
    meena.services.add(s["mani"], s["pedi"])
    s.update(asha=asha, ravi=ravi, meena=meena, hair=hair, colour_cat=colour, nails=nails)
    return s


def at(days_ago: int, hour: int = 11) -> datetime:
    day = timezone.localdate() - timedelta(days=days_ago)
    return datetime.combine(day, time(hour, 0), tzinfo=timezone.get_current_timezone())


def visit(user, service, days_ago, stylist=None, hour=11, status=AppointmentStatus.COMPLETED):
    start = at(days_ago, hour)
    return Appointment.objects.create(
        customer=user,
        service=service,
        service_name=service.name,
        duration_minutes=service.min_duration,
        price_total=service.price,
        gst_amount=Decimal("0"),
        amount_payable=service.price,
        preferred_start=start,
        stylist=stylist,
        start=start,
        end=start + timedelta(minutes=service.min_duration),
        status=status,
        contact_name=user.full_name,
        contact_email=user.email,
        policy_accepted_at=start,
    )


def customer_with_profile(make_user, email, opted_in=False):
    user = make_user(role="customer", email=email)
    profile = CustomerProfile(user=user)
    profile.set_phone("9876543210")
    profile.set_marketing(opted_in)
    profile.save()
    return user


@pytest.fixture
def crowd(shop, make_user):
    """Eight customers: most who had a Cut also had a Trim; Mani goes with Pedi."""
    people = []
    for i in range(8):
        user = customer_with_profile(make_user, f"crowd{i}@example.com")
        visit(user, shop["cut"], 60 - i, shop["asha"])
        if i < 6:
            visit(user, shop["trim"], 55 - i, shop["asha"])
        if i >= 4:
            visit(user, shop["mani"], 50 - i, shop["meena"])
            visit(user, shop["pedi"], 49 - i, shop["meena"])
        people.append(user)
    return people


@pytest.fixture
def me(make_user, shop):
    """A signed-in customer who had one Cut 40 days ago with Asha."""
    user = customer_with_profile(make_user, "me@example.com", opted_in=True)
    client = Client()
    assert login(client, user).status_code == 200
    return client, user
