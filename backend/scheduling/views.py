"""Booking API.

Customer endpoints (/api/booking/, /api/my/) only ever touch the caller's own appointments.
Desk endpoints (/api/desk/) are for receptionists and admins. Access per role comes from
shared/policy.json; the lifecycle rules live in scheduling.booking.
"""

from datetime import date, timedelta

from django.db.models import Prefetch
from django.http import Http404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from billing.models import Payment
from people import ratings
from people.models import StylistProfile
from scheduling import booking
from scheduling.models import Appointment, AppointmentEvent, Room, Service
from scheduling.serializers import (
    BookingRequestSerializer,
    CancelSerializer,
    ConfirmSerializer,
    CustomerAppointmentSerializer,
    DeskAppointmentSerializer,
    PaySerializer,
    RejectSerializer,
    RescheduleSerializer,
    RoomSerializer,
    SlotQuerySerializer,
)
from website.content import booking_settings
from website.serializers import ServiceSerializer
from website.views import active_services

S = booking.S


def booking_error(exc: booking.BookingError) -> Response:
    body: dict = {"detail": exc.message}
    code = status.HTTP_400_BAD_REQUEST
    if exc.code == "conflict":
        code = status.HTTP_409_CONFLICT
        body["slots"] = [slot.isoformat() for slot in exc.slots]
    elif exc.code == "too_soon":
        code = status.HTTP_429_TOO_MANY_REQUESTS
    elif exc.code == "ratings_pending":
        code = status.HTTP_403_FORBIDDEN
        body["code"] = "ratings_pending"
    return Response(body, status=code)


def appointment_queryset():
    return Appointment.objects.select_related(
        "service__category", "stylist", "preferred_stylist", "room"
    ).prefetch_related(Prefetch("payments", queryset=Payment.objects.all()))


def get_service(slug: str) -> Service:
    service = active_services().filter(slug=slug).first()
    if service is None:
        raise Http404
    return service


def stylist_card(profile: StylistProfile) -> dict:
    """Customer-safe stylist data: no phone, pay or schedule."""
    return {
        "id": str(profile.id),
        "display_name": profile.display_name,
        "title": profile.title,
        "photo_url": profile.photo_url,
    }


# --------------------------------------------------------------------------- customer: booking


class BookingOptionsView(APIView):
    """Everything the booking sheet needs for one service."""

    policy_action = "booking.options"

    @extend_schema(summary="Booking sheet options for a service", responses={200: None})
    def get(self, request: Request) -> Response:
        service = get_service(request.query_params.get("service", ""))
        rules = booking_settings()
        today = booking.local(timezone.now()).date()
        days = []
        for offset in range(rules["max_days_ahead"] + 1):
            day = today + timedelta(days=offset)
            if booking.opening_hours(day) is not None:
                days.append(day.isoformat())
        profile = getattr(request.user, "customer_profile", None)
        return Response(
            {
                "service": ServiceSerializer(service).data,
                "stylists": [
                    stylist_card(p) for p in booking.qualified_stylists(service, public_only=True)
                ],
                "days": days,
                "rules": {
                    key: rules[key]
                    for key in ("deposit_percent", "free_cancel_hours", "hold_hours", "gst_percent")
                },
                "pending_ratings": ratings.pending_count(request.user),
                "contact": {
                    "name": request.user.full_name,
                    "email": request.user.email,
                    "phone": profile.phone if profile else "",
                    "allergies": profile.allergies if profile else "",
                },
            }
        )


class SlotsView(APIView):
    policy_action = "booking.slots"

    @extend_schema(summary="Free start times and the price for a service choice")
    def get(self, request: Request) -> Response:
        params = SlotQuerySerializer(
            data={
                **request.query_params.dict(),
                "addons": request.query_params.getlist("addons"),
            }
        )
        params.is_valid(raise_exception=True)
        data = params.validated_data
        service = get_service(data["service"])
        try:
            quote = booking.quote(service, data.get("variant"), data.get("addons"))
        except booking.BookingError as exc:
            return booking_error(exc)
        booking.expire_due()
        stylist_ids = list(
            booking.qualified_stylists(service, public_only=True).values_list("id", flat=True)
        )
        if data.get("stylist"):
            if data["stylist"] not in stylist_ids:
                return Response(
                    {"detail": "That stylist does not offer this service."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            stylist_ids = [data["stylist"]]
        slots = booking.free_starts(data["date"], quote.duration_minutes, stylist_ids)
        return Response(
            {
                "date": data["date"].isoformat(),
                "duration_minutes": quote.duration_minutes,
                "price_total": str(quote.price_total),
                "gst_amount": str(quote.gst_amount),
                "amount_payable": str(quote.amount_payable),
                "slots": [start.isoformat() for start, _ in slots],
            }
        )


class BookingRequestView(APIView):
    policy_action = "booking.create"

    @extend_schema(
        summary="Send a booking request",
        request=BookingRequestSerializer,
        responses={201: CustomerAppointmentSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = BookingRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        service = get_service(data["service"])
        stylist = None
        if data.get("stylist"):
            stylist = StylistProfile.objects.filter(pk=data["stylist"]).first()
            if stylist is None:
                return Response(
                    {"detail": "That stylist does not offer this service."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        try:
            appt = booking.create_request(
                customer=request.user,
                service=service,
                variant_id=data.get("variant"),
                addon_ids=data.get("addons"),
                start=data["start"],
                stylist=stylist,
                contact={
                    "name": data["contact_name"],
                    "email": data["contact_email"],
                    "phone": data["contact_phone"],
                },
                notes=data["notes"],
                allergies=data["allergies"],
            )
        except booking.BookingError as exc:
            return booking_error(exc)
        appt = appointment_queryset().get(pk=appt.pk)
        return Response(CustomerAppointmentSerializer(appt).data, status=status.HTTP_201_CREATED)


# ------------------------------------------------------------------- customer: my appointments


def own_appointment(request: Request, pk) -> Appointment:
    appt = appointment_queryset().filter(pk=pk, customer=request.user).first()
    if appt is None:
        raise Http404
    return appt


class MyAppointmentListView(APIView):
    policy_action = "my.appointments.list"

    @extend_schema(
        summary="My booking requests and appointments",
        responses=CustomerAppointmentSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        booking.expire_due()
        appts = appointment_queryset().filter(customer=request.user)
        return Response(CustomerAppointmentSerializer(appts, many=True).data)


class MyAppointmentDetailView(APIView):
    policy_action = "my.appointments.read"

    @extend_schema(summary="One of my appointments", responses=CustomerAppointmentSerializer)
    def get(self, request: Request, pk) -> Response:
        booking.expire_due()
        return Response(CustomerAppointmentSerializer(own_appointment(request, pk)).data)


class MyAppointmentActionView(APIView):
    """cancel, request-cancel, arrived, reschedule and resend-link on my own appointment."""

    policy_action = "my.appointments.update"
    ACTIONS = ("cancel", "request-cancel", "arrived", "reschedule", "resend-link")

    @extend_schema(summary="Act on one of my appointments", responses=CustomerAppointmentSerializer)
    def post(self, request: Request, pk, action: str) -> Response:
        if action not in self.ACTIONS:
            raise Http404
        own_appointment(request, pk)  # 404 for anyone else's appointment
        try:
            if action == "cancel":
                body = CancelSerializer(data=request.data)
                body.is_valid(raise_exception=True)
                booking.customer_cancel(
                    pk, customer=request.user, reason=body.validated_data["reason"]
                )
            elif action == "resend-link":
                booking.resend_link(pk, customer=request.user)
            elif action == "reschedule":
                body = RescheduleSerializer(data=request.data)
                body.is_valid(raise_exception=True)
                booking.customer_flag(
                    pk,
                    customer=request.user,
                    action="reschedule",
                    preferred=body.validated_data["preferred"],
                    note=body.validated_data["note"],
                )
            else:
                body = CancelSerializer(data=request.data)
                body.is_valid(raise_exception=True)
                booking.customer_flag(
                    pk,
                    customer=request.user,
                    action=action.replace("-", "_"),
                    note=body.validated_data["reason"],
                )
        except booking.BookingError as exc:
            return booking_error(exc)
        return Response(CustomerAppointmentSerializer(own_appointment(request, pk)).data)


class PaymentView(APIView):
    """Mock gateway: shows what is due and records a success or failure."""

    policy_actions = {"GET": "my.payment.read", "POST": "my.payment.pay"}

    @extend_schema(summary="The payment due for one of my appointments", responses={200: None})
    def get(self, request: Request, pk) -> Response:
        booking.expire_due()
        appt = own_appointment(request, pk)
        token = request.query_params.get("link") or None
        link = booking.active_link(appt, token) if appt.status == S.AWAITING_PAYMENT else None
        state = "due" if link else "none"
        if appt.status == S.AWAITING_PAYMENT and link is None:
            state = "replaced"
        elif appt.status == S.PAYMENT_EXPIRED:
            state = "expired"
        elif appt.status != S.AWAITING_PAYMENT and booking.paid_amount(appt) > 0:
            state = "paid"
        return Response(
            {
                "state": state,
                "amount": str(link.amount) if link else str(appt.amount_payable),
                "expires_at": link.expires_at.isoformat() if link else None,
                "appointment": CustomerAppointmentSerializer(appt).data,
            }
        )

    @extend_schema(summary="Pay with the mock gateway", request=PaySerializer)
    def post(self, request: Request, pk) -> Response:
        own_appointment(request, pk)
        body = PaySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            _, paid = booking.pay(
                pk,
                customer=request.user,
                token=body.validated_data.get("link") or None,
                succeed=body.validated_data["outcome"] == "success",
            )
        except booking.BookingError as exc:
            return booking_error(exc)
        appt = own_appointment(request, pk)
        if not paid:
            return Response(
                {
                    "detail": "The payment did not go through and no money was taken. "
                    "You can try again.",
                    "appointment": CustomerAppointmentSerializer(appt).data,
                },
                status=status.HTTP_402_PAYMENT_REQUIRED,
            )
        return Response({"appointment": CustomerAppointmentSerializer(appt).data})


# --------------------------------------------------------------------------- desk


DESK_FILTERS = {
    "requested": [S.REQUESTED],
    "awaiting_payment": [S.AWAITING_PAYMENT],
    "payment_expired": [S.PAYMENT_EXPIRED],
    "scheduled": [S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS],
    "closed": [S.COMPLETED, S.CANCELLED, S.REJECTED, S.NO_SHOW],
}


def desk_queryset():
    return appointment_queryset().prefetch_related(
        Prefetch("events", queryset=AppointmentEvent.objects.select_related("actor"))
    )


def desk_appointment(pk) -> Appointment:
    appt = desk_queryset().filter(pk=pk).first()
    if appt is None:
        raise Http404
    return appt


class DeskAppointmentListView(APIView):
    policy_action = "desk.appointments.list"

    @extend_schema(
        summary="Booking requests and appointments (receptionist, admin)",
        responses=DeskAppointmentSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        booking.expire_due()
        qs = desk_queryset()
        wanted = request.query_params.get("status", "")
        if wanted in DESK_FILTERS:
            qs = qs.filter(status__in=DESK_FILTERS[wanted])
        counts = {
            key: Appointment.objects.filter(status__in=values).count()
            for key, values in DESK_FILTERS.items()
        }
        if wanted == "requested":
            qs = qs.order_by("preferred_start")
        return Response(
            {"counts": counts, "results": DeskAppointmentSerializer(qs[:200], many=True).data}
        )


class DeskAppointmentDetailView(APIView):
    policy_action = "desk.appointments.read"

    @extend_schema(summary="One appointment (receptionist, admin)")
    def get(self, request: Request, pk) -> Response:
        booking.expire_due()
        return Response(DeskAppointmentSerializer(desk_appointment(pk)).data)


class DeskOptionsView(APIView):
    """Stylists, rooms and free times for the confirm drawer."""

    policy_action = "desk.appointments.read"

    @extend_schema(summary="Confirm options for a request")
    def get(self, request: Request, pk) -> Response:
        booking.expire_due()
        appt = desk_appointment(pk)
        stylists = list(booking.qualified_stylists(appt.service))
        try:
            day = date.fromisoformat(request.query_params.get("date", ""))
        except ValueError:
            day = booking.local(appt.when).date()
        chosen = request.query_params.get("stylist") or (
            str(appt.preferred_stylist_id) if appt.preferred_stylist_id else ""
        )
        stylist_ids = [s.id for s in stylists if str(s.id) == chosen] or [s.id for s in stylists]
        room_id = request.query_params.get("room") or None
        starts = booking.free_starts(
            day, appt.duration_minutes, stylist_ids, room_id=room_id, exclude=appt
        )
        free_at_preferred = {
            sid
            for start, free in booking.free_starts(
                booking.local(appt.preferred_start).date(),
                appt.duration_minutes,
                [s.id for s in stylists],
                exclude=appt,
            )
            if start == appt.preferred_start
            for sid in free
        }
        division = appt.service.category.division
        rooms = Room.objects.filter(is_active=True)
        return Response(
            {
                "stylists": [
                    {
                        **stylist_card(s),
                        "free_at_preferred": s.id in free_at_preferred,
                        "preferred": s.id == appt.preferred_stylist_id,
                    }
                    for s in stylists
                ],
                "rooms": RoomSerializer(
                    sorted(rooms, key=lambda r: (r.division != division, r.sort_order, r.name)),
                    many=True,
                ).data,
                "date": day.isoformat(),
                "slots": [start.isoformat() for start, _ in starts],
            }
        )


class DeskConfirmView(APIView):
    policy_action = "desk.appointments.confirm"

    @extend_schema(summary="Confirm a request: stylist, time and room", request=ConfirmSerializer)
    def post(self, request: Request, pk) -> Response:
        desk_appointment(pk)
        body = ConfirmSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        stylist = StylistProfile.objects.filter(pk=data["stylist"]).first()
        room = Room.objects.filter(pk=data["room"]).first() if data.get("room") else None
        if stylist is None or (data.get("room") and room is None):
            return Response(
                {"detail": "Choose a stylist and room from the list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            booking.confirm(pk, actor=request.user, stylist=stylist, start=data["start"], room=room)
        except booking.BookingError as exc:
            return booking_error(exc)
        return Response(DeskAppointmentSerializer(desk_appointment(pk)).data)


class DeskRejectView(APIView):
    policy_action = "desk.appointments.reject"

    @extend_schema(summary="Reject a request with a reason", request=RejectSerializer)
    def post(self, request: Request, pk) -> Response:
        desk_appointment(pk)
        body = RejectSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            booking.reject(pk, actor=request.user, reason=body.validated_data["reason"])
        except booking.BookingError as exc:
            return booking_error(exc)
        return Response(DeskAppointmentSerializer(desk_appointment(pk)).data)


class DeskResendLinkView(APIView):
    policy_action = "desk.appointments.resend_link"

    @extend_schema(summary="Email a fresh payment link")
    def post(self, request: Request, pk) -> Response:
        desk_appointment(pk)
        try:
            booking.resend_link(pk, actor=request.user)
        except booking.BookingError as exc:
            return booking_error(exc)
        return Response(DeskAppointmentSerializer(desk_appointment(pk)).data)
