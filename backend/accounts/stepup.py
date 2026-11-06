"""Fresh code for sensitive actions (Task 13D).

Changing the password, deleting the account and changing payment settings always ask for a code
that was entered in the last few minutes, even on a trusted device. Customers get the emailed
code; an admin with two-step sign-in uses the authenticator code. A short-lived signed cookie
remembers that the check just happened.
"""

from django.conf import settings
from django.core import signing
from rest_framework.exceptions import APIException

from accounts import otp, twofactor
from accounts.audit import audit
from accounts.models import AuditLog, OtpChallenge, User

COOKIE = "salon_fresh"
SALT = "salon.stepup"
MINUTES = 10


class FreshCodeRequired(APIException):
    status_code = 403
    default_code = "fresh_otp_required"
    default_detail = {
        "detail": "For your security, please enter a fresh code to continue.",
        "code": "fresh_otp_required",
    }


def method_for(user: User) -> str | None:
    """ "email" for customers while email codes are in force, "totp" for admins with two-step."""
    if twofactor.applies_to(user):
        return "totp"
    if user.role == User.Role.CUSTOMER and otp.otp_enabled():
        return "email"
    return None


def start(user: User, request) -> str | None:
    """Sends the emailed code for customers. Returns the method ("email", "totp") or None."""
    method = method_for(user)
    if method == "email":
        otp.issue(user, OtpChallenge.Purpose.STEP_UP, request)
    return method


def verify(user: User, code: str) -> bool:
    method = method_for(user)
    if method == "email":
        return otp.verify(user, OtpChallenge.Purpose.STEP_UP, code)
    if method == "totp":
        return twofactor.verify(user, code) is not None
    return False


def _token(user: User) -> str:
    return signing.dumps({"u": str(user.pk)}, salt=SALT)


def grant(response, user: User) -> None:
    conf = settings.SALON_AUTH
    response.set_cookie(
        COOKIE,
        _token(user),
        max_age=MINUTES * 60,
        path="/api/",
        httponly=True,
        secure=conf["COOKIE_SECURE"],
        samesite=conf["COOKIE_SAMESITE"],
    )


def is_fresh(request) -> bool:
    raw = request.COOKIES.get(COOKIE)
    if not raw:
        return False
    try:
        data = signing.loads(raw, salt=SALT, max_age=MINUTES * 60)
    except signing.BadSignature:
        return False
    return data.get("u") == str(request.user.pk)


def require_fresh(request) -> None:
    """Raises 403 fresh_otp_required unless a code was entered in the last few minutes.
    Users with no second step available (staff without two-step) are not asked."""
    if method_for(request.user) is None or is_fresh(request):
        return
    audit(
        AuditLog.Action.FRESH_OTP_REQUIRED,
        request=request,
        actor=request.user,
        target=request.user,
        path=request.path[:120],
    )
    raise FreshCodeRequired()
