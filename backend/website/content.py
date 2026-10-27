from website.models import SiteContent

PUBLIC_KEYS = (
    "hero",
    "about",
    "contact",
    "hours",
    "social",
    "video",
    "announcements",
    "zenotians",
)
POLICY_PAGES = {
    "privacy": "Privacy notice",
    "terms": "Terms of service",
    "cancellation": "Cancellation policy",
}


def content(key: str, default=None):
    """The PUBLISHED value of a block; an unpublished block reads as missing."""
    row = SiteContent.objects.filter(key=key).first()
    if row is None or not row.is_published:
        return default
    return row.value


# Booking rules (admin-editable in Settings, Task 5). Stored under SiteContent key "booking";
# missing keys fall back to these defaults from docs/MASTER_NOTES.md section 30.
BOOKING_DEFAULTS = {
    "slot_step_minutes": 15,
    "min_lead_minutes": 60,
    "max_days_ahead": 60,
    "hold_hours": 6,
    # How long a freed slot is held for the waitlisted customer it is offered to.
    "waitlist_offer_minutes": 15,
    "deposit_percent": 100,
    "free_cancel_hours": 24,
    "gst_percent": 18,
    # Weekday (mon..sun) -> [open, close] in shop local time; null means closed.
    "weekly_hours": {
        "mon": ["10:00", "20:00"],
        "tue": ["10:00", "20:00"],
        "wed": ["10:00", "20:00"],
        "thu": ["10:00", "20:00"],
        "fri": ["10:00", "20:00"],
        "sat": ["10:00", "20:00"],
        "sun": ["10:00", "18:00"],
    },
}


def booking_settings() -> dict:
    stored = content("booking", {}) or {}
    merged = {**BOOKING_DEFAULTS, **{k: v for k, v in stored.items() if v is not None}}
    merged["weekly_hours"] = {
        **BOOKING_DEFAULTS["weekly_hours"],
        **(stored.get("weekly_hours") or {}),
    }
    return merged


# Billing rules for the POS (admin-editable). Stored under SiteContent key "pos".
POS_DEFAULTS = {
    "discount_cap_percent": 20,
    # Loyalty: points earned per Rs. 100 paid, rupees one point is worth, and the most of a bill
    # (in percent) that points may pay for.
    "loyalty_points_per_100": 1,
    "loyalty_point_value": 1,
    "loyalty_max_redeem_percent": 50,
}


def pos_settings() -> dict:
    stored = content("pos", {}) or {}
    return {**POS_DEFAULTS, **{k: v for k, v in stored.items() if v is not None}}


# Stylist pay rules (admin-editable in Task 5/6). Stored under SiteContent key "pay_rules".
# Bands are [lowest average, multiplier], highest first (docs/MASTER_NOTES.md section 21).
PAY_DEFAULTS = {
    "min_ratings": 5,
    "rating_bands": [
        ["4.5", "1.20"],
        ["4.0", "1.10"],
        ["3.5", "1.00"],
        ["3.0", "0.90"],
        ["0", "0.80"],
    ],
    "flag_below": "3.0",
    # Used when a service has no flat task payout.
    "commission_percent": 30,
}


def pay_rules() -> dict:
    stored = content("pay_rules", {}) or {}
    return {**PAY_DEFAULTS, **{k: v for k, v in stored.items() if v is not None}}


# Security rules (admin-editable). The idle limit signs a receptionist out after this long.
def security_settings() -> dict:
    from django.conf import settings

    stored = content("security", {}) or {}
    return {"idle_minutes": stored.get("idle_minutes") or settings.SALON_AUTH["IDLE_MINUTES"]}
