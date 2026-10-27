class WalletError(Exception):
    """A rule about packages, memberships, gift cards or the waitlist was broken.

    `code` lets the API choose the HTTP status: invalid (400), not_found (404), conflict (409),
    payment_declined (402) or throttled (429).
    """

    def __init__(self, message: str, code: str = "invalid"):
        super().__init__(message)
        self.message = message
        self.code = code
