"""
FILE: api/mobile/dashboard.py

PURPOSE:
    Primary bootstrap endpoint (/dashboard) — returns everything the app needs
    on first launch: the authenticated user's profile, all chapter/level structure,
    and all progress records. Also calculates offline Shield regeneration.

    Secondary endpoint (/sync-shields) — called when the user aborts a quiz mid-session
    to sync the client-side shield count back to the database.

CONNECTIONS:
    - core/security.py : get_current_user
    - database/models.py : User, Chapter, Level, UserProgress
    - schemas/__init__.py : DashboardResponse, SyncShieldsRequest
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload
from datetime import datetime, timezone, timedelta

from database.db import get_db
from database.models import User, Chapter, Level, UserProgress
from schemas import DashboardResponse, SyncShieldsRequest
from core.security import get_current_user

router = APIRouter()

SHIELD_MAX = 5
SHIELD_REGEN_MINUTES = 30

@router.get("/dashboard", response_model=DashboardResponse)
def get_main_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    The primary bootstrap endpoint — returns everything the app needs on launch.
    Also calculates offline Shield regeneration.
    """
    now = datetime.now(timezone.utc)

    # ─── Offline Shield Regeneration Logic ───
    if current_user.is_premium:
        # Premium users always have max shields. Fix it if somehow it dropped.
        if current_user.shields < SHIELD_MAX:
            current_user.shields = SHIELD_MAX
            current_user.shields_updated_at = now
            db.commit()
    elif current_user.shields < SHIELD_MAX:
        # Calculate how many 30-minute intervals have passed
        updated_at = current_user.shields_updated_at or now
        delta = now - updated_at
        minutes_passed = int(delta.total_seconds() // 60)
        
        shields_to_add = minutes_passed // SHIELD_REGEN_MINUTES
        
        if shields_to_add > 0:
            new_shields = min(SHIELD_MAX, current_user.shields + shields_to_add)
            current_user.shields = new_shields
            
            if new_shields == SHIELD_MAX:
                current_user.shields_updated_at = now
            else:
                # Keep the remainder of the time for the next shield
                current_user.shields_updated_at = updated_at + timedelta(minutes=shields_to_add * SHIELD_REGEN_MINUTES)
            
            db.commit()

    # ─── Fetch Dashboard Data ───
    chapters = (
        db.query(Chapter)
        .options(
            selectinload(Chapter.levels).load_only(
                Level.id,
                Level.title,
                Level.order_num,
                Level.chapter_id,
                Level.xp_reward,
                Level.min_xp_required,
            )
        )
        .order_by(Chapter.order_num)  
        .all()
    )

    user_progress = (
        db.query(UserProgress)
        .filter(UserProgress.user_id == current_user.id)
        .all()
    )

    return {
        "user": current_user,
        "progress": user_progress,
        "chapters": chapters,
    }


# ─── SHIELD SYNC ENDPOINT ──────────────────────────────────────────────────────
# SyncShieldsRequest is defined in schemas/__init__.py with ge=0/le=5 validation.
# (Previously defined inline here — moved to schemas for single-responsibility.)

@router.post("/sync-shields")
def sync_shields(
    payload: SyncShieldsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Called when the user Aborts a quiz. Syncs the local shields state to the DB.
    """
    if not current_user.is_premium:
        # Prevent cheaters from sending "I have 10 shields"
        safe_shields = max(0, min(SHIELD_MAX, payload.remaining_shields))
        
        if safe_shields < current_user.shields:
            current_user.shields = safe_shields
            # If they just dropped below max, start the timer now
            if current_user.shields == SHIELD_MAX - 1:
                current_user.shields_updated_at = datetime.now(timezone.utc)
            db.commit()
            
    return {"success": True, "shields": current_user.shields}