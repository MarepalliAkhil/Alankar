"""What each kind of marketing email says, built per customer from real data only.

Every link goes through the click counter (no tracking pixels), every email has an HTML and a
text version and a one-click unsubscribe link. When there is nothing true to say (no
recommendations, no offers, too few ratings) the customer is skipped with a reason.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from urllib.parse import quote

from django.template.loader import render_to_string
from django.utils import timezone

from core import brand
from core.mail import frontend_link
from marketing.models import Campaign
from recommendations import engine
from recommendations.models import RebookReminder, ServiceStat
from scheduling import booking
from website.models import Offer

TOP_RATED_MIN = 5  # ratings a service needs before it can be called "highest rated"
K = Campaign.Kind
PERSONAL = {K.FOR_YOU, K.PRODUCTS, K.REBOOK}


@dataclass
class Built:
    subject: str
    text: str
    html: str
    link: str
    rebook_cycles: list = field(default_factory=list)  # (service_id, cycle) emailed


class Skip(Exception):
    """This customer gets no email from this campaign (the reason is kept on the recipient)."""


def click_link(token: str, path: str) -> str:
    """A link that counts the click on our own server (no pixels), then opens `path` in the app."""
    return frontend_link(f"/api/public/c/{token}/?to={quote(path, safe='')}")


def active_offers() -> list[Offer]:
    today = timezone.localdate()
    return [
        o
        for o in Offer.objects.filter(is_active=True)
        if o.valid_until is None or o.valid_until >= today
    ]


def most_booked(top=3) -> list:
    rows = (
        ServiceStat.objects.filter(bookings_90d__gt=0, service__is_active=True)
        .select_related("service")
        .order_by("-bookings_90d", "service__name")[:top]
    )
    return list(rows)


def top_rated(top=3) -> list:
    rows = (
        ServiceStat.objects.filter(rating_count__gte=TOP_RATED_MIN, service__is_active=True)
        .select_related("service")
        .order_by("-rating_avg", "-rating_count", "service__name")[:top]
    )
    return list(rows)


def can_create(kind: str) -> str | None:
    """A reason the campaign cannot be sent at all, or None."""
    if kind == K.OFFERS and not active_offers():
        return "There are no active offers on the website. Add one in Marketing > Offers first."
    if kind == K.TOP_RATED and not top_rated():
        return (
            f"No service has {TOP_RATED_MIN} or more ratings yet, so none can be called "
            "highest rated."
        )
    if kind == K.MOST_BOOKED and not most_booked():
        return "Nothing has been booked in the last 90 days yet."
    return None


def _service_item(info_or_service, reason: str, token: str, *, action="Book now", extra=""):
    slug = info_or_service.slug
    price = getattr(info_or_service, "price", None) or str(info_or_service.from_price)
    return {
        "title": info_or_service.name,
        "price": price,
        "reason": reason,
        "link": click_link(token, f"/customer/book?service={slug}{extra}"),
        "action": action,
    }


def build(campaign: Campaign, user, token: str, unsubscribe: str) -> Built:
    first = user.full_name.split(" ")[0] if user.full_name else "there"
    kind = campaign.kind
    if kind in PERSONAL and not engine.personal_on(user):
        raise Skip("personal recommendations are off")
    heading, intro, items, extra, cycles = campaign.subject, campaign.body.strip(), [], "", []
    why = f"You are getting this because you agreed to receive emails from {brand.SHOP_NAME}."
    if kind == K.FOR_YOU:
        picks = engine.for_you(user, top=3)
        if not picks:
            raise Skip("nothing to recommend")
        items = [_service_item(p.info, p.reasons[0] + ".", token) for p in picks]
        why += (
            " The suggestions come from your own visits; you can switch them off on your profile."
        )
    elif kind == K.PRODUCTS:
        after = engine.aftercare(user)
        if not after:
            raise Skip("no aftercare products")
        items = [
            {
                "title": p["name"],
                "price": p["price"],
                "reason": p["reason"] + ".",
                "link": click_link(token, "/customer/shop"),
                "action": "Open the shop",
            }
            for p in after["products"]
        ]
        why += (
            " The products match your last visit; you can switch suggestions off on your profile."
        )
    elif kind == K.REBOOK:
        due = engine.rebook(user)
        already = set(
            RebookReminder.objects.filter(user=user, emailed=True).values_list(
                "service_id", "cycle"
            )
        )
        due = [e for e in due if (e["service"].id, e["cycle"]) not in already]
        if not due:
            raise Skip("nothing due, or already reminded this cycle")
        for e in due:
            times = "; ".join(booking.when_text(datetime.fromisoformat(s)) for s in e["slots"])
            who = f" with {e['stylist']['name']}" if e.get("stylist") else ""
            reason = e["reason"] + (f" Free times{who}: {times}." if times else "")
            start = f"&start={quote(e['slots'][0])}" if e["slots"] else ""
            stylist = f"&stylist={e['stylist']['id']}" if e.get("stylist") else ""
            items.append(
                _service_item(
                    e["service"], reason, token, action="Pick a time", extra=start + stylist
                )
            )
            cycles.append((e["service"].id, e["cycle"]))
        why += " The times are real free slots when this email was written; they may fill up."
    elif kind == K.MOST_BOOKED:
        rows = most_booked()
        if not rows:
            raise Skip("no bookings yet")
        items = [
            _service_item(r.service, f"Booked {r.bookings_90d} times in the last 90 days.", token)
            for r in rows
        ]
    elif kind == K.TOP_RATED:
        rows = top_rated()
        if not rows:
            raise Skip("too few ratings")
        items = [
            _service_item(
                r.service,
                f"Rated {r.rating_avg:.1f} out of 5 by {r.rating_count} guests.",
                token,
            )
            for r in rows
        ]
    elif kind == K.OFFERS:
        offers = active_offers()
        if not offers:
            raise Skip("no active offers")
        items = [
            {
                "title": o.title,
                "price": "",
                "reason": o.description
                + (f" Valid until {o.valid_until:%d %b %Y}." if o.valid_until else ""),
                "link": click_link(token, "/"),
                "action": "See the offer",
            }
            for o in offers[:5]
        ]
    if campaign.coupon_id:
        extra = f"Use coupon {campaign.coupon.code} at the counter."
    context = {
        "shop_name": brand.SHOP_NAME,
        "heading": heading,
        "greeting": f"Hello {first},",
        "intro": intro,
        "items": items,
        "extra": extra,
        "why": why,
        "unsubscribe": unsubscribe,
        "footer": f"{brand.SHOP_NAME} · {brand.POWERED_BY}",
    }
    text = render_to_string("marketing/email.txt", context).strip()
    html = render_to_string("marketing/email.html", context)
    main = items[0]["link"] if items else click_link(token, "/customer/book")
    return Built(subject=campaign.subject, text=text, html=html, link=main, rebook_cycles=cycles)
