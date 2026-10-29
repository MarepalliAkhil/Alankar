"""Extra security headers on every response.

Django's SecurityMiddleware already adds X-Content-Type-Options, Referrer-Policy, HSTS (when
enabled) and Cross-Origin-Opener-Policy; XFrameOptionsMiddleware adds X-Frame-Options. This adds
the headers Django has no setting for:

* Content-Security-Policy on API responses: the API only ever returns JSON, so it needs no scripts,
  styles, images or frames at all. (The React site gets its own policy from the web server or the
  built index.html, see docs/SECURITY.md. Swagger pages, served only when API docs are on, are
  exempt because they load their own assets.)
* Permissions-Policy: the site uses no camera, microphone, location, payment API or USB.
* Cache-Control: no-store on API responses, so a shared computer or proxy never keeps another
  person's appointments, invoices or chats.
"""

from __future__ import annotations

API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
PERMISSIONS_POLICY = (
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), "
    "accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=()"
)
DOC_PREFIXES = ("/api/docs/", "/api/schema/", "/django-admin/")


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        path = request.path
        is_api = path.startswith("/api/")
        is_doc = path.startswith(DOC_PREFIXES)
        if is_api and not is_doc:
            response.headers.setdefault("Content-Security-Policy", API_CSP)
            response.headers.setdefault("Cache-Control", "no-store")
        response.headers.setdefault("Permissions-Policy", PERMISSIONS_POLICY)
        return response
