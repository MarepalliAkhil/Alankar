import pytest
from django.core.management import call_command
from django.test import Client

from people.models import StylistProfile
from scheduling.models import Service
from website.models import Achievement, Offer


@pytest.fixture
def seeded(db):
    call_command("seed_demo")


@pytest.mark.django_db
def test_seed_is_idempotent(seeded):
    count = Service.objects.count()
    call_command("seed_demo")
    assert Service.objects.count() == count > 20


@pytest.mark.django_db
def test_site_content_is_public_and_from_database(seeded):
    body = Client().get("/api/public/site/").json()
    assert body["hero"]["headline"]
    assert body["contact"]["phone"]
    assert body["stats"]["services"] == Service.objects.filter(is_active=True).count()
    assert set(body["stats"]["divisions"]) == {"salon", "spa", "beauty-parlor"}
    assert len(body["faqs"]) >= 3
    # Nothing invented: achievements and offers come only from the owner.
    assert body["achievements"] == [] and body["offers"] == []


@pytest.mark.django_db
def test_site_lists_only_active_unexpired_offers_and_achievements(seeded):
    from datetime import date, timedelta

    Offer.objects.create(title="Monsoon offer", description="10% off hair spa")
    Offer.objects.create(title="Old", description="x", valid_until=date.today() - timedelta(1))
    Offer.objects.create(title="Hidden", description="x", is_active=False)
    Achievement.objects.create(label="Happy clients", value=500, suffix="+")
    body = Client().get("/api/public/site/").json()
    assert [o["title"] for o in body["offers"]] == ["Monsoon offer"]
    assert body["achievements"][0]["value"] == 500


@pytest.mark.django_db
def test_services_filter_by_division_audience_category_and_search(seeded):
    client = Client()
    salon = client.get("/api/public/services/?division=salon").json()
    assert salon and {s["division"] for s in salon} == {"salon"}
    men = client.get("/api/public/services/?division=salon&audience=men").json()
    assert {s["audience"] for s in men} <= {"men", "unisex"}
    assert "Women's Haircut" not in {s["name"] for s in men}
    kids = client.get("/api/public/services/?audience=kids").json()
    assert "Kids' Haircut" in {s["name"] for s in kids}
    massages = client.get("/api/public/services/?category=spa-massages").json()
    assert {s["category"]["slug"] for s in massages} == {"spa-massages"}
    bridal = client.get("/api/public/services/?q=bridal").json()
    assert [s["name"] for s in bridal] == ["Bridal Makeup"]
    assert {a["label"] for a in bridal[0]["addons"]} == {"Saree draping", "Bridal hairdo"}


@pytest.mark.django_db
def test_from_price_is_the_cheapest_active_variant(seeded):
    service = Service.objects.get(slug="womens-haircut")
    body = Client().get(f"/api/public/services/{service.slug}/").json()
    assert body["from_price"] == "500.00"
    assert [v["label"] for v in body["variants"]] == ["Short hair", "Medium hair", "Long hair"]
    service.variants.filter(label="Short hair").update(is_active=False)
    body = Client().get(f"/api/public/services/{service.slug}/").json()
    assert body["from_price"] == "700.00" and len(body["variants"]) == 2


@pytest.mark.django_db
def test_inactive_services_are_hidden(seeded):
    Service.objects.filter(slug="manicure").update(is_active=False)
    assert Client().get("/api/public/services/manicure/").status_code == 404
    names = {s["name"] for s in Client().get("/api/public/services/").json()}
    assert "Manicure" not in names


@pytest.mark.django_db
def test_team_is_customer_safe(seeded, make_user):
    stylist = make_user(role="stylist", email="rahul@example.com")
    StylistProfile.objects.filter(display_name="Rahul").update(user=stylist)
    team = Client().get("/api/public/team/").json()
    assert {m["display_name"] for m in team} >= {"Rahul", "Arun", "Kiran", "Priya"}
    for member in team:
        assert set(member) == {
            "id",
            "display_name",
            "title",
            "specialization",
            "bio",
            "photo_url",
            "divisions",
            "rating",
        }
        assert member["rating"] is None  # no ratings until Task 6, never invented
    assert "rahul@example.com" not in str(team)
    spa = Client().get("/api/public/team/?division=spa").json()
    assert [m["display_name"] for m in spa] == ["Kiran"]


@pytest.mark.django_db
def test_policy_pages(seeded):
    page = Client().get("/api/public/pages/cancellation/").json()
    assert page["title"] == "Cancellation policy" and "24 hours" in page["body"]
    assert Client().get("/api/public/pages/secret/").status_code == 404


@pytest.mark.django_db
def test_public_endpoints_are_read_only(seeded):
    for url in ["/api/public/site/", "/api/public/services/", "/api/public/team/"]:
        assert Client().post(url, {}, content_type="application/json").status_code == 405
