from accounts.models import AuditLog


def client_ip(request) -> str | None:
    if request is None:
        return None
    return request.META.get("REMOTE_ADDR") or None


def audit(action: str, *, request=None, actor=None, target=None, email: str = "", **metadata):
    """Writes one audit entry. Never store passwords, tokens or other secrets in metadata."""
    user_agent = ""
    if request is not None:
        user_agent = (request.META.get("HTTP_USER_AGENT") or "")[:200]
    if actor is not None and not getattr(actor, "is_authenticated", False):
        actor = None
    return AuditLog.objects.create(
        action=action,
        actor=actor,
        target=target,
        email=email or (getattr(target, "email", "") if target else ""),
        ip_address=client_ip(request),
        user_agent=user_agent,
        metadata=metadata,
    )
