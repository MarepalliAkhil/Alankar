"""Task 5a: the admin manages categories, services (options, add-ons, GST, payout) and rooms.
Changes show on the public site at once, are audited with old and new values, and are admin-only."""

import json

import pytest

from accounts.models import AuditLog
from scheduling import booking
from scheduling.models import Room, Service, ServiceCategory
from scheduling.tests.test_booking import catalogue, customer, desk, requested  # noqa: F401

BASE = "/api/admin/catalogue"


def call(client, method, url, body=None):
    client.get("/api/auth/csrf/")
    kwargs = {"content_type": "application/json"}
    if body is not None:
        kwargs["data"] = json.dumps(body)
    token = client.cookies.get("csrftoken")
    headers = {"HTTP_X_CSRFTOKEN": token.value} if token is not None else {}
    return getattr(client, method)(url, **kwargs, **headers)


@pytest.fixture
def admin(logged_in):
    return logged_in("admin")


def audits():
    return list(AuditLog.objects.filter(action=AuditLog.Action.CATALOGUE_CHANGED))


def public_names(client):
    body = client.get("/api/public/services/").json()
    rows = body["results"] if isinstance(body, dict) else body
    return {r["name"] for r in rows}


NEW_SERVICE = {
    "name": "Hot Towel Shave",
    "summary": "Classic shave with a hot towel finish.",
    "audience": "men",
    "duration_minutes": 30,
    "price": "400.00",
    "gst_percent": "5.00",
    "task_payout": "120.00",
    "tags": ["shave"],
    "variants": [
        {"label": "Standard", "price": "400.00", "duration_minutes": 30},
        {"label": "Premium", "price": "600.00", "duration_minutes": 45},
    ],
    "addons": [{"label": "Face mask", "price": "150.00", "duration_minutes": 10}],
}


# --------------------------------------------------------------------------- services


@pytest.mark.django_db
def test_a_new_service_shows_on_the_public_site_at_once_and_is_audited(admin, catalogue, client):
    category = ServiceCategory.objects.first()
    assert "Hot Towel Shave" not in public_names(client)
    response = call(
        admin[0], "post", f"{BASE}/services/", {**NEW_SERVICE, "category": str(category.id)}
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert (
        body["slug"] == "hot-towel-shave"
        and len(body["variants"]) == 2
        and len(body["addons"]) == 1
    )
    assert body["gst_percent"] == "5.00" and body["task_payout"] == "120.00"
    assert "Hot Towel Shave" in public_names(client)
    (entry,) = audits()
    assert entry.metadata["entity"] == "service" and entry.metadata["change"] == "created"
    assert entry.actor == admin[1]


@pytest.mark.django_db
def test_editing_changes_the_public_price_and_records_old_and_new(admin, catalogue, client):
    haircut = catalogue["facial"]
    old_price = "800.00"
    response = call(
        admin[0],
        "patch",
        f"{BASE}/services/{haircut.id}/",
        {"price": "999.00", "task_payout": "250.00"},
    )
    assert response.status_code == 200, response.content
    public = client.get(f"/api/public/services/{haircut.slug}/").json()
    assert float(public["from_price"]) >= 999
    (entry,) = audits()
    assert entry.metadata["changes"]["price"] == [old_price, "999.00"]
    assert entry.metadata["changes"]["task_payout"][1] == "250.00"
    call(admin[0], "patch", f"{BASE}/services/{haircut.id}/", {"price": "999.00"})
    assert len(audits()) == 1  # no change, no entry


@pytest.mark.django_db
def test_hiding_a_service_removes_it_from_the_public_site_and_booking(
    admin, catalogue, client, customer
):
    haircut = catalogue["haircut"]
    call(admin[0], "patch", f"{BASE}/services/{haircut.id}/", {"is_active": False})
    assert "Haircut" not in public_names(client)
    assert client.get(f"/api/public/services/{haircut.slug}/").status_code == 404
    call(admin[0], "patch", f"{BASE}/services/{haircut.id}/", {"is_active": True})
    assert "Haircut" in public_names(client)


@pytest.mark.django_db
def test_options_and_addons_are_added_updated_and_removed(admin, catalogue):
    category = ServiceCategory.objects.first()
    made = call(
        admin[0], "post", f"{BASE}/services/", {**NEW_SERVICE, "category": str(category.id)}
    ).json()
    standard, premium = made["variants"]
    response = call(
        admin[0],
        "patch",
        f"{BASE}/services/{made['id']}/",
        {
            "variants": [{**standard, "price": "450.00"}],
            "addons": [{"label": "Beard oil", "price": "100.00", "duration_minutes": 5}],
        },
    )
    body = response.json()
    assert [v["price"] for v in body["variants"]] == ["450.00"] and body["variants"][0][
        "id"
    ] == standard["id"]
    assert [a["label"] for a in body["addons"]] == ["Beard oil"]
    changes = audits()[0].metadata["changes"]
    assert changes["variants:Premium"] == "removed" and changes["addons:Beard oil"] == "added"


@pytest.mark.django_db
def test_a_service_gst_rate_is_used_when_booking(admin, catalogue):
    haircut = catalogue["haircut"]
    plain = booking.quote(Service.objects.get(pk=haircut.pk), catalogue["short"].id)
    call(admin[0], "patch", f"{BASE}/services/{haircut.id}/", {"gst_percent": "5.00"})
    five = booking.quote(Service.objects.get(pk=haircut.pk), catalogue["short"].id)
    assert plain.price_total == five.price_total
    assert five.gst_amount < plain.gst_amount  # 5% of the price, not the salon-wide 18%
    call(admin[0], "patch", f"{BASE}/services/{haircut.id}/", {"gst_percent": None})
    assert (
        booking.quote(Service.objects.get(pk=haircut.pk), catalogue["short"].id).gst_amount
        == plain.gst_amount
    )


@pytest.mark.django_db
@pytest.mark.parametrize(
    "bad",
    [
        {"price": "-1"},
        {"duration_minutes": 0},
        {"duration_minutes": 9999},
        {"gst_percent": "90"},
        {"task_payout": "-5"},
        {"category": "00000000-0000-0000-0000-000000000000"},
        {"audience": "aliens"},
        {"name": ""},
        {"variants": [{"label": "x", "price": "-3", "duration_minutes": 10}]},
    ],
)
def test_bad_service_values_are_refused(admin, catalogue, bad):
    haircut = catalogue["haircut"]
    before = Service.objects.values().get(pk=haircut.pk)
    assert call(admin[0], "patch", f"{BASE}/services/{haircut.id}/", bad).status_code == 400
    assert Service.objects.values().get(pk=haircut.pk) == before
    assert audits() == []


@pytest.mark.django_db
def test_a_service_with_visits_cannot_be_deleted_but_an_unused_one_can(admin, catalogue, customer):
    requested(customer[0], catalogue)
    refused = call(admin[0], "delete", f"{BASE}/services/{catalogue['haircut'].id}/")
    assert refused.status_code == 409 and "Hide" in refused.json()["detail"]
    assert Service.objects.filter(pk=catalogue["haircut"].pk).exists()
    gone = call(admin[0], "delete", f"{BASE}/services/{catalogue['facial'].id}/")
    assert gone.status_code == 204
    assert not Service.objects.filter(pk=catalogue["facial"].pk).exists()
    assert audits()[0].metadata["change"] == "deleted"


@pytest.mark.django_db
def test_the_list_includes_hidden_services_with_options(admin, catalogue):
    call(admin[0], "patch", f"{BASE}/services/{catalogue['haircut'].id}/", {"is_active": False})
    rows = call(admin[0], "get", f"{BASE}/services/").json()
    hidden = next(r for r in rows if r["name"] == "Haircut")
    assert hidden["is_active"] is False and hidden["variants"]
    options = call(admin[0], "get", f"{BASE}/options/").json()
    assert {d["value"] for d in options["divisions"]} == {"salon", "spa", "beauty-parlor"}


# --------------------------------------------------------------------------- categories, rooms


@pytest.mark.django_db
def test_categories_are_managed_and_only_empty_ones_are_deleted(admin, catalogue, client):
    made = call(
        admin[0],
        "post",
        f"{BASE}/categories/",
        {"division": "spa", "name": "Facials Plus", "sort_order": 3},
    )
    assert made.status_code == 201 and made.json()["slug"] == "spa-facials-plus"
    again = call(
        admin[0], "post", f"{BASE}/categories/", {"division": "spa", "name": "Facials Plus"}
    )
    assert again.json()["slug"] == "spa-facials-plus-2"
    new_id = made.json()["id"]
    renamed = call(
        admin[0], "patch", f"{BASE}/categories/{new_id}/", {"name": "Face Care", "is_active": False}
    )
    assert renamed.json()["name"] == "Face Care" and renamed.json()["slug"] == "spa-facials-plus"
    assert audits()[0].metadata["changes"]["name"] == ["Facials Plus", "Face Care"]
    assert call(admin[0], "delete", f"{BASE}/categories/{new_id}/").status_code == 204
    used = ServiceCategory.objects.filter(services__isnull=False).first()
    assert call(admin[0], "delete", f"{BASE}/categories/{used.id}/").status_code == 409
    assert (
        call(
            admin[0], "post", f"{BASE}/categories/", {"division": "casino", "name": "x"}
        ).status_code
        == 400
    )
    listed = call(admin[0], "get", f"{BASE}/categories/").json()
    assert any(c["service_count"] > 0 for c in listed)


@pytest.mark.django_db
def test_rooms_are_managed_and_a_used_room_is_only_hidden(admin, catalogue, customer, desk):
    made = call(admin[0], "post", f"{BASE}/rooms/", {"name": "Chair 9", "division": "salon"})
    assert made.status_code == 201
    dup = call(admin[0], "post", f"{BASE}/rooms/", {"name": "chair 9", "division": "salon"})
    assert dup.status_code == 400
    room_id = made.json()["id"]
    call(admin[0], "patch", f"{BASE}/rooms/{room_id}/", {"is_active": False, "name": "Chair Nine"})
    assert Room.objects.get(pk=room_id).name == "Chair Nine"
    assert audits()[0].metadata["changes"]["is_active"] == ["True", "False"]
    assert call(admin[0], "delete", f"{BASE}/rooms/{room_id}/").status_code == 204

    from scheduling.tests.test_booking import confirm, day_at

    appt = requested(customer[0], catalogue, start=day_at(3, 11).isoformat())
    assert (
        confirm(
            desk[0], appt, catalogue["asha"], day_at(3, 11), room=catalogue["chair"]
        ).status_code
        == 200
    )
    refused = call(admin[0], "delete", f"{BASE}/rooms/{catalogue['chair'].id}/")
    assert refused.status_code == 409


# --------------------------------------------------------------------------- admin only


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["customer", "stylist", "receptionist"])
def test_nobody_but_the_admin_can_manage_the_catalogue(role, logged_in, catalogue):
    client, _ = logged_in(role)
    haircut, chair = catalogue["haircut"], catalogue["chair"]
    category = ServiceCategory.objects.first()
    attempts = [
        ("get", f"{BASE}/services/", None),
        ("post", f"{BASE}/services/", {**NEW_SERVICE, "category": str(category.id)}),
        ("get", f"{BASE}/services/{haircut.id}/", None),
        ("patch", f"{BASE}/services/{haircut.id}/", {"price": "1.00"}),
        ("delete", f"{BASE}/services/{haircut.id}/", None),
        ("get", f"{BASE}/categories/", None),
        ("post", f"{BASE}/categories/", {"division": "spa", "name": "X"}),
        ("patch", f"{BASE}/categories/{category.id}/", {"name": "Hacked"}),
        ("delete", f"{BASE}/categories/{category.id}/", None),
        ("get", f"{BASE}/rooms/", None),
        ("post", f"{BASE}/rooms/", {"name": "Hack", "division": "spa"}),
        ("patch", f"{BASE}/rooms/{chair.id}/", {"name": "Hacked"}),
        ("delete", f"{BASE}/rooms/{chair.id}/", None),
        ("get", f"{BASE}/options/", None),
    ]
    for method, url, body in attempts:
        assert call(client, method, url, body).status_code == 403, (role, method, url)
    haircut.refresh_from_db()
    assert haircut.name == "Haircut" and Room.objects.filter(pk=chair.pk).exists()
    assert audits() == []


@pytest.mark.django_db
def test_guests_cannot_reach_the_catalogue_admin(client, catalogue):
    assert client.get(f"{BASE}/services/").status_code in (401, 403)
    assert client.post(f"{BASE}/rooms/", {}, content_type="application/json").status_code in (
        401,
        403,
    )
