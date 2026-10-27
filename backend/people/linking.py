"""Linking a stylist login to a team profile: one account to one profile, and back."""

from __future__ import annotations

from django.db import transaction

from people.models import Rating, StylistProfile


class LinkError(Exception):
    pass


def link_new_profile(user) -> StylistProfile:
    """A new stylist gets their own profile, hidden from the public site until the admin
    publishes it (Task 5)."""
    profile, _ = StylistProfile.objects.get_or_create(
        user=user,
        defaults={
            "display_name": (user.full_name or user.email.split("@")[0])[:80],
            "title": "Stylist",
            "is_public": False,
        },
    )
    return profile


def link_existing(user, profile: StylistProfile) -> StylistProfile:
    """Attach an account to an existing team profile (for example a demo profile).

    A profile belongs to one account and an account to one profile. If the account has an
    unpublished, never-used profile of its own (made when its invite was accepted) that one is
    replaced; anything with history is never removed.
    """
    with transaction.atomic():
        profile = StylistProfile.objects.select_for_update().get(pk=profile.pk)
        if profile.user_id == user.pk:
            return profile
        if profile.user_id is not None:
            raise LinkError("That team profile already belongs to another account.")
        mine = StylistProfile.objects.filter(user=user).first()
        if mine is not None:
            used = (
                mine.appointments.exists()
                or Rating.objects.filter(stylist=mine).exists()
                or mine.is_public
            )
            if used:
                raise LinkError("This account is already linked to a different team profile.")
            mine.delete()
        profile.user = user
        profile.save(update_fields=["user"])
        return profile
