"""
FILE: core/security.py

PURPOSE:
    Cryptographic utilities, JWT generation/validation, password hashing,
    and the FastAPI ``get_current_user`` dependency for all mobile endpoints.

ARCHITECTURE & 'WHY':
    Isolates all security concerns into a single module. Protecting an endpoint
    requires only adding ``current_user: User = Depends(get_current_user)`` to
    the route signature — no repeated JWT parsing logic in individual routers.

    TWO-KEY DESIGN:
        Mobile JWTs → signed with ``SECRET_KEY``        (this module)
        Admin JWTs  → signed with ``ADMIN_SECRET_KEY``  (core/dependencies.py)
        A leaked mobile SECRET_KEY cannot be used to forge admin tokens because
        the admin endpoints validate against a completely separate key.

    LOGGING vs PRINT:
        All auth events use the standard ``logging`` module (not print()).
        This allows log levels (DEBUG/INFO/WARNING/ERROR) to be filtered in
        production log aggregators (Datadog, CloudWatch, etc.) without code changes.
        Sensitive PII (username, email) is intentionally excluded from log messages.

CONNECTIONS:
    - core/config.py : SECRET_KEY, ALGORITHM, and all expiry constants.
    - database/models.py : User ORM model (pgUUID primary key).
    - database/db.py : get_db session factory.
    - Called by every authenticated mobile router via ``Depends(get_current_user)``.
    - WARNING: Changing the JWT payload structure here requires updating any
      frontend code that decodes the JWT locally.
"""

import jwt
import uuid
import secrets
import logging
import bcrypt
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from core.config import (
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    EMAIL_TOKEN_EXPIRE_HOURS,
    RESET_TOKEN_EXPIRE_MINUTES,
)
from database.db import get_db
from database.models import User

# Module-level logger — inherits the root handler configured in main.py.
# Use logger.debug() for routine auth flow; logger.warning() for rejections.
logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


# ─── Password Hashing ─────────────────────────────────────────────────────────

def get_password_hash(password: str) -> str:
    """
    Hashes a plaintext password using bcrypt with a randomly generated salt.

    bcrypt is the correct algorithm here — it is intentionally slow (work
    factor ~12 rounds by default), making offline brute-force attacks expensive.
    Do NOT replace with SHA-256 or MD5 for passwords.

    Args:
        password (str): The plaintext password to hash.

    Returns:
        str: A bcrypt-hashed string, safe for storage in the ``password_hash``
             column of the ``user_profile`` table.
    """
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Performs a constant-time comparison of a plaintext password against a bcrypt hash.

    ``bcrypt.checkpw`` is internally constant-time, which prevents timing oracle
    attacks where an attacker infers password correctness from response latency.

    Args:
        plain_password  (str): The password submitted by the user.
        hashed_password (str): The bcrypt hash retrieved from the database.

    Returns:
        bool: True if the password matches the hash, False otherwise.
    """
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


def create_unusable_password() -> str:
    """
    Generates a cryptographically random sentinel value for OAuth-only accounts.

    OAuth users (Google/Apple) never set a password — they authenticate entirely
    via their provider's ID token. This function stores a value that:
      1. Cannot be guessed (64 random hex chars = 256 bits of entropy).
      2. Cannot match any valid bcrypt hash (the ``!`` prefix makes it
         structurally invalid as a bcrypt string).
      3. Prevents ``verify_password`` from ever succeeding against it.

    WHY not store NULL?
        A NULL ``password_hash`` would require nullable checks everywhere
        ``verify_password`` is called, risking a silent bypass if a check is missed.
        A sentinel value is safer — it fails ``verify_password`` loudly.

    Returns:
        str: A ``!``-prefixed 64-character hex token.
    """
    return "!" + secrets.token_hex(32)


# ─── Token Creation ───────────────────────────────────────────────────────────

def create_access_token(data: dict) -> str:
    """
    Creates a short-lived JWT access token for authenticating mobile API requests.

    The token is stateless — the server does not store it. Validation on every
    request is done by re-verifying the signature against SECRET_KEY.

    Args:
        data (dict): Payload to embed. Must include ``{"sub": str(user.id)}``.
                     The ``sub`` claim must be the user's UUID as a string.

    Returns:
        str: A signed JWT string. Expires in ``ACCESS_TOKEN_EXPIRE_MINUTES``
             (default: 15 minutes from config.py).
    """
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """
    Creates a long-lived JWT refresh token for the token rotation flow.

    Unlike access tokens, refresh tokens ARE stored in the ``refresh_tokens`` DB
    table. This enables server-side revocation — deleting a row immediately
    invalidates that session, regardless of the JWT's expiry date.

    Args:
        data (dict): Payload to embed. Must include ``{"sub": str(user.id)}``.

    Returns:
        str: A signed JWT string. Expires in ``REFRESH_TOKEN_EXPIRE_DAYS``
             (default: 30 days from config.py).
    """
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_verification_token(email: str) -> str:
    """
    Creates a short-lived JWT embedded in email verification links.

    Uses ``email`` (not ``user_id``) as the ``sub`` claim because this token
    is sent before the user can log in, and the email is the stable identifier
    needed to look up and verify the account.

    Args:
        email (str): The email address of the account to verify.

    Returns:
        str: A signed JWT. Expires in ``EMAIL_TOKEN_EXPIRE_HOURS`` (default: 24h).
    """
    payload = {
        "sub": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=EMAIL_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_password_reset_token(email: str) -> str:
    """
    Creates a very short-lived JWT for password reset flows.

    This token is no longer used for OTP-based reset (the OTP is stored in the DB
    directly). This function is retained for future use in email-link-based resets.

    Args:
        email (str): The email address of the account requesting a reset.

    Returns:
        str: A signed JWT. Expires in ``RESET_TOKEN_EXPIRE_MINUTES`` (default: 15min).
    """
    payload = {
        "sub": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ─── Current User Dependency ──────────────────────────────────────────────────

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency: validates a mobile JWT and returns the authenticated User.

    Inject into any route that requires authentication:
        ``current_user: User = Depends(get_current_user)``

    Validation steps:
        1. Decode and verify JWT signature against SECRET_KEY.
        2. Assert ``sub`` claim is present and parseable as a UUID.
        3. Query the DB to confirm the user still exists (handles deleted accounts).

    WHY re-query the DB on every request?
        The JWT is stateless — it cannot reflect account deletion or role downgrades
        that happened after it was issued. The DB query catches these cases.
        To reduce latency, consider adding a Redis user cache with a 60s TTL.

    Args:
        token (str): Bearer token extracted from the ``Authorization`` header.
        db    (Session): Injected SQLAlchemy session.

    Returns:
        User: The authenticated user ORM object, freshly loaded from the DB.

    Raises:
        HTTPException 401: Token is missing, expired, malformed, or the associated
                           user no longer exists in the database.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        raw_sub: str | None = payload.get("sub")
        if raw_sub is None:
            logger.warning("[Auth] JWT rejected: missing 'sub' claim")
            raise credentials_exception

        # CRITICAL: parse sub → uuid.UUID to match the pgUUID column type in models.py.
        # Passing a plain string to a pgUUID filter causes a silent type mismatch
        # or a cryptic DB-level error depending on the psycopg2 version.
        user_id = uuid.UUID(raw_sub)

    except jwt.ExpiredSignatureError:
        logger.info("[Auth] JWT rejected: expired signature")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidSignatureError:
        logger.warning("[Auth] JWT rejected: invalid signature — possible SECRET_KEY mismatch")
        raise credentials_exception
    except jwt.DecodeError as exc:
        logger.warning("[Auth] JWT rejected: decode error — %s", exc)
        raise credentials_exception
    except (jwt.InvalidTokenError, ValueError) as exc:
        logger.warning("[Auth] JWT rejected: invalid token or UUID parse error — %s", exc)
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        logger.warning("[Auth] JWT rejected: no user found for id=%s", user_id)
        raise credentials_exception

    logger.debug("[Auth] Authenticated user id=%s", user.id)
    return user