"""Django settings. Every value comes from the environment (see backend/.env.example)."""

from datetime import timedelta
from pathlib import Path

from core import brand
from core.env import env, env_bool, env_list, load_env_file

BASE_DIR = Path(__file__).resolve().parent.parent
load_env_file(BASE_DIR / ".env")

SECRET_KEY = env("SALON_SECRET_KEY")
DEBUG = env_bool("SALON_DEBUG", False)
ALLOWED_HOSTS = env_list("SALON_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "daphne",  # must be first: makes runserver serve ASGI (HTTP + WebSockets)
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_filters",
    "corsheaders",
    "drf_spectacular",
    "channels",
    "rest_framework_simplejwt.token_blacklist",
    "core",
    "accounts",
    "people",
    "scheduling",
    "billing",
    "inventory",
    "chat",
    "marketing",
    "website",
    "wallet",
    "waitlist",
    "chatbot",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# PostgreSQL from day one (no SQLite).
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("SALON_DB_NAME", "salon"),
        "USER": env("SALON_DB_USER", "salon"),
        "PASSWORD": env("SALON_DB_PASSWORD", ""),
        "HOST": env("SALON_DB_HOST", "localhost"),
        "PORT": env("SALON_DB_PORT", "5432"),
        "CONN_MAX_AGE": 60,
    }
}

AUTH_USER_MODEL = "accounts.User"

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# API: deny by default. Every view declares a policy action from shared/policy.json and
# PolicyPermission allows it only for the roles listed there (or for public actions).
REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": ["accounts.authentication.CookieJWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["core.permissions.PolicyPermission"],
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_THROTTLE_RATES": {"auth": env("SALON_AUTH_RATE", "20/min")},
}

# Role policy (single source of truth shared with the frontend).
SALON_POLICY_PATH = Path(env("SALON_POLICY_PATH", str(BASE_DIR.parent / "shared" / "policy.json")))

# Development-only tools (simulated mailbox). Off unless SALON_DEBUG=true.
SALON_DEV_TOOLS = DEBUG
SALON_FRONTEND_URL = env("SALON_FRONTEND_URL", "http://localhost:5173").rstrip("/")

# Email. Real SMTP is used only when EMAIL_HOST (and the password, if a user is set) is in
# backend/.env; otherwise emails are
# simulated (saved in MailOutbox and shown on the dev mailbox). A copy is always saved.
EMAIL_HOST = env("EMAIL_HOST", "")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
# Gmail shows app passwords as "abcd efgh ijkl mnop"; spaces are not part of it.
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "").replace(" ", "").strip()
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER or "noreply@localhost")
EMAIL_TIMEOUT = 15
# A user without a password (e.g. the Gmail app password not pasted yet) means "not configured".
SALON_SMTP_CONFIGURED = bool(EMAIL_HOST) and (bool(EMAIL_HOST_PASSWORD) or not EMAIL_HOST_USER)
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend"
    if SALON_SMTP_CONFIGURED
    else "django.core.mail.backends.dummy.EmailBackend"
)

# Field-level encryption master key (base64, 32 bytes). Only in .env, never committed.
SALON_FIELD_KEY = env("SALON_FIELD_KEY")

# Auth cookies (JWT in httpOnly cookies; never in localStorage).
SALON_AUTH = {
    "ACCESS_COOKIE": "salon_access",
    "REFRESH_COOKIE": "salon_refresh",
    "ACCESS_COOKIE_PATH": "/api/",
    "REFRESH_COOKIE_PATH": "/api/auth/",
    "COOKIE_SECURE": not DEBUG,
    "COOKIE_SAMESITE": "Lax",
    "LOCKOUT_THRESHOLD": 5,
    "LOCKOUT_MINUTES": 15,
    "IDLE_MINUTES": int(env("SALON_IDLE_MINUTES", "15")),
    "INVITE_HOURS": 72,
    "PASSWORD_RESET_MINUTES": 60,
    "OTP_MINUTES": 10,
    "OTP_MAX_ATTEMPTS": 5,
    "OTP_RESEND_SECONDS": 60,
    "OTP_MAX_PER_HOUR": 5,
}

# Customers confirm their email with a 6-digit code at registration and on every sign-in.
# It only applies when the code can actually be delivered (real email, or the dev mailbox).
SALON_CUSTOMER_OTP = env_bool("SALON_CUSTOMER_OTP", True)

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "SIGNING_KEY": SECRET_KEY,
}

SALON_API_DOCS = env_bool("SALON_API_DOCS", DEBUG)

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

SPECTACULAR_SETTINGS = {
    "TITLE": f"{brand.PLATFORM_NAME} API",
    "DESCRIPTION": f"API for {brand.SHOP_NAME}. {brand.POWERED_BY}.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# CORS / CSRF for the Vite dev server (the dev server also proxies /api).
CORS_ALLOWED_ORIGINS = env_list("SALON_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

# Security headers and cookies
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = env_bool("SALON_SSL_REDIRECT", True)
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# Channels (WebSockets for Stylist Chat later). In-memory layer for development.
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
