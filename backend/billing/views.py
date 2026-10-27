"""Customer invoices (Task 2c). Customers only ever see their own."""

from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from billing.models import Invoice
from billing.serializers import InvoiceSerializer


def own_invoices(request: Request):
    return (
        Invoice.objects.filter(customer=request.user)
        .select_related("appointment__stylist")
        .prefetch_related("items")
    )


class MyInvoiceListView(APIView):
    policy_action = "my.invoices.list"

    @extend_schema(summary="My invoices", responses=InvoiceSerializer(many=True))
    def get(self, request: Request) -> Response:
        return Response(InvoiceSerializer(own_invoices(request), many=True).data)


class MyInvoiceDetailView(APIView):
    policy_action = "my.invoices.read"

    @extend_schema(summary="One of my invoices", responses=InvoiceSerializer)
    def get(self, request: Request, pk) -> Response:
        invoice = own_invoices(request).filter(pk=pk).first()
        if invoice is None:
            raise Http404
        return Response(InvoiceSerializer(invoice).data)
