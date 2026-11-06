"""One payment path for everything.

Checkout at the till, the online booking payment and the sale of a package, membership or gift
card all take money through here, so every payment gets a reference in the same format and the
simulated gateway behaves the same everywhere. Real gateways are out of scope for the prototype.
"""

import secrets

from billing.pos import METHODS, CheckoutError

ONLINE = "online"


class PaymentDeclined(Exception):
    """The simulated gateway refused the payment. No money was taken."""


def reference(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(6).upper()}"


def charge(*, channel: str, method: str = "", succeed: bool = True) -> tuple[str, str]:
    """Takes a payment. Returns (method, reference).

    At the counter (`channel="pos"`) the method is cash, card or UPI and the money is already in
    the receptionist's hands. Online, the simulated gateway either succeeds or declines.
    """
    if channel == "online":
        if not succeed:
            raise PaymentDeclined()
        return ONLINE, reference("MOCK")
    method = (method or "").lower()
    if method not in METHODS:
        raise CheckoutError("Pay by cash, card or UPI.")
    return method, reference(method[:4].upper())
