"""
FILE: api/webhooks.py
PURPOSE: Handles incoming RevenueCat webhook events to keep User.is_premium in sync.

SECURITY:
    All requests must include an `Authorization` header matching the
    RC_WEBHOOK_AUTH_KEY environment variable (set in RevenueCat dashboard →
    Project Settings → Webhooks → Authorization header).
    Requests with a missing or mismatched header are rejected with HTTP 401.

EVENT HANDLING:
    GRANT_EVENTS  → set user.is_premium = True
    REVOKE_EVENTS → set user.is_premium = False
        Exception: CANCELLATION fires when the user cancels but the subscription
        is still valid until the period end. We intentionally skip it here; the
        EXPIRATION event (fired at actual end-of-period) does the revocation.

PROCESSING STRATEGY:
    The webhook endpoint returns HTTP 200 immediately and offloads the DB update
    to a FastAPI BackgroundTask. This prevents RevenueCat from retrying the
    webhook due to perceived timeouts if the DB is momentarily slow.

CONNECTIONS:
    - database/models.py    → User model (is_premium column)
    - database/db.py        → get_db() session factory
    - main.py               → app.include_router(webhooks_router)
    - .env                  → RC_WEBHOOK_AUTH_KEY
"""

import os
import logging
import uuid as _uuid

from fastapi import APIRouter, Request, HTTPException, Depends, status, BackgroundTasks
from sqlalchemy.orm import Session

from database.db import get_db, SessionLocal
from database.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

# ─── Event Classification ──────────────────────────────────────────────────────

# Events that mean the user has (or just gained) an active entitlement.
GRANT_EVENTS = {
    "INITIAL_PURCHASE",
    "RENEWAL",
    "UNCANCELLATION",
    "NON_RENEWING_PURCHASE",
    "TRANSFER",
}

# Events that mean the entitlement has ended or been invalidated.
# Note: CANCELLATION is intentionally absent — the subscription remains valid
# until EXPIRATION fires (see module docstring).
# Note: SUBSCRIBER_ALIAS removed — it is a merge/alias event, NOT a revocation.
#       It fired in the original code and would incorrectly set is_premium=False
#       for users whose anonymous RC ID was aliased to their real account ID
#       (a normal login flow event).
REVOKE_EVENTS = {
    "EXPIRATION",
    "REFUND",
}


# ─── Auth Dependency ───────────────────────────────────────────────────────────

def verify_revenuecat_auth(request: Request) -> None:
    """
    FastAPI dependency that validates the RC_WEBHOOK_AUTH_KEY header.

    RevenueCat sends the key in the `Authorization` header exactly as configured
    in the dashboard (no 'Bearer ' prefix by default). Adjust the comparison if
    you configured a prefix in the dashboard.

    Raises HTTP 500 if the server is misconfigured (key not set).
    Raises HTTP 401 if the header is missing or incorrect.
    """
    expected = os.getenv("RC_WEBHOOK_AUTH_KEY", "")
    if not expected:
        logger.error("[Webhook] RC_WEBHOOK_AUTH_KEY is not set in environment!")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook auth not configured on server.",
        )
    incoming = request.headers.get("Authorization", "")
    if incoming != expected:
        logger.warning("[Webhook] Rejected request — Authorization header mismatch.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization.",
        )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _find_user(db: Session, app_user_id: str) -> User | None:
    """
    Looks up a User by UUID string.

    WHY validate the UUID before querying?
    RevenueCat can occasionally forward anonymous IDs (e.g. '$RCAnonymousID:...')
    that are not valid UUIDs. Parsing them with uuid.UUID() first prevents a
    malformed DB query and produces a clear log warning instead of an exception.
    """
    try:
        user_uuid = _uuid.UUID(app_user_id)
    except ValueError:
        logger.warning(
            f"[Webhook] app_user_id is not a valid UUID: '{app_user_id}' — skipping."
        )
        return None
    return db.query(User).filter(User.id == user_uuid).first()


def _set_premium(db: Session, user: User, value: bool, event_type: str) -> None:
    """
    Updates user.is_premium if the value has changed, then commits.

    The no-op guard (`user.is_premium == value`) prevents unnecessary writes
    and avoids bumping database row versions when RevenueCat sends duplicate events.
    """
    if user.is_premium == value:
        logger.info(
            f"[Webhook] User {user.id} already has is_premium={value} "
            f"(event: {event_type}) — no update needed."
        )
        return
    user.is_premium = value
    db.commit()
    logger.info(
        f"[Webhook] User {user.id} is_premium set to {value} (event: {event_type})."
    )


# ─── Background Task ──────────────────────────────────────────────────────────

def _process_event(
    event_type: str,
    app_user_id: str,
    event_id: str,
    event: dict,  # noqa: ARG001 — kept for future logging/auditing
) -> None:
    """
    Core DB mutation logic, executed in a background task so the webhook
    endpoint can return 200 immediately (prevents RevenueCat retries).

    WHY does this create its own session instead of receiving one as a parameter?

    FastAPI closes the request-scoped `db` session the moment the HTTP response
    is sent (the `finally: db.close()` in `get_db()`). Background tasks run
    AFTER the response, meaning any session passed in from the request scope
    is already closed. Using it causes `sqlalchemy.exc.InvalidRequestError`
    on `db.commit()`. Creating a fresh `SessionLocal()` here gives the task
    a session with a lifetime it controls itself.
    """
    db: Session = SessionLocal()
    try:
        # ── TRANSFER: revoke premium from the previous owner first ────────────
        # TRANSFER fires when a subscription moves from one app_user_id to
        # another (e.g. account switch). The payload contains a `transferred_from`
        # list of IDs that are losing the entitlement. Without this block, the
        # old account retains is_premium=True indefinitely.
        if event_type == "TRANSFER":
            transferred_from_ids = event.get("transferred_from", [])
            for from_id in transferred_from_ids:
                from_user = _find_user(db, from_id)
                if from_user:
                    _set_premium(db, from_user, False, "TRANSFER_revoke")
                    logger.info(
                        f"[Webhook] TRANSFER: revoked premium from app_user_id='{from_id}'"
                    )

        user = _find_user(db, app_user_id)
        if not user:
            logger.warning(
                f"[Webhook] No user found for app_user_id='{app_user_id}' "
                f"(event_id={event_id}, type={event_type})."
            )
            return

        if event_type in GRANT_EVENTS:
            _set_premium(db, user, True, event_type)
        elif event_type in REVOKE_EVENTS:
            _set_premium(db, user, False, event_type)

    except Exception:
        logger.exception(
            f"[Webhook] Unhandled error processing event_id={event_id} type={event_type}"
        )
        db.rollback()
    finally:
        db.close()


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post(
    "/revenuecat",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(verify_revenuecat_auth)],
    summary="RevenueCat Webhook",
    description=(
        "Receives subscription lifecycle events from RevenueCat and updates "
        "the corresponding User.is_premium field in the database."
    ),
)
async def revenuecat_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    # NOTE: db is intentionally NOT injected here.
    # _process_event creates its own SessionLocal() because FastAPI closes
    # the request-scoped session before background tasks execute.
):
    """
    Entry point for all RevenueCat webhook events.

    Always returns 200 immediately to prevent RevenueCat retries.
    Unknown event types are silently acknowledged (forward-compat).
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON body.",
        )

    event        = body.get("event", {})
    event_type   = event.get("type", "UNKNOWN")
    app_user_id  = event.get("app_user_id") or event.get("original_app_user_id")
    event_id     = event.get("id", "unknown")

    logger.info(f"[Webhook] Received event type='{event_type}' id='{event_id}'.")

    # Unknown event types: acknowledge and ignore (forward-compatible)
    if event_type not in GRANT_EVENTS and event_type not in REVOKE_EVENTS:
        return {"received": True}

    if not app_user_id:
        logger.warning(
            f"[Webhook] Event '{event_type}' (id={event_id}) has no app_user_id — skipping."
        )
        return {"received": True}

    background_tasks.add_task(
        _process_event,
        event_type=event_type,
        app_user_id=app_user_id,
        event_id=event_id,
        event=event,
    )
    return {"received": True}
