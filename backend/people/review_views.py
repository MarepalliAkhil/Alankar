"""Admin: staff summary graphs and monthly performance reviews. Staff never see reviews."""

from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from people import reviews, staff_summary


class StaffSummaryView(APIView):
    policy_action = "staffsummary.read"

    @extend_schema(summary="Graphs and numbers per staff member and for the team", responses=None)
    def get(self, request: Request) -> Response:
        try:
            start, end = staff_summary.parse_range(request.query_params)
        except staff_summary.RangeError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(staff_summary.build(start, end))


class ReviewListView(APIView):
    policy_action = "reviews.read"

    @extend_schema(summary="Indicators and saved review for every staff member", responses=None)
    def get(self, request: Request) -> Response:
        try:
            return Response(reviews.overview(request.query_params.get("month")))
        except reviews.ReviewError as exc:
            return Response({"detail": str(exc)}, status=400)


def staff_or_404(pk) -> User:
    user = User.objects.filter(pk=pk, role__in=[User.Role.STYLIST, User.Role.RECEPTIONIST]).first()
    if user is None:
        raise Http404
    return user


class ReviewSaveSerializer(serializers.Serializer):
    month = serializers.CharField(max_length=7)
    status = serializers.ChoiceField(choices=["continue", "notice", "recommend_end"])
    notes = serializers.CharField(max_length=2000, allow_blank=True, required=False, default="")


class ReviewPersonView(APIView):
    policy_actions = {"GET": "reviews.read", "PUT": "reviews.write"}

    @extend_schema(summary="Past reviews of one staff member", responses=None)
    def get(self, request: Request, pk) -> Response:
        return Response(reviews.history(staff_or_404(pk)))

    @extend_schema(
        summary="Save the review of a staff member for a month", request=ReviewSaveSerializer
    )
    def put(self, request: Request, pk) -> Response:
        user = staff_or_404(pk)
        body = ReviewSaveSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            review = reviews.save(
                user,
                data["month"],
                data["status"],
                data["notes"],
                actor=request.user,
                request=request,
            )
        except reviews.ReviewError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(reviews.row(review))
