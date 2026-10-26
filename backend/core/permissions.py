from django.middleware.csrf import CsrfViewMiddleware
from rest_framework import exceptions
from rest_framework.permissions import SAFE_METHODS, BasePermission

from core import policy


class _CSRFCheck(CsrfViewMiddleware):
    def _reject(self, request, reason):
        return reason


def enforce_csrf(request) -> None:
    """Double-submit CSRF check (csrftoken cookie + X-CSRFToken header) for unsafe methods."""
    check = _CSRFCheck(lambda req: None)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason:
        raise exceptions.PermissionDenied(f"CSRF failed: {reason}")


def view_action(view, method: str) -> str | None:
    actions = getattr(view, "policy_actions", None)
    if isinstance(actions, dict):
        if method in actions:
            return actions[method]
        if method in ("HEAD", "OPTIONS"):
            return actions.get("GET")
        return None
    return getattr(view, "policy_action", None)


class PolicyPermission(BasePermission):
    """Allows a request only if the view's policy action is public or granted to the role.

    Views that do not declare a known action are always denied.
    """

    def has_permission(self, request, view) -> bool:
        action = view_action(view, request.method)
        if not action or action not in policy.known_actions():
            return False
        if request.method not in SAFE_METHODS:
            enforce_csrf(request._request)
        if policy.is_public_action(action):
            return True
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return policy.role_can(getattr(user, "role", None), action)
