"""
FILE: core/dependencies.py
PURPOSE: Reusable FastAPI dependency functions — RBAC, admin JWT validation.

ARCHITECTURE & 'WHY':
    This module is the RBAC (Role-Based Access Control) heart of the application.
    All admin-facing endpoint protection flows through here.

    TWO-SECRET-KEY DESIGN:
        Mobile API: signs JWTs with SECRET_KEY (from config.py).
        Admin API:  signs JWTs with ADMIN_SECRET_KEY (from config.py).

        WHY two different keys?
        If the mobile app's SECRET_KEY is ever compromised (e.g., reverse-engineered
        from a client APK), attackers still cannot forge admin tokens because admin
        tokens use a completely separate secret. Two blast radii instead of one.

    DEPENDENCY FACTORY PATTERN:
        `require_role()` returns a FastAPI dependency function, not a fixed dependency.
        This lets individual routes express their exact permission requirements:
            Depends(require_role("admin"))
            Depends(require_role("admin", "superadmin"))
            Depends(require_role("content_editor", "admin", "superadmin"))
        No need to write a new dependency function for each role combination.

CONNECTIONS:
    - Used in: api/admin/content.py, api/admin/users.py (all admin routes)
    - Reads from: config.py (ADMIN_SECRET_KEY, ALGORITHM)
    - Reads from: db.py (get_db session)
    - Reads from: models.py (User ORM model)
"""

import uuid
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from core.config import ADMIN_SECRET_KEY, ALGORITHM
from database.db import get_db
from database.models import User

# Separate OAuth2 scheme for admin routes.
# `tokenUrl` points to the admin login endpoint — used only for Swagger UI.
admin_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/admin/login")


# ─── Admin JWT Validation ─────────────────────────────────────────────────────

def get_current_admin_user(
    token: str = Depends(admin_oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency: validates an admin JWT and returns the authenticated admin User.

    Difference from `get_current_user` in security.py:
        - `get_current_user` validates tokens signed with SECRET_KEY (mobile).
        - `get_current_admin_user` validates tokens signed with ADMIN_SECRET_KEY (admin panel).
        A mobile token CANNOT pass this check, even for a user with role="admin".
        They must log in via POST /admin/login to receive an admin-signed token.

    Args:
        token (str): Bearer token from the Authorization header.
        db (Session): Injected DB session.

    Returns:
        User: The authenticated admin user ORM object.

    Raises:
        HTTPException 401: Token missing, expired, or invalid signature.
        HTTPException 403: Token is valid but user is not an admin.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate admin credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, ADMIN_SECRET_KEY, algorithms=[ALGORITHM])
        raw_sub: str | None = payload.get("sub")
        if raw_sub is None:
            raise credentials_exception
        user_id = uuid.UUID(raw_sub)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin token has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (jwt.InvalidTokenError, ValueError):
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    # Double-check the role even though it was checked at login time.
    # WHY? The user's role may have been downgraded since the token was issued.
    # Tokens live for ADMIN_TOKEN_EXPIRE_MINUTES — a role change takes effect
    # immediately on the next request, not after token expiry.
    if user.role not in ("admin", "superadmin", "content_editor", "support_agent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient privileges. Admin access required.",
        )

    return user


# ─── RBAC Factory ─────────────────────────────────────────────────────────────

def require_role(*allowed_roles: str):
    """
    Dependency factory — returns a FastAPI dependency that gates a route to specific roles.

    Usage:
        # Endpoint accessible only to superadmins:
        @router.delete("/users/{user_id}")
        def delete_user(admin: User = Depends(require_role("superadmin"))):
            ...

        # Endpoint accessible to content editors AND admins:
        @router.post("/chapters")
        def create_chapter(admin: User = Depends(require_role("content_editor", "admin", "superadmin"))):
            ...

    WHY a factory instead of separate `require_admin`, `require_superadmin` deps?
        Granularity without boilerplate. N role levels = O(1) functions, not O(N).
        Adding a new role (e.g., "moderator") never requires new dependency functions.

    Role Hierarchy (enforced per-endpoint, not inherited):
        superadmin   → all endpoints
        admin        → all except superadmin-only
        content_editor → chapter/level/question CRUD only
        support_agent  → read users, grant coins only

    Args:
        *allowed_roles: Variable number of role strings that are permitted.

    Returns:
        Callable: A FastAPI dependency function that returns the authenticated User
                  or raises 403 if the user's role is not in allowed_roles.
    """
    def _dependency(current_admin: User = Depends(get_current_admin_user)) -> User:
        if current_admin.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {list(allowed_roles)}. "
                       f"Your role: '{current_admin.role}'.",
            )
        return current_admin
    return _dependency
