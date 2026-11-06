from django.db.models.signals import pre_save
from django.dispatch import receiver

from accounts.audit import audit
from accounts.models import AuditLog, User


@receiver(pre_save, sender=User)
def audit_role_change(sender, instance: User, **kwargs) -> None:
    """Every role change is audited, whichever code path made it."""
    if instance._state.adding:
        return
    previous = sender.objects.filter(pk=instance.pk).values_list("role", flat=True).first()
    if previous is not None and previous != instance.role:
        audit(
            AuditLog.Action.ROLE_CHANGED,
            target=instance,
            email=instance.email,
            old_role=previous,
            new_role=instance.role,
        )


@receiver(pre_save, sender=User)
def revoke_trusted_devices_on_risky_change(sender, instance: User, **kwargs) -> None:
    """Task 13D: a new password, a new email or a deactivated account signs out every remembered
    device, whichever code path made the change (profile, reset link, admin, lock)."""
    if instance._state.adding:
        return
    from accounts import trusted

    before = sender.objects.filter(pk=instance.pk).values("password", "email", "is_active").first()
    if before is None:
        return
    why = None
    if before["password"] != instance.password:
        why = "password_changed"
    elif before["email"] != instance.email:
        why = "email_changed"
    elif before["is_active"] and not instance.is_active:
        why = "account_locked"
    if why:
        trusted.revoke_all(instance, why=why)
