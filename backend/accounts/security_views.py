"""Admin: audit log viewer, sign-in security (failures and locks) and staff sessions."""

import csv
import re
from datetime import datetime, time, timedelta

from django.conf import settings
from django.core.paginator import Paginator
from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from accounts import lockout, work
from accounts.audit import audit
from accounts.models import AuditLog, LoginAttempt, LoginLock, User, WorkSession
from billing.report_views import safe_cell

PAGE_SIZE = 50
SECRET_KEY = re.compile(r"password|token|secret|code|hash|otp|authorization|cookie|key", re.I)
MASK = "••••"
STAFF_ROLES = (User.Role.ADMIN, User.Role.STYLIST, User.Role.RECEPTIONIST)


def mask(value):
    """Hides the value of any metadata key that looks like a secret, at any depth."""
    if isinstance(value, dict):
        return {k: (MASK if SECRET_KEY.search(str(k)) else mask(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [mask(v) for v in value]
    return value


def _day(text: str, end: bool = False):
    try:
        d = datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        raise ValidationError({"detail": "Dates must look like 2026-10-27."}) from None
    return timezone.make_aware(datetime.combine(d, time.max if end else time.min))


def _filtered(params):
    qs = AuditLog.objects.select_related("actor", "target")
    if params.get("action"):
        qs = qs.filter(action=params["action"])
    if params.get("actor"):
        qs = qs.filter(actor__email__icontains=params["actor"])
    if params.get("from"):
        qs = qs.filter(created_at__gte=_day(params["from"]))
    if params.get("to"):
        qs = qs.filter(created_at__lte=_day(params["to"], end=True))
    text = (params.get("q") or "").strip()
    if text:
        qs = qs.filter(
            Q(email__icontains=text)
            | Q(actor__email__icontains=text)
            | Q(ip_address__icontains=text)
            | Q(action__icontains=text)
        )
    return qs


def _row(e: AuditLog) -> dict:
    return {
        "id": e.id,
        "action": e.action,
        "actor_email": e.actor.email if e.actor else "",
        "target_email": e.target.email if e.target else "",
        "email": e.email,
        "ip_address": e.ip_address,
        "metadata": mask(e.metadata),
        "created_at": e.created_at,
    }


class AuditLogView(APIView):
    policy_action = "audit.list"

    @extend_schema(
        summary="Audit log with filters, paging and CSV export",
        parameters=[
            OpenApiParameter(n, str)
            for n in ("action", "actor", "q", "from", "to", "page", "export")
        ],
        responses={200: None},
    )
    def get(self, request: Request):
        qs = _filtered(request.query_params)
        page = Paginator(qs, PAGE_SIZE)
        try:
            number = int(request.query_params.get("page", 1))
        except ValueError:
            number = 1
        current = page.get_page(number)
        return Response(
            {
                "count": page.count,
                "page": current.number,
                "pages": page.num_pages,
                "results": [_row(e) for e in current.object_list],
                "actions": [{"value": v, "label": label} for v, label in AuditLog.Action.choices],
            }
        )


class AuditExportView(APIView):
    policy_action = "audit.export"

    @extend_schema(summary="Audit log as a CSV download (same filters)", responses={200: None})
    def get(self, request: Request):
        rows = _filtered(request.query_params)[:20000]
        audit(AuditLog.Action.AUDIT_EXPORTED, request=request, actor=request.user, rows=len(rows))
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="audit-log.csv"'
        writer = csv.writer(response)
        writer.writerow(["When", "Action", "Actor", "Target", "Email", "IP", "Details"])
        for e in rows:
            r = _row(e)
            writer.writerow(
                [
                    safe_cell(x)
                    for x in (
                        r["created_at"].isoformat(),
                        r["action"],
                        r["actor_email"],
                        r["target_email"],
                        r["email"],
                        r["ip_address"] or "",
                        r["metadata"],
                    )
                ]
            )
        return response


def _failures(since):
    return LoginAttempt.objects.filter(succeeded=False, created_at__gte=since)


class SecurityOverviewView(APIView):
    policy_action = "security.view"

    @extend_schema(summary="Failed sign-ins and locked accounts", responses={200: None})
    def get(self, request: Request) -> Response:
        now = timezone.now()
        since = now - timedelta(days=7)
        failures = _failures(since)
        by_email = failures.values("email").annotate(n=Count("id")).order_by("-n", "email")[:10]
        recent = failures.order_by("-created_at")[:25]
        locks = LoginLock.objects.filter(locked_until__gt=now).order_by("locked_until")
        return Response(
            {
                "failed_7d": failures.count(),
                "top_emails": [{"email": r["email"], "count": r["n"]} for r in by_email],
                "recent_failures": [
                    {"email": a.email, "ip_address": a.ip_address, "at": a.created_at}
                    for a in recent
                ],
                "locks": [{"email": lk.email, "locked_until": lk.locked_until} for lk in locks],
                "lockouts_7d": AuditLog.objects.filter(
                    action=AuditLog.Action.LOCKOUT, created_at__gte=since
                ).count(),
            }
        )


class UnlockView(APIView):
    policy_action = "security.unlock"

    @extend_schema(summary="Lift a sign-in lock", request=None, responses={200: None})
    def post(self, request: Request) -> Response:
        email = str(request.data.get("email", "")).strip()
        if not email or not LoginLock.objects.filter(email=email).exists():
            raise ValidationError({"detail": "That email is not locked."})
        lockout.clear_lock(email)
        audit(AuditLog.Action.LOCK_CLEARED, request=request, actor=request.user, email=email)
        return Response({"detail": "Unlocked."})


def _current_jti(request) -> str:
    raw = request.COOKIES.get(settings.SALON_AUTH["REFRESH_COOKIE"])
    if not raw:
        return ""
    try:
        return str(RefreshToken(raw).get("jti", ""))
    except Exception:
        return ""


def _live_sessions():
    now = timezone.now()
    return (
        OutstandingToken.objects.filter(
            user__role__in=STAFF_ROLES, user__is_active=True, expires_at__gt=now
        )
        .exclude(id__in=BlacklistedToken.objects.values("token_id"))
        .select_related("user")
        .order_by("-created_at")
    )


class StaffSessionListView(APIView):
    policy_action = "security.view"

    @extend_schema(summary="Signed-in staff sessions", responses={200: None})
    def get(self, request: Request) -> Response:
        mine = _current_jti(request)
        return Response(
            [
                {
                    "id": t.jti,
                    "email": t.user.email,
                    "name": t.user.full_name,
                    "role": t.user.role,
                    "signed_in_at": t.created_at,
                    "expires_at": t.expires_at,
                    "current": t.jti == mine,
                }
                for t in _live_sessions()
            ]
        )


class StaffSessionRevokeView(APIView):
    policy_action = "security.sessions.revoke"

    @extend_schema(summary="Sign out one staff session", request=None, responses={200: None})
    def post(self, request: Request, jti: str) -> Response:
        token = _live_sessions().filter(jti=jti).first()
        if token is None:
            return Response({"detail": "Session not found."}, status=status.HTTP_404_NOT_FOUND)
        if jti == _current_jti(request):
            raise ValidationError({"detail": "This is your own session. Use Sign out instead."})
        BlacklistedToken.objects.get_or_create(token=token)
        work.end(token.user, reason=WorkSession.EndReason.CORRECTED)
        audit(
            AuditLog.Action.SESSION_REVOKED,
            request=request,
            actor=request.user,
            target=token.user,
        )
        return Response({"detail": "Signed out."})
