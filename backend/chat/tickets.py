"""Single-use WebSocket tickets (docs/DEPLOY_FREE.md).

When the site and the socket are on different hosts (Vercel for the site, Render for the socket),
the browser cannot send the API's sign-in cookie with the socket. Instead it asks
GET /api/ws-ticket/ (through the normal cookie session) for a ticket and opens
wss://<backend>/api/ws/chat/<id>/?ticket=<ticket>.

A ticket is random, stored only as a hash, bound to one user, valid for 30 seconds and burned on
first use (a second use or a guessed value fails). It only identifies the user: the consumer then
checks the thread exactly as before, with that user's current permissions.
"""

from __future__ import annotations

import hashlib
import secrets

from django.core.cache import cache

TICKET_SECONDS = 30


def _key(ticket: str) -> str:
    return "wsticket:" + hashlib.sha256(ticket.encode()).hexdigest()


def issue(user) -> str:
    ticket = secrets.token_urlsafe(32)
    cache.set(_key(ticket), str(user.pk), timeout=TICKET_SECONDS)
    return ticket


def redeem(ticket: str | None) -> str | None:
    """The user id the ticket was issued to, or None. Burns it: a ticket works once."""
    if not ticket or len(ticket) > 100:
        return None
    key = _key(ticket)
    user_id = cache.get(key)
    if user_id is None:
        return None
    # delete() returns True for the one caller that actually removed it (two sockets racing with
    # the same ticket: only one wins).
    if not cache.delete(key):
        return None
    return user_id
