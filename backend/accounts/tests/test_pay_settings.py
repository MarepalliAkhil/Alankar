"""Task 3a: the admin sets a receptionist's hourly rate and the POS discount cap."""

from decimal import Decimal

from django.test import Client

from accounts.models import AuditLog


def patch(client, path, data):
    return client.patch(path, data, content_type="application/json")


def test_admin_sets_a_receptionist_hourly_rate_with_an_audit_entry(logged_in, make_user):
    admin, _ = logged_in("admin")
    reception = make_user(role="receptionist")
    url = f"/api/staff/{reception.id}/pay/"
    response = patch(admin, url, {"hourly_rate": "180.50"})
    assert response.status_code == 200, response.content
    assert response.json()["hourly_rate"] == "180.50"
    reception.refresh_from_db()
    assert reception.hourly_rate == Decimal("180.50")
    entry = AuditLog.objects.get(action="staff_rate_changed")
    assert entry.target == reception and entry.metadata == {"old": None, "new": "180.50"}
    # Setting the same value again writes nothing.
    patch(admin, url, {"hourly_rate": "180.50"})
    assert AuditLog.objects.filter(action="staff_rate_changed").count() == 1
    listing = admin.get("/api/staff/").json()
    assert any(row["hourly_rate"] == "180.50" for row in listing)


def test_hourly_rate_rules(logged_in, make_user):
    admin, _ = logged_in("admin")
    reception = make_user(role="receptionist")
    stylist = make_user(role="stylist")
    url = f"/api/staff/{reception.id}/pay/"
    assert patch(admin, url, {"hourly_rate": "-1"}).status_code == 400
    assert patch(admin, url, {"hourly_rate": "abc"}).status_code == 400
    assert patch(admin, url, {}).status_code == 400
    assert patch(admin, f"/api/staff/{stylist.id}/pay/", {"hourly_rate": "100"}).status_code == 400
    ghost = "00000000-0000-4000-8000-000000000000"
    assert patch(admin, f"/api/staff/{ghost}/pay/", {"hourly_rate": "100"}).status_code == 404


def test_only_the_admin_can_set_pay(logged_in, make_user):
    reception = make_user(role="receptionist")
    url = f"/api/staff/{reception.id}/pay/"
    assert patch(Client(), url, {"hourly_rate": "100"}).status_code in (401, 403)
    for role in ("receptionist", "stylist", "customer"):
        client, _ = logged_in(role)
        assert patch(client, url, {"hourly_rate": "1000"}).status_code == 403, role
    reception.refresh_from_db()
    assert reception.hourly_rate is None


def test_discount_cap_defaults_to_twenty_and_only_the_admin_changes_it(logged_in):
    admin, _ = logged_in("admin")
    reception, _ = logged_in("receptionist")
    assert admin.get("/api/settings/pos/").json() == {"discount_cap_percent": 20}
    assert reception.get("/api/settings/pos/").json() == {"discount_cap_percent": 20}
    assert patch(reception, "/api/settings/pos/", {"discount_cap_percent": 90}).status_code == 403
    assert patch(admin, "/api/settings/pos/", {"discount_cap_percent": 101}).status_code == 400
    assert patch(admin, "/api/settings/pos/", {"discount_cap_percent": -1}).status_code == 400
    done = patch(admin, "/api/settings/pos/", {"discount_cap_percent": 15})
    assert done.json() == {"discount_cap_percent": 15}
    assert reception.get("/api/settings/pos/").json() == {"discount_cap_percent": 15}
    entry = AuditLog.objects.get(action="pos_settings_changed")
    assert entry.metadata["old"]["discount_cap_percent"] == 20
    assert entry.metadata["new"]["discount_cap_percent"] == 15


def test_customers_stylists_and_guests_cannot_read_billing_settings(logged_in):
    assert Client().get("/api/settings/pos/").status_code in (401, 403)
    for role in ("customer", "stylist"):
        client, _ = logged_in(role)
        assert client.get("/api/settings/pos/").status_code == 403, role
