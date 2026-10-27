"""Customer-safe invoice data: own invoices only, no staff details."""

from rest_framework import serializers

from billing.models import Invoice, InvoiceItem


class InvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceItem
        fields = ["description", "quantity", "unit_price", "amount"]


class InvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    service_name = serializers.CharField(source="appointment.service_name", read_only=True)
    visit_start = serializers.DateTimeField(source="appointment.start", read_only=True)
    stylist_name = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id",
            "number",
            "status",
            "status_label",
            "issued_at",
            "service_name",
            "visit_start",
            "stylist_name",
            "customer_name",
            "subtotal",
            "gst_amount",
            "total",
            "prepaid_amount",
            "balance_paid",
            "items",
        ]

    def get_stylist_name(self, obj: Invoice) -> str | None:
        stylist = obj.appointment.stylist
        return stylist.display_name if stylist else None
