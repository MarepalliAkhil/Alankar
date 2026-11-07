"""Load test for Alankar. Run it ONLY against your own computer (see docs/LOAD_TEST.md).

    locust -f backend\\loadtest\\locustfile.py --host http://127.0.0.1:8000

Who the simulated people are (class weights = share of the users):
  * 70 %  customers   browse the public pages, look at booking options and times, check their
                      appointments, ask the chatbot, now and then send a booking request;
  * 15 %  reception   desk appointments, day schedule, customer list, notifications;
  *  5 %  stylists    notifications, chat threads, a short live chat over a WebSocket;
  * 10 %  admin       staff summary, ratings overview, audit log, notifications.
Think time between actions is 3 to 10 seconds.

Everybody signs in through the real sign-in form (the same endpoints the website uses), with the
accounts that backend/loadtest/seed_loadtest.py creates. Nothing here skips or fakes a check: if the
server asks for an emailed code or an authenticator code, the run stops and says why.
"""

import itertools
import json
import os
import random
import threading
import time
import uuid

from locust import HttpUser, between, events, task
from locust.runners import STATE_STOPPED, STATE_STOPPING

try:  # the WebSocket scenario needs this package (requirements-loadtest.txt); the rest does not
    from websocket import create_connection
except ImportError:  # pragma: no cover
    create_connection = None

DOMAIN = "load.example.com"
PASSWORD = os.environ.get("LOAD_PASSWORD", "Load-Test-2026!")
CUSTOMERS = int(os.environ.get("LOAD_CUSTOMERS", "300"))
DESKS = 3

# What "the server copes" means (also written in docs/LOAD_TEST.md).
P95_LIMIT_MS = 500
ERROR_LIMIT = 0.01

THINK = between(3, 10)
_customer_numbers = itertools.count(1)
_lock = threading.Lock()

QUESTIONS = [
    "What are your opening hours?",
    "How much is a haircut?",
    "Do you offer bridal makeup?",
    "How do I cancel a booking?",
    "Which spa treatments do you have?",
]


def _items(data):
    """A list endpoint may answer with a plain list or a page with 'results'."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("results") or []
    return []


class Account(HttpUser):
    """Signs in once, keeps the cookies, and re-signs-in if the session expires."""

    abstract = True
    wait_time = THINK
    role = "customer"

    def credentials(self):  # pragma: no cover - overridden
        raise NotImplementedError

    # ------------------------------------------------------------------ session
    def on_start(self):
        self.email = self.credentials()
        self.login()

    def relax_secure_flag(self):
        """The server marks its cookies Secure (right for the real https site). This test talks to
        your own computer over plain http, so the HTTP client would never send them back. Clearing
        the flag on the test client's copy changes nothing on the server and skips no check."""
        for cookie in self.client.cookies:
            cookie.secure = False

    def csrf_headers(self):
        token = self.client.cookies.get("csrftoken")
        return {"X-CSRFToken": token} if token else {}

    def login(self):
        self.client.get("/api/auth/csrf/", name="auth csrf")
        self.relax_secure_flag()
        with self.client.post(
            "/api/auth/login/",
            json={"role": self.role, "email": self.email, "password": PASSWORD},
            headers=self.csrf_headers(),
            name="auth login",
            catch_response=True,
        ) as response:
            body = {}
            try:
                body = response.json()
            except ValueError:
                pass
            if body.get("otp_required") or body.get("two_factor_required"):
                response.failure("a second sign-in step is on")
                self.stop_everything(
                    "The server asks for a code (email code or authenticator). The load test does "
                    "not bypass it. Run the server as described in docs/LOAD_TEST.md (no email "
                    "configured, SALON_DEBUG=false) and use the accounts from seed_loadtest.py."
                )
            elif response.status_code != 200:
                response.failure(f"sign-in failed with {response.status_code}")
        self.relax_secure_flag()

    def stop_everything(self, why):
        print(f"\nSTOPPING: {why}\n")
        runner = self.environment.runner
        if runner is not None and runner.state not in (STATE_STOPPING, STATE_STOPPED):
            runner.quit()
        self.stop(True)

    def call(self, method, path, name=None, ok=(200,), **kwargs):
        """One request. Retries once after signing in again if the session has expired (401)."""
        extra = kwargs.pop("headers", {})
        for attempt in (1, 2):
            self.relax_secure_flag()
            headers = {**extra, **(self.csrf_headers() if method != "get" else {})}
            with self.client.request(
                method.upper(),
                path,
                name=name or path,
                headers=headers,
                catch_response=True,
                **kwargs,
            ) as response:
                if response.status_code == 401 and attempt == 1:
                    response.success()  # not a failure of the server: the session simply ended
                    self.login()
                    continue
                if response.status_code in ok:
                    response.success()
                else:
                    response.failure(f"{response.status_code}")
                return response
        return response  # pragma: no cover

    # ------------------------------------------------------------------ WebSocket
    def live_chat(self, rounds=2):
        """Opens the live chat of the first thread this account has, sends a few messages."""
        if create_connection is None:
            return
        listing = self.call("get", "/api/chat/threads/", name="chat threads")
        try:
            threads = _items(listing.json())
        except ValueError:
            threads = []
        if not threads:
            return
        thread_id = threads[0].get("id")
        host = self.host or self.environment.host or ""
        url = host.replace("https://", "wss://").replace("http://", "ws://")
        cookies = "; ".join(f"{c.name}={c.value}" for c in self.client.cookies)
        started = time.perf_counter()
        try:
            ws = create_connection(
                f"{url}/api/ws/chat/{thread_id}/",
                cookie=cookies,
                origin=host,
                timeout=10,
            )
            ready = ws.recv()
        except Exception as exc:  # noqa: BLE001 - any failure is a failed connection
            self.fire("WS", "connect", started, 0, exc)
            return
        self.fire("WS", "connect", started, len(ready))
        try:
            for _ in range(rounds):
                client_id = uuid.uuid4().hex
                sent = time.perf_counter()
                ws.send(
                    json.dumps(
                        {"type": "message", "text": "Load test hello", "client_id": client_id}
                    )
                )
                got = ""
                while True:
                    got = ws.recv()
                    if client_id in got or '"error"' in got:
                        break
                error = (
                    None if client_id in got and '"error"' not in got else RuntimeError(got[:100])
                )
                self.fire("WS", "message round trip", sent, len(got), error)
                time.sleep(random.uniform(1, 3))
        except Exception as exc:  # noqa: BLE001
            self.fire("WS", "message round trip", started, 0, exc)
        finally:
            try:
                ws.close()
            except Exception:  # noqa: BLE001
                pass

    def fire(self, kind, name, started, length, exception=None):
        self.environment.events.request.fire(
            request_type=kind,
            name=name,
            response_time=(time.perf_counter() - started) * 1000,
            response_length=length,
            exception=exception,
            context={},
        )


# ====================================================================== customers (70 %)
class Customer(Account):
    weight = 70
    role = "customer"

    def credentials(self):
        with _lock:
            n = (next(_customer_numbers) - 1) % CUSTOMERS + 1
        return f"customer{n:03d}@{DOMAIN}"

    def on_start(self):
        super().on_start()
        self.slugs = []

    def service_slug(self):
        if not self.slugs:
            listing = self.call("get", "/api/public/services/", name="public services")
            try:
                self.slugs = [s["slug"] for s in _items(listing.json()) if s.get("slug")]
            except (ValueError, TypeError):
                self.slugs = []
        return random.choice(self.slugs) if self.slugs else None

    @task(6)
    def browse_public_pages(self):
        for path, name in (
            ("/api/public/site/", "public site"),
            ("/api/public/categories/", "public categories"),
            ("/api/public/team/", "public team"),
        ):
            self.call("get", path, name=name)
        self.service_slug()

    @task(5)
    def booking_options_and_times(self):
        slug = self.service_slug()
        if not slug:
            return
        options = self.call("get", f"/api/booking/options/?service={slug}", name="booking options")
        try:
            days = options.json().get("days") or []
        except (ValueError, AttributeError):
            days = []
        if days:
            day = random.choice(days[:5])
            self.call("get", f"/api/booking/slots/?service={slug}&date={day}", name="booking slots")

    @task(4)
    def my_appointments(self):
        self.call("get", "/api/my/appointments/", name="my appointments")

    @task(2)
    def notifications(self):
        self.call("get", "/api/notifications/", name="notifications")

    @task(1)
    def my_profile_and_invoices(self):
        self.call("get", "/api/my/profile/", name="my profile")
        self.call("get", "/api/my/invoices/", name="my invoices")

    @task(2)
    def ask_the_chatbot(self):
        self.call(
            "post",
            "/api/chatbot/ask/",
            name="chatbot ask",
            json={"message": random.choice(QUESTIONS)},
        )

    @task(1)
    def send_a_booking_request(self):
        """A real booking request. 400 and 409 mean 'that time was just taken' and are expected
        under load; anything else that is not a 201 counts as a failure."""
        slug = self.service_slug()
        if not slug:
            return
        options = self.call("get", f"/api/booking/options/?service={slug}", name="booking options")
        try:
            days = options.json().get("days") or []
        except (ValueError, AttributeError):
            return
        if not days:
            return
        day = random.choice(days[:5])
        slots = self.call(
            "get", f"/api/booking/slots/?service={slug}&date={day}", name="booking slots"
        )
        try:
            starts = slots.json().get("slots") or []
        except (ValueError, AttributeError):
            return
        if not starts:
            return
        n = int(self.email[8:11])
        self.call(
            "post",
            "/api/booking/requests/",
            name="booking request",
            ok=(201, 400, 409),
            json={
                "service": slug,
                "start": random.choice(starts),
                "contact_name": f"Load Customer {n:03d}",
                "contact_email": self.email,
                "contact_phone": str(9300000000 + n),
                "notes": "load test",
                "consent": True,
            },
        )

    @task(1)
    def live_chat_if_any(self):
        self.live_chat()


# ====================================================================== reception (15 %)
class Reception(Account):
    weight = 15
    role = "receptionist"

    def credentials(self):
        return f"desk{random.randint(1, DESKS)}@{DOMAIN}"

    @task(5)
    def appointments(self):
        self.call("get", "/api/desk/appointments/", name="desk appointments")

    @task(4)
    def day_schedule(self):
        self.call("get", "/api/desk/schedule/", name="desk schedule")

    @task(2)
    def customers(self):
        self.call("get", "/api/desk/customers/", name="desk customers")

    @task(2)
    def notifications(self):
        self.call("get", "/api/notifications/", name="notifications")


# ====================================================================== stylists (5 %)
class Stylist(Account):
    weight = 5
    role = "stylist"

    def credentials(self):
        return f"stylist@{DOMAIN}"

    @task(3)
    def notifications(self):
        self.call("get", "/api/notifications/", name="notifications")

    @task(2)
    def threads(self):
        self.call("get", "/api/chat/threads/", name="chat threads")

    @task(2)
    def live_chat_if_any(self):
        self.live_chat()


# ====================================================================== admin (10 %)
class Admin(Account):
    weight = 10
    role = "admin"

    def credentials(self):
        return f"admin@{DOMAIN}"

    @task(3)
    def staff_summary(self):
        self.call("get", "/api/admin/staff-summary/", name="admin staff summary")

    @task(2)
    def ratings(self):
        self.call("get", "/api/admin/ratings/", name="admin ratings")

    @task(2)
    def audit(self):
        self.call("get", "/api/audit/", name="admin audit log")

    @task(2)
    def notifications(self):
        self.call("get", "/api/notifications/", name="notifications")


# ====================================================================== verdict
@events.quitting.add_listener
def verdict(environment, **_kwargs):
    """Exit code 1 when the run is over the limits: p95 above 500 ms or more than 1 % errors."""
    total = environment.stats.total
    if total.num_requests == 0:
        return
    p95 = total.get_response_time_percentile(0.95)
    errors = total.fail_ratio
    ok = p95 is not None and p95 < P95_LIMIT_MS and errors < ERROR_LIMIT
    print(
        f"\nVERDICT: p95 {p95:.0f} ms (limit {P95_LIMIT_MS}), errors {errors:.2%} "
        f"(limit {ERROR_LIMIT:.0%}) -> {'WITHIN the limits' if ok else 'OVER the limits'}\n"
    )
    if not ok:
        environment.process_exit_code = 1
