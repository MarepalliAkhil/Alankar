"""Linking a stylist login to a team profile: one account to one profile, and back."""

from __future__ import annotations

from django.db import transaction

from people.models import Rating, StylistProfile


class LinkError(Exception):
    pass


def link_new_profile(user) -> StylistProfile:
    """A new stylist gets their own profile, visible immediately so the admin can see and
    assign them to appointments. Services and divisions are auto-assigned so they appear in
    the booking dropdowns."""
    from scheduling.models import Division, Service

    display_name = (user.full_name or user.email.split("@")[0])[:80]
    profile, created = StylistProfile.objects.get_or_create(
        user=user,
        defaults={
            "display_name": display_name,
            "title": "Stylist",
            "is_public": True,
            "divisions": list(Division.values),
        },
    )
    changed = False
    if not profile.is_public:
        profile.is_public = True
        changed = True
    if not profile.divisions:
        profile.divisions = list(Division.values)
        changed = True
    if user.full_name and profile.display_name != user.full_name:
        profile.display_name = user.full_name[:80]
        changed = True
    if changed:
        profile.save()

    if not profile.services.exists():
        active_services = Service.objects.filter(is_active=True)
        if active_services.exists():
            profile.services.set(active_services)

    return profile


def link_existing(user, profile: StylistProfile) -> StylistProfile:
    """Attach an account to an existing team profile (for example a demo profile).

    A profile belongs to one account and an account to one profile. If the account has an
    never-used profile of its own (made automatically when its invite was accepted) that one is
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
            untouched = (
                mine.title == "Stylist" and not mine.bio
            )  # still as link_new_profile made it
            used = (
                mine.appointments.exists()
                or Rating.objects.filter(stylist=mine).exists()
                or not untouched
            )
            if used:
                raise LinkError("This account is already linked to a different team profile.")
            mine.delete()
        profile.user = user
        profile.save(update_fields=["user"])
        return profile
