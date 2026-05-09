"""
FILE: api/admin/auth.py
PURPOSE: Admin panel authentication — issues admin-signed JWTs (ADMIN_SECRET_KEY).

ENDPOINTS:
    POST /admin/login — Accepts username + password, returns an admin JWT pair.

SECURITY DESIGN:
    Admin tokens are signed with ADMIN_SECRET_KEY (different from mobile SECRET_KEY).
    This means a leaked mobile token CANNOT be used to access admin endpoints.
    Even users with role="admin" in the DB must log in via this endpoint specifically
    to receive an admin-signed token.

    On every request, get_current_admin_user() (in core/dependencies.py) re-validates
    the user's role from the DB — so revoking admin access takes effect immediately on
    the next request, without waiting for the token to expire.

CONNECTIONS:
    - core/config.py: ADMIN_SECRET_KEY, ADMIN_TOKEN_EXPIRE_MINUTES, ALGORITHM
    - core/security.py: verify_password
    - database/models.py: User
    - database/db.py: get_db
"""

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.config import ADMIN_SECRET_KEY, ADMIN_TOKEN_EXPIRE_MINUTES, ALGORITHM
from core.security import verify_password
from database.db import get_db
from database.models import User

router = APIRouter(tags=["Admin — Authentication"])

# ─── Admin-Specific Request/Response Schemas ──────────────────────────────────
# Defined inline here to avoid polluting the shared schemas module with admin concerns.

class AdminLoginRequest(BaseModel):
    """Credentials for the admin login endpoint."""
    username: str
    password: str


class AdminTokenResponse(BaseModel):
    """Response containing the admin-signed access token."""
    access_token: str
    token_type: str = "bearer"
    admin_role: str   # Echoes the caller's role back so the UI knows what they can do


# ─── Admin Roles ───────────────────────────────────────────────────────────────
_ADMIN_ROLES = {"admin", "superadmin", "content_editor", "support_agent"}


def _create_admin_token(user_id: str) -> str:
    """
    Issues a JWT signed with ADMIN_SECRET_KEY — completely distinct from mobile tokens.

    WHY a separate helper instead of reusing create_access_token from security.py?
    create_access_token uses SECRET_KEY (mobile). Admin tokens MUST use ADMIN_SECRET_KEY.
    Mixing them would defeat the two-key security model.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=ADMIN_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": user_id, "exp": expire, "aud": "admin"}
    return jwt.encode(payload, ADMIN_SECRET_KEY, algorithm=ALGORITHM)


# ─── Admin Login Endpoint ──────────────────────────────────────────────────────

@router.post("/login", response_model=AdminTokenResponse)
def admin_login(
    credentials: AdminLoginRequest,
    db: Session = Depends(get_db),
):
    """
    Authenticates an admin user and returns an ADMIN_SECRET_KEY-signed JWT.

    Steps:
        1. Look up user by username.
        2. Verify password hash (same bcrypt check as mobile login).
        3. Confirm user.role is an admin-tier role.
        4. Issue an admin-signed JWT (short-lived: ADMIN_TOKEN_EXPIRE_MINUTES).

    WHY not check email verification here?
        Admin accounts are created manually by a superadmin or via DB seed.
        Email verification is a mobile-user flow — admins are pre-trusted.

    Returns:
        AdminTokenResponse: { access_token, token_type, admin_role }

    Raises:
        401: Invalid username or password.
        403: User exists and password is correct, but their role is not admin-tier.
              (WHY 403 not 401? Leaking "wrong password" vs "not an admin" is acceptable
               here because the admin endpoint is not public-facing — it's for internal
               backoffice use where the caller already knows the endpoint exists.)
    """
    user = db.query(User).filter(User.username == credentials.username).first()

    # Use a generic error for username misses to prevent user enumeration,
    # even in the admin panel.
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.role not in _ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. User '{user.username}' does not have an admin-tier role. "
                   f"Current role: '{user.role}'.",
        )

    token = _create_admin_token(str(user.id))

    return AdminTokenResponse(
        access_token=token,
        token_type="bearer",
        admin_role=user.role,
    )
