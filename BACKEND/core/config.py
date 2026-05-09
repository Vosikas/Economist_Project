"""
FILE: core/config.py

PURPOSE:
    Single source of truth for all environment variables consumed by the backend.
    Every other module imports from here — no module calls ``os.getenv()`` directly.

WHY centralise here?
    1. ``load_dotenv()`` is called exactly once before any value is read.
    2. Startup validation (RuntimeError) catches missing secrets immediately,
       rather than silently using None keys which can allow JWT forgery.
    3. Type coercion (str → int, str → list) is done in one place.

TWO-SECRET DESIGN:
    ``SECRET_KEY``       → signs mobile app JWTs (accessed via React Native).
    ``ADMIN_SECRET_KEY`` → signs admin panel JWTs (accessed only via the backoffice).
    A compromised mobile ``SECRET_KEY`` cannot be used to forge admin tokens because
    admin endpoints validate against a completely separate key. Two blast radii.

CORS DESIGN:
    ``ALLOWED_ORIGINS`` is a comma-separated list of allowed origins from the
    environment. In development, set ``ALLOWED_ORIGINS=http://localhost:8081``.
    In production, set it to your exact frontend domain(s):
        ALLOWED_ORIGINS=https://admin.yourdomain.com,https://app.yourdomain.com
    Never use ``*`` in production with ``allow_credentials=True`` — this is
    rejected by the CORS spec and all modern browsers.

REQUIRED .env VARIABLES:
    SECRET_KEY, ADMIN_SECRET_KEY, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME

OPTIONAL .env VARIABLES (have safe defaults for development):
    ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS,
    EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS, PASSWORD_RESET_TOKEN_EXPIRE_MINUTES,
    ADMIN_TOKEN_EXPIRE_MINUTES, ALLOWED_ORIGINS
"""

import os
from dotenv import load_dotenv

load_dotenv()


# ── Mobile App JWT ─────────────────────────────────────────────────────────────

SECRET_KEY: str  = os.getenv("SECRET_KEY", "")
ALGORITHM: str   = os.getenv("ALGORITHM", "HS256")

# ⚠️  SECURITY: Default is 15 minutes — a short, safe value.
#     The previous default of 21600 (15 DAYS) made access tokens effectively permanent
#     when ACCESS_TOKEN_EXPIRE_MINUTES was absent from the environment.
#     NEVER raise this default. Override via .env if needed.
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS: int   = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
EMAIL_TOKEN_EXPIRE_HOURS: int    = int(os.getenv("EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS", "24"))
RESET_TOKEN_EXPIRE_MINUTES: int  = int(os.getenv("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", "15"))


# ── Admin Panel JWT ────────────────────────────────────────────────────────────
# ADMIN_SECRET_KEY must be set in .env — there is intentionally no default value.
# Generate one with: python -c "import secrets; print(secrets.token_hex(32))"

ADMIN_SECRET_KEY: str           = os.getenv("ADMIN_SECRET_KEY", "")
ADMIN_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ADMIN_TOKEN_EXPIRE_MINUTES", "480"))


# ── CORS ───────────────────────────────────────────────────────────────────────
# Comma-separated list of allowed origins.
# Example .env entry:
#   ALLOWED_ORIGINS=http://localhost:8081,https://admin.yourdomain.com
# The default value is localhost:8081 (Expo dev server) for local development.
# NEVER leave this as "*" in production alongside allow_credentials=True.

_raw_origins: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:8081")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]


# ── OAuth Client IDs ───────────────────────────────────────────────────────────
# SECURITY: These are centralised here (not via os.getenv() at call-time in auth.py)
# so that: (a) startup validation catches missing values immediately, and (b) the
# audience check in verify_google_token / verify_apple_token cannot be silently
# bypassed by an absent environment variable.

GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
APPLE_CLIENT_ID: str  = os.getenv("APPLE_CLIENT_ID", "")


# ── Startup Validation ─────────────────────────────────────────────────────────
# Fail loudly on startup rather than running with broken security configuration.

if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY is not set. Add it to your .env file in the BACKEND directory.\n"
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )

if not ADMIN_SECRET_KEY:
    raise RuntimeError(
        "ADMIN_SECRET_KEY is not set. Add it to your .env file.\n"
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(64))\""
    )

if not GOOGLE_CLIENT_ID:
    raise RuntimeError(
        "GOOGLE_CLIENT_ID is not set. Add it to your .env file.\n"
        "This is required for the Google OAuth audience check in /auth/google."
    )

if not APPLE_CLIENT_ID:
    raise RuntimeError(
        "APPLE_CLIENT_ID is not set. Add it to your .env file.\n"
        "This is your app's Bundle ID (e.g. com.yourcompany.20e), required for Apple Sign-In."
    )
