"""
FILE: api/mobile/auth.py

PURPOSE:
    All authentication endpoints for the mobile app:
        - Email/password signup, login, logout
        - JWT refresh token rotation
        - Email verification
        - Password change and reset (OTP-based)
        - Email change
        - Push notification token registration
        - Google Sign-In and Apple Sign-In (OAuth)

SECURITY DESIGN:
    - Passwords are hashed with bcrypt (via core/security.py).
    - Access tokens are short-lived JWTs signed with SECRET_KEY.
    - Refresh tokens are stored in the DB (refresh_tokens table) to enable
      server-side revocation. Each refresh rotates the token (old → deleted, new → inserted).
    - OTP reset is rate-limited (5 max attempts per 10 min via otp_limiter) and
      uses hmac.compare_digest() for constant-time comparison (prevents timing attacks).
    - Google tokens are verified via Google's tokeninfo endpoint (audience checked).
    - Apple tokens are verified by downloading Apple's JWKS and decoding locally.
    - All OAuth users get an unusable password sentinel (cannot log in via password).

CONNECTIONS:
    - core/security.py   : JWT creation, password hashing, get_current_user
    - core/config.py     : SECRET_KEY, ALGORITHM, REFRESH_TOKEN_EXPIRE_DAYS
    - database/models.py : User, RefreshToken
    - schemas/__init__.py: Userlogin, Usersignup, TokenResponse, RefreshReq, etc.
    - services/emails_service.py : send_reset_password, send_verification_email
    - services/rate_limiter.py   : otp_limiter, password_reset_limiter
"""

import hmac
import uuid
import logging
import os
import random
from datetime import datetime, timedelta, timezone

import httpx
import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.orm import Session

from core.config import (
    SECRET_KEY,
    ALGORITHM,
    REFRESH_TOKEN_EXPIRE_DAYS,
    GOOGLE_CLIENT_ID,
    APPLE_CLIENT_ID,
)
from core.security import (
    create_access_token,
    create_refresh_token,
    create_unusable_password,
    create_verification_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from database.db import get_db
from database.models import User, RefreshToken
from schemas import (
    AppleAuthRequest,
    ChangeEmailRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    PushTokenRequest,
    RefreshReq,
    ResetPasswordRequest,
    TokenResponse,
    Userlogin,
    UserResponse,
    Usersignup,
)
from services.emails_service import send_reset_password, send_verification_email
from services.rate_limiter import otp_limiter, password_reset_limiter

logger = logging.getLogger(__name__)

# No URL prefix — all endpoints are backward-compatible with the existing frontend.
router = APIRouter(tags=["Mobile — Authentication"])

# Maximum OTP submission failures before the OTP is invalidated.
_MAX_OTP_ATTEMPTS = 5


# ══════════════════════════════════════════════════════════════════════════════
# EMAIL / PASSWORD AUTH
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    user: Usersignup,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Registers a new user account and dispatches a verification email.

    The verification email is sent asynchronously via BackgroundTasks so the
    HTTP response is returned immediately without waiting for SMTP.

    Args:
        user  (Usersignup): Request body with ``username``, ``email``, ``password``.
        background_tasks   : FastAPI background task queue.
        db    (Session)    : Injected DB session.

    Returns:
        UserResponse: The newly created user (excludes password_hash).

    Raises:
        HTTPException 400: Username or email already registered.
    """
    user_exists = db.query(User).filter(
        (User.username == user.username) | (User.email == user.email)
    ).first()

    if user_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already exists",
        )

    hashed_password = get_password_hash(user.password)
    new_user = User(
        username=user.username,
        email=user.email,
        password_hash=hashed_password,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_verification_token(new_user.email)
    background_tasks.add_task(send_verification_email, new_user.email, token)

    return new_user


@router.post("/login", response_model=TokenResponse)
def login(user: Userlogin, db: Session = Depends(get_db)):
    """
    Authenticates a user with username + password and returns a JWT token pair.

    On success, a new refresh token row is inserted into the ``refresh_tokens``
    table. Multiple active sessions are supported (one row per device).

    Args:
        user (Userlogin): Request body with ``username`` and ``password``.
        db   (Session)  : Injected DB session.

    Returns:
        TokenResponse: ``access_token``, ``refresh_token``, ``token_type="bearer"``.

    Raises:
        HTTPException 400: Invalid credentials.
        HTTPException 403: Email not yet verified.
    """
    user_in_db = db.query(User).filter(User.username == user.username).first()

    if not user_in_db or not verify_password(user.password, user_in_db.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid username or password",
        )

    if not user_in_db.verified_email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Παρακαλώ επιβεβαιώστε το email σας για να συνδεθείτε.",
        )

    return _issue_tokens(user_in_db, db)


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: RefreshReq, db: Session = Depends(get_db)):
    """
    Rotates a refresh token: validates the submitted token, deletes it, and
    issues a brand-new access + refresh token pair.

    SECURITY — Refresh Token Rotation:
        Each refresh token is single-use. Using the same refresh token twice
        (e.g., after a token theft) will fail because the first use already
        deleted the DB row. This provides replay-attack protection.

    Args:
        request (RefreshReq): Body containing ``refresh_token``.
        db      (Session)   : Injected DB session.

    Returns:
        TokenResponse: New ``access_token`` + ``refresh_token`` pair.

    Raises:
        HTTPException 401: Token expired, invalid signature, not in DB, or
                           ``sub`` claim missing / cannot be parsed as UUID.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(request.refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        raw_sub: str | None = payload.get("sub")
        if raw_sub is None:
            raise credentials_exception
        # CRITICAL: parse to uuid.UUID to match the pgUUID column type.
        # Passing a plain string to a pgUUID filter causes a silent type mismatch.
        user_id = uuid.UUID(raw_sub)
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, ValueError):
        raise credentials_exception

    stored_token = db.query(RefreshToken).filter(
        RefreshToken.token == request.refresh_token
    ).first()
    if not stored_token:
        # Token not found in DB — either already used (rotation) or invalidated
        raise credentials_exception

    # Delete the old token before issuing a new one (rotation)
    db.delete(stored_token)
    db.commit()

    new_access = create_access_token(data={"sub": str(user_id)})
    new_refresh = create_refresh_token(data={"sub": str(user_id)})

    expires = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(user_id=user_id, token=new_refresh, expires_at=expires))
    db.commit()

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        token_type="bearer",
    )


@router.post("/logout")
def logout(request: RefreshReq, db: Session = Depends(get_db)):
    """
    Invalidates a refresh token, terminating the current session.

    Idempotent — if the token is not found (already logged out), still returns 200.
    This prevents the frontend from getting stuck in an error state on double-logout.

    Args:
        request (RefreshReq): Body containing ``refresh_token``.
        db      (Session)   : Injected DB session.

    Returns:
        dict: ``{"detail": "Logged out successfully"}``
    """
    token_in_db = db.query(RefreshToken).filter(
        RefreshToken.token == request.refresh_token
    ).first()
    if token_in_db:
        db.delete(token_in_db)
        db.commit()
    return {"detail": "Logged out successfully"}


@router.post("/forgot-password")
def forgotpassword(
    request: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Generates a 6-digit OTP and dispatches a password reset email.

    SECURITY — Email Enumeration Prevention:
        Always returns 200 regardless of whether the email exists. This prevents
        an attacker from probing which emails are registered by timing the response.

    RATE LIMITING:
        Uses ``password_reset_limiter`` to limit to 3 forgot-password requests
        per email per 15 minutes, preventing email flooding/spam.

    Args:
        request         (ForgotPasswordRequest): Body with ``email``.
        background_tasks: FastAPI background task queue.
        db              (Session): Injected DB session.

    Returns:
        dict: Generic success message (same for found and not-found emails).
    """
    # Rate limit by email address — prevents email flooding
    password_reset_limiter.check(request.email, max_calls=3, window_seconds=900)

    user_in_db = db.query(User).filter(User.email == request.email).first()
    if user_in_db:
        otp = str(random.randint(100000, 999999))
        user_in_db.reset_otp = otp
        user_in_db.reset_otp_expire = datetime.now(timezone.utc) + timedelta(minutes=15)
        user_in_db.reset_otp_attempts = 0  # Reset attempt counter on new OTP issuance
        db.commit()
        background_tasks.add_task(send_reset_password, request.email, otp)

    return {"message": "Αν υπάρχει λογαριασμός με αυτό το email, στάλθηκε το PIN επαναφοράς."}


@router.post("/reset-password")
def resetpassword(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Validates the OTP and resets the user's password.

    SECURITY HARDENING:
        1. **Rate limiting**: max 5 OTP submissions per email per 10 minutes
           via ``otp_limiter`` (HTTP 429 after exceeded).
        2. **Attempt counter**: if ``reset_otp_attempts`` reaches ``_MAX_OTP_ATTEMPTS``
           (5), the OTP is cleared and must be re-requested via /forgot-password.
        3. **Constant-time comparison**: uses ``hmac.compare_digest()`` instead of
           ``!=`` to prevent timing oracle attacks.
        4. **Timezone-aware expiry**: comparison uses timezone-aware datetimes on
           both sides to avoid Python 3.12 deprecation warnings.

    Args:
        request (ResetPasswordRequest): Body with ``email``, ``otp``, ``new_password``.
        db      (Session): Injected DB session.

    Returns:
        dict: Success message.

    Raises:
        HTTPException 404: Email not found.
        HTTPException 429: Too many requests (rate limiter).
        HTTPException 400: Wrong OTP, expired OTP, or too many failed attempts.
    """
    # Per-email sliding window: max 5 OTP checks per 10 minutes
    otp_limiter.check(request.email, max_calls=5, window_seconds=600)

    user_in_db = db.query(User).filter(User.email == request.email).first()
    if not user_in_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ο χρήστης δεν βρέθηκε.",
        )

    # Invalidate OTP after too many failed attempts (brute-force lock)
    if user_in_db.reset_otp_attempts >= _MAX_OTP_ATTEMPTS:
        user_in_db.reset_otp = None
        user_in_db.reset_otp_expire = None
        user_in_db.reset_otp_attempts = 0
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Πάρα πολλές αποτυχημένες προσπάθειες. Ζητήστε νέο PIN.",
        )

    # Constant-time OTP comparison — prevents timing oracle attacks
    # hmac.compare_digest() takes the same time regardless of where strings first differ.
    stored_otp = user_in_db.reset_otp or ""
    if not hmac.compare_digest(stored_otp, request.otp):
        user_in_db.reset_otp_attempts += 1
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Λάθος PIN.",
        )

    # Timezone-aware expiry check
    expire = user_in_db.reset_otp_expire
    if not expire:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Το PIN έχει λήξει.",
        )
    # Normalise to timezone-aware if stored as naive (legacy rows)
    if expire.tzinfo is None:
        expire = expire.replace(tzinfo=timezone.utc)
    if expire < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Το PIN έχει λήξει.",
        )

    # All checks passed — apply the new password and clear OTP state
    user_in_db.password_hash = get_password_hash(request.new_password)
    user_in_db.reset_otp = None
    user_in_db.reset_otp_expire = None
    user_in_db.reset_otp_attempts = 0
    db.commit()

    # Clear the rate limiter window so the user can request another reset immediately
    otp_limiter.reset(request.email)
    password_reset_limiter.reset(request.email)

    return {"message": "Ο κωδικός πρόσβασης άλλαξε επιτυχώς."}


@router.get("/verify-email/", response_class=HTMLResponse)
def verify_email(token: str, db: Session = Depends(get_db)):
    """
    Handles the email verification link clicked by the user in their inbox.

    WHY return HTML instead of JSON?
        This endpoint is opened by the user's browser (not the app). It must render
        a human-readable success page. ``response_class=HTMLResponse`` tells FastAPI
        to set Content-Type: text/html automatically.

    SECURITY FIX (MODERATE-5):
        Previously this function called ``os.getenv("SECRET_KEY")`` directly, which
        bypasses the startup validation in config.py and can silently use a None key.
        Now uses the validated ``SECRET_KEY`` imported from ``core.config``.

    Args:
        token (str): The JWT verification token from the email link query parameter.
        db    (Session): Injected DB session.

    Returns:
        HTMLResponse: A styled success page (200) or FileResponse if already verified.

    Raises:
        HTTPException 401: Token expired, invalid, or email not found.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    success_html = """
    <!DOCTYPE html>
    <html lang="el">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>20_E - Επαλήθευση Email</title>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
        <style>
            body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: linear-gradient(135deg, #0f172a, #1e293b); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #f1f5f9; }
            .card { background: rgba(30, 41, 59, 0.8); padding: 40px; border-radius: 20px; border: 1px solid #334155; text-align: center; max-width: 400px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); animation: fadeIn 0.8s ease-out; }
            .icon-container { width: 80px; height: 80px; background: rgba(16, 185, 129, 0.1); border-radius: 50%; display: flex; justify-content: center; align-items: center; margin: 0 auto 20px; border: 2px solid #10b981; box-shadow: 0 0 20px rgba(16, 185, 129, 0.4); }
            .icon { font-size: 40px; color: #10b981; }
            .logo { font-size: 48px; font-weight: 900; color: #f1f5f9; letter-spacing: -2px; margin-bottom: 20px; }
            .logo span { font-size: 24px; color: #10b981; margin-left: 2px; }
            h1 { margin: 0 0 10px; font-size: 28px; letter-spacing: 1px; }
            p { color: #94a3b8; font-size: 16px; line-height: 1.5; margin-bottom: 30px; }
            .btn { background: linear-gradient(90deg, #10b981, #059669); color: white; padding: 12px 25px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 16px; transition: transform 0.2s; display: inline-block; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); }
            .btn:hover { transform: scale(1.05); }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="logo">20<span>E</span></div>
            <div class="icon-container">
                <i class="fas fa-shield-alt icon"></i>
            </div>
            <h1>Θωράκιση Επιτυχής!</h1>
            <p>Το email σου επαληθεύτηκε. Το προφίλ σου στο <b>20_E</b> είναι πλέον ενεργό και έτοιμο για το επόμενο Level.</p>
            <a href="javascript:window.close();" class="btn">Επιστροφή στο App</a>
        </div>
    </body>
    </html>
    """

    try:
        # SECURITY FIX: Use SECRET_KEY from config.py (validated at startup),
        # not os.getenv() which can silently return None and accept any token.
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None:
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Το link έχει λήξει.",
        )
    except jwt.InvalidTokenError:
        raise credentials_exception

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise credentials_exception

    # Idempotent: if already verified, show a static "already verified" page
    if user.verified_email:
        return FileResponse("emailverifyscr.html")

    user.verified_email = True
    db.commit()

    return HTMLResponse(content=success_html, status_code=200)


@router.post("/change-password")
def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Changes the authenticated user's password after verifying the current one.

    Args:
        request      (ChangePasswordRequest): Body with ``current_password``, ``new_password``.
        current_user (User)   : Injected authenticated user.
        db           (Session): Injected DB session.

    Returns:
        dict: Success message.

    Raises:
        HTTPException 400: Current password is incorrect.
    """
    if not verify_password(request.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ο τρέχων κωδικός είναι λανθασμένος.",
        )

    current_user.password_hash = get_password_hash(request.new_password)
    db.commit()
    return {"message": "Ο κωδικός πρόσβασης άλλαξε επιτυχώς."}


@router.post("/change-email")
def change_email(
    request: ChangeEmailRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Changes the authenticated user's email address.

    SECURITY — Forced Re-verification:
        The new email is immediately marked ``verified_email = False`` and a
        verification email is dispatched to the new address. The user cannot
        log in again until they click the link. This prevents:
          1. Account squatting: claiming another user's real email address.
          2. Session hijack escalation: an attacker who obtains a valid access
             token cannot permanently transfer the account to their own email.

    Args:
        request           (ChangeEmailRequest): Body with ``new_email``.
        background_tasks  : FastAPI background task queue for async email send.
        current_user (User)   : Injected authenticated user.
        db           (Session): Injected DB session.

    Returns:
        dict: Success message instructing the user to verify their new email.

    Raises:
        HTTPException 400: New email is already in use by another account.
    """
    existing_user = db.query(User).filter(User.email == request.new_email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Αυτό το email χρησιμοποιείται ήδη από άλλον χρήστη.",
        )

    current_user.email = request.new_email
    # SECURITY FIX: force re-verification — do not inherit trust from the old address.
    current_user.verified_email = False
    db.commit()

    token = create_verification_token(current_user.email)
    background_tasks.add_task(send_verification_email, current_user.email, token)

    return {"message": "Στάλθηκε link επαλήθευσης στο νέο email σου. Επιβεβαίωσέ το για να συνδεθείς."}


@router.post("/update-push-token")
def update_push_token(
    request: PushTokenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Registers or updates the device's Expo push notification token.

    Called on app launch and when the OS re-issues a push token.

    Args:
        request      (PushTokenRequest): Body with ``token`` (the Expo push token string).
        current_user (User)   : Injected authenticated user.
        db           (Session): Injected DB session.

    Returns:
        dict: Success message.
    """
    current_user.push_token = request.token
    db.commit()
    return {"message": "Push token updated successfully"}


# ══════════════════════════════════════════════════════════════════════════════
# OAUTH — GOOGLE & APPLE
# ══════════════════════════════════════════════════════════════════════════════

async def verify_google_token(id_token: str) -> dict:
    """
    Validates a Google ID Token via Google's tokeninfo endpoint.

    WHY use the tokeninfo endpoint instead of local verification?
        Avoids managing Google's JWKS key rotation locally. Google handles
        the cryptographic verification on their end. For production at >10k
        req/s, switch to local JWKS-based verification using ``google-auth``
        library to avoid the extra network round-trip.

    Args:
        id_token (str): The raw Google ID Token from the mobile frontend.

    Returns:
        dict: Verified token payload containing ``sub``, ``email``, ``aud``, ``name``.

    Raises:
        HTTPException 401: Token is invalid, expired, or audience does not match
                           the app's Google Client ID (token intended for another app).
        HTTPException 503: Google's tokeninfo endpoint is unreachable.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
        )

    if response.status_code != 200:
        logger.warning("[OAuth/Google] tokeninfo returned %d", response.status_code)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Μη έγκυρο Google token.",
        )

    payload = response.json()

    # Audience check: ensure the token was issued FOR this app, not another
    # Google OAuth client. Without this, a token from any Google app would work.
    # SECURITY FIX: use the startup-validated GOOGLE_CLIENT_ID from config.py
    # instead of os.getenv(), which could silently return None and disable this check.
    if payload.get("aud") != GOOGLE_CLIENT_ID:
        logger.warning("[OAuth/Google] Audience mismatch: got '%s'", payload.get("aud"))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token audience mismatch.",
        )

    return payload


async def verify_apple_token(id_token: str) -> dict:
    """
    Validates an Apple ID Token by downloading Apple's public JWKS and verifying locally.

    WHY verify locally (not via an Apple endpoint)?
        Apple does not provide a tokeninfo-style endpoint. Verification must be done
        locally by: (1) fetching Apple's JWKS, (2) selecting the key matching the
        token's ``kid`` header, (3) verifying the RS256 signature.

    PERFORMANCE NOTE:
        Apple's JWKS are re-downloaded on every call. For production, cache the
        JWKS response in Redis or in-process memory with a TTL of ~1 hour.

    Args:
        id_token (str): The raw Apple ID Token from the mobile frontend.

    Returns:
        dict: Verified payload containing ``sub`` and (on first login) ``email``.

    Raises:
        HTTPException 401: Token is expired, invalid, or key not found.
        HTTPException 503: Apple's JWKS endpoint is unreachable.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get("https://appleid.apple.com/auth/keys")

    if response.status_code != 200:
        logger.error("[OAuth/Apple] Failed to fetch JWKS: status %d", response.status_code)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Αδυναμία επικοινωνίας με Apple.",
        )

    apple_keys = response.json()["keys"]

    try:
        header = jwt.get_unverified_header(id_token)
        kid = header.get("kid")

        from jwt.algorithms import RSAAlgorithm
        matching_key = next((k for k in apple_keys if k["kid"] == kid), None)
        if not matching_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Apple key not found.",
            )

        public_key = RSAAlgorithm.from_jwk(matching_key)
        apple_client_id = APPLE_CLIENT_ID  # Startup-validated in core/config.py

        payload = jwt.decode(
            id_token,
            public_key,
            algorithms=["RS256"],
            audience=apple_client_id,
        )
        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Apple token έχει λήξει.",
        )
    except HTTPException:
        raise  # Re-raise explicit HTTPExceptions (e.g., key not found above)
    except Exception as exc:
        # Log the full exception internally; return a generic message to the client
        # to avoid leaking implementation details (MODERATE-6 fix).
        logger.error("[OAuth/Apple] Token validation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Μη έγκυρο Apple token.",
        )


def _get_or_create_oauth_user(
    db: Session,
    provider: str,
    sub: str,
    email: str,
    display_name: str | None,
) -> User:
    """
    Core OAuth account resolution logic — finds or creates a User for an OAuth login.

    Resolution order:
        1. Existing OAuth account: query by ``(oauth_provider, oauth_sub)`` — returns
           immediately if the user has signed in with this provider before.
        2. Email account link: query by ``email`` — links an existing email/password
           account to the OAuth provider (account merging).
        3. New registration: creates a new User with an unusable password sentinel.

    Username generation for new users:
        Derived from the email local part (before ``@``), truncated to 20 chars,
        with dots/hyphens replaced by underscores. A short random hex suffix is
        appended if the username already exists.

    Args:
        db           (Session) : DB session.
        provider     (str)     : ``"google"`` or ``"apple"``.
        sub          (str)     : The provider's stable unique user identifier.
        email        (str)     : The verified email from the provider's token payload.
        display_name (str|None): The user's display name (only available from Google;
                                 Apple provides it only on the very first login).

    Returns:
        User: The resolved or newly created User ORM object.
    """
    import secrets as _secrets

    # Step 1: existing OAuth user — fastest path
    user = db.query(User).filter(
        User.oauth_provider == provider,
        User.oauth_sub == sub,
    ).first()
    if user:
        return user

    # Step 2: link existing email/password account to this OAuth provider
    user = db.query(User).filter(User.email == email).first()
    if user:
        user.oauth_provider = provider
        user.oauth_sub = sub
        db.commit()
        return user

    # Step 3: create a new user
    base_username = email.split("@")[0].replace(".", "_").replace("-", "_")[:20]
    username = base_username
    if db.query(User).filter(User.username == username).first():
        username = f"{base_username}_{_secrets.token_hex(3)}"

    new_user = User(
        username=username,
        email=email,
        password_hash=create_unusable_password(),
        oauth_provider=provider,
        oauth_sub=sub,
        verified_email=True,  # Google/Apple have already verified the email
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/auth/google", response_model=TokenResponse)
async def google_signin(request: GoogleAuthRequest, db: Session = Depends(get_db)):
    """
    Authenticates a user via Google Sign-In and returns a JWT token pair.

    The frontend passes the raw ``id_token`` from ``GoogleSignin.signIn()``.
    The server verifies it with Google, then resolves/creates the user account.

    Args:
        request (GoogleAuthRequest): Body with ``id_token`` (Google ID Token).
        db      (Session): Injected DB session.

    Returns:
        TokenResponse: Access + refresh token pair (identical format to /login).

    Raises:
        HTTPException 401: Invalid or expired Google token, or audience mismatch.
    """
    payload = await verify_google_token(request.id_token)

    user = _get_or_create_oauth_user(
        db=db,
        provider="google",
        sub=payload["sub"],
        email=payload["email"],
        display_name=payload.get("name"),
    )

    return _issue_tokens(user, db)


@router.post("/auth/apple", response_model=TokenResponse)
async def apple_signin(request: AppleAuthRequest, db: Session = Depends(get_db)):
    """
    Authenticates a user via Apple Sign-In and returns a JWT token pair.

    IMPORTANT: Apple only provides ``full_name`` on the very first sign-in.
    On subsequent logins, ``request.full_name`` will be None — this is expected
    behaviour from Apple's SDK and not an error.

    Args:
        request (AppleAuthRequest): Body with ``id_token`` and optionally ``full_name``.
        db      (Session): Injected DB session.

    Returns:
        TokenResponse: Access + refresh token pair.

    Raises:
        HTTPException 401: Invalid or expired Apple token.
        HTTPException 503: Apple's JWKS endpoint unreachable.
    """
    payload = await verify_apple_token(request.id_token)

    # Apple's private relay email: if the user hides their real email, Apple
    # provides a relay address derived from the ``sub`` claim.
    email = payload.get("email", f"{payload['sub']}@privaterelay.appleid.com")

    user = _get_or_create_oauth_user(
        db=db,
        provider="apple",
        sub=payload["sub"],
        email=email,
        display_name=request.full_name,
    )

    return _issue_tokens(user, db)


# ══════════════════════════════════════════════════════════════════════════════
# INTERNAL HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _issue_tokens(user: User, db: Session) -> TokenResponse:
    """
    Creates and stores a new access + refresh token pair for the given user.

    Shared by /login, /auth/google, and /auth/apple so token issuance logic
    is defined exactly once. The refresh token is persisted to the DB to enable
    server-side session revocation.

    Args:
        user (User)   : The authenticated User ORM object.
        db   (Session): DB session (used to insert the new RefreshToken row).

    Returns:
        TokenResponse: ``access_token``, ``refresh_token``, ``token_type="bearer"``.
    """
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    expires = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(user_id=user.id, token=refresh_token, expires_at=expires))
    db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )