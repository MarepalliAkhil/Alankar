"""Task 5d: customer data requests, export and anonymizing."""

import json
from datetime import timedelta

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog, User
from billing.models import Invoice
from billing.tests.test_marketing import call
from billing.tests.test_pos import (  # noqa: F401
    admin,
    billed,
    catalogue,
    customer,
    desk,
    pay_in_full,
    scheduled_visit,
    serum,
    visit,
)
from conftest import login
from core.models import MailOutbox
from people.models import CustomerNote, CustomerProfile, DataRequest
from scheduling.models import Appointment

MY = "/api/my/data-requests/"
ADM = "/api/admin/data-requests/"


def ask(client, kind):
    return call(client, "post", MY, {"kind": kind})


@pytest.mark.django_db
def test_customer_asks_once_per_kind_and_can_cancel(customer):
    client, user = customer
    first = ask(client, "export")
    assert first.status_code == 201 and first.json()["status"] == "pending"
    assert ask(client, "export").status_code == 400
    assert ask(client, "delete").status_code == 201
    assert ask(client, "nonsense").status_code == 400
    rid = first.json()["id"]
    assert call(client, "post", f"{MY}{rid}/cancel/").json()["status"] == "cancelled"
    assert call(client, "post", f"{MY}{rid}/cancel/").status_code == 400
    assert ask(client, "export").status_code == 201
    assert len(client.get(MY).json()) == 3
    assert AuditLog.objects.filter(action=AuditLog.Action.DATA_REQUESTED, actor=user).count() == 3


@pytest.mark.django_db
def test_export_needs_approval_then_downloads_for_seven_days(customer, admin):
    client, user = customer
    rid = ask(client, "export").json()["id"]
    assert client.get(f"{MY}{rid}/download/").status_code == 403
    done = call(admin[0], "post", f"{ADM}{rid}/decide/", {"decision": "complete"})
    assert done.status_code == 200 and done.json()["status"] == "completed"
    mine = client.get(MY).json()[0]
    assert mine["can_download"] is True
    got = client.get(f"{MY}{rid}/download/")
    assert got.status_code == 200
    data = json.loads(got.content)
    assert data["account"]["email"] == user.email and "notes_by_staff" not in got.content.decode()
    assert AuditLog.objects.filter(action=AuditLog.Action.DATA_EXPORTED, actor=user).exists()
    DataRequest.objects.filter(pk=rid).update(decided_at=timezone.now() - timedelta(days=8))
    assert client.get(f"{MY}{rid}/download/").status_code == 403


@pytest.mark.django_db
def test_export_leaves_out_staff_notes(customer, admin, desk):
    client, user = customer
    CustomerNote.objects.create(customer=user, author=desk[1], body="SECRET STAFF NOTE")
    rid = ask(client, "export").json()["id"]
    call(admin[0], "post", f"{ADM}{rid}/decide/", {"decision": "complete"})
    assert "SECRET STAFF NOTE" not in client.get(f"{MY}{rid}/download/").content.decode()


@pytest.mark.django_db
def test_decline_needs_a_reason_and_is_final(customer, admin):
    client, _ = customer
    rid = ask(client, "export").json()["id"]
    a = admin[0]
    assert call(a, "post", f"{ADM}{rid}/decide/", {"decision": "decline"}).status_code == 400
    ok = call(a, "post", f"{ADM}{rid}/decide/", {"decision": "decline", "note": "Not you"})
    assert ok.json()["status"] == "declined"
    assert call(a, "post", f"{ADM}{rid}/decide/", {"decision": "complete"}).status_code == 400
    assert client.get(f"{MY}{rid}/download/").status_code == 403
    assert AuditLog.objects.filter(action=AuditLog.Action.DATA_REQUEST_DECIDED).exists()


@pytest.mark.django_db
def test_deleting_is_blocked_while_a_visit_is_open(visit, admin):
    client, user, appt_id = visit
    rid = ask(client, "delete").json()["id"]
    listed = admin[0].get(ADM).json()[0]
    assert listed["blockers"]
    response = call(admin[0], "post", f"{ADM}{rid}/decide/", {"decision": "complete"})
    assert response.status_code == 400 and "open booking" in response.content.decode()
    user.refresh_from_db()
    assert user.is_active and user.full_name != "Deleted customer"
    assert DataRequest.objects.get(pk=rid).status == "pending"


@pytest.mark.django_db
def test_anonymizing_keeps_invoices_and_removes_the_person(visit, desk, admin, serum):
    client, user, appt_id = visit
    old_email = user.email
    CustomerNote.objects.create(customer=user, author=desk[1], body="likes tea")
    profile = CustomerProfile.objects.get(user=user)
    profile.allergies = "nuts"
    profile.marketing_opt_in = True
    profile.save()
    billed(desk, appt_id)
    invoice = Invoice.objects.get(customer=user)
    total = invoice.total
    MailOutbox.objects.create(
        to_email=old_email, subject="Receipt", body="Hi Priya", kind="receipt"
    )
    rid = ask(client, "delete").json()["id"]
    done = call(admin[0], "post", f"{ADM}{rid}/decide/", {"decision": "complete"})
    assert done.status_code == 200, done.content
    assert (
        done.json()["customer_label"] == "Deleted customer" and done.json()["customer_email"] == ""
    )

    user.refresh_from_db()
    assert not user.is_active and user.full_name == "Deleted customer"
    assert old_email not in user.email and not user.has_usable_password()
    invoice = Invoice.objects.get(pk=invoice.pk)
    assert invoice.total == total and invoice.customer_name == "Deleted customer"
    assert old_email not in invoice.customer_email
    assert not CustomerNote.objects.filter(customer=user).exists()
    profile.refresh_from_db()
    assert profile.phone == "" and profile.allergies == "" and not profile.marketing_opt_in
    appt = Appointment.objects.get(pk=appt_id)
    assert appt.contact_name == "Deleted customer" and appt.contact_phone == ""
    assert not MailOutbox.objects.filter(to_email=old_email).exists()
    assert not AuditLog.objects.filter(email__iexact=old_email).exists()
    assert AuditLog.objects.filter(action=AuditLog.Action.CUSTOMER_ANONYMIZED).exists()
    assert login(Client(), user).status_code != 200
    assert login(Client(), User(email=old_email, role="customer")).status_code != 200


@pytest.mark.django_db
def test_only_admin_decides_and_customers_only_see_their_own(customer, make_user, logged_in):
    client, _ = customer
    rid = ask(client, "export").json()["id"]
    other, _u = logged_in("customer")
    assert other.get(MY).json() == []
    assert call(other, "post", f"{MY}{rid}/cancel/").status_code == 404
    assert other.get(f"{MY}{rid}/download/").status_code == 404
    for role in ("customer", "stylist", "receptionist"):
        c = logged_in(role)[0]
        assert c.get(ADM).status_code == 403
        assert call(c, "post", f"{ADM}{rid}/decide/", {"decision": "complete"}).status_code == 403
    assert Client().get(ADM).status_code == 401
    assert DataRequest.objects.get(pk=rid).status == "pending"


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["stylist", "receptionist", "admin"])
def test_staff_have_no_customer_data_request_endpoints(logged_in, role):
    client = logged_in(role)[0]
    assert client.get(MY).status_code == 403
    assert call(client, "post", MY, {"kind": "export"}).status_code == 403
    assert Client().get(MY).status_code == 401
