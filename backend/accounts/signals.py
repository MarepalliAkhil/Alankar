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
