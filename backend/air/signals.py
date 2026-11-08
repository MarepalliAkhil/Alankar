"""Glue that lets AIR follow the existing booking code without editing it.

  * A receptionist signing in ends cover immediately (and hands unfinished work to the desk).
  * An AIR request that reaches "awaiting payment" gets AIR's payment-link deadline (45 minutes by
    default) instead of the usual one, before the link is created.
  * Any change to an AIR request re-syncs its hold and tells the customer, once per event.
A failure in AIR never breaks the normal booking flow: it is logged (class name only) and skipped.
"""

from __future__ import annotations

import logging

from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from accounts.models import User, WorkSession
from scheduling.models import Appointment, AppointmentStatus

logger = logging.getLogger("salon.air")


@receiver(post_save, sender=WorkSession, dispatch_uid="air_cover_ends_on_login")
def _cover_ends_on_login(sender, instance, created, **kwargs):
    if not created or instance.user.role != User.Role.RECEPTIONIST:
        return
    try:
        from air import cover

        cover.is_active(instance.started_at)
    except Exception as exc:  # never block a sign-in
        logger.error("AIR cover refresh failed: %s", type(exc).__name__)


@receiver(pre_save, sender=Appointment, dispatch_uid="air_link_deadline")
def _link_deadline(sender, instance, **kwargs):
    if instance.pk is None or instance.status != AppointmentStatus.AWAITING_PAYMENT:
        return
    fields = kwargs.get("update_fields")
    if fields is not None and "awaiting_payment_until" not in fields:
        return
    try:
        from air import links
        from air.models import AirRequestState

        updated = AirRequestState.objects.filter(
            appointment_id=instance.pk, link_deadline_set=False
        ).update(link_deadline_set=True)
        if updated:
            instance.awaiting_payment_until = links.deadline(instance)
    except Exception as exc:
        logger.error("AIR link deadline failed: %s", type(exc).__name__)


@receiver(post_save, sender=Appointment, dispatch_uid="air_desk_cover_hook")
def _desk_cover(sender, instance, **kwargs):
    """Every path that creates a booking request (the form, the shop, the chat) and the stylist's
    answer ends here: once the transaction commits, AIR looks at the waiting request. Never
    raises and never delays the booking if AIR is off."""
    if instance.status != AppointmentStatus.REQUESTED or instance.reception_status != "pending":
        return
    pk = instance.pk

    def run():
        try:
            from air import desk

            desk.process(pk, trigger="saved")
        except Exception as exc:  # `process` already catches; this is the last safety net
            logger.error("AIR desk cover hook failed: %s", type(exc).__name__)

    transaction.on_commit(run)


@receiver(post_save, sender=Appointment, dispatch_uid="air_sync_request")
def _sync(sender, instance, **kwargs):
    from air.models import AirRequestState

    if not AirRequestState.objects.filter(appointment_id=instance.pk).exists():
        return

    def run():
        try:
            from air import lifecycle

            lifecycle.sync_request(instance.pk)
        except Exception as exc:
            logger.error("AIR sync failed: %s", type(exc).__name__)

    transaction.on_commit(run)
