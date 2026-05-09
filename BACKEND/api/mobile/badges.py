"""
FILE: api/mobile/badges.py
PURPOSE: Badge endpoints — allows the mobile app to display earned badges
         and render the full badge catalogue with locked/unlocked state.

ENDPOINTS:
    GET /badges             — Returns all badges earned by the current user.
    GET /badges/definitions — Returns the full badge catalogue (for locked state UI).

DESIGN NOTES:
    Badge definitions are a static dict (BADGE_DEFINITIONS in gamification.py), not DB rows.
    This means the catalogue never needs a migration to add new badges — only a code deploy.
    The frontend can use GET /badges/definitions to build the full "Achievements" screen,
    then cross-reference with GET /badges to mark which ones are unlocked for this user.

CONNECTIONS:
    - models.py: UserBadge
    - services/gamification.py: BADGE_DEFINITIONS
    - core/security.py: get_current_user
    - database/db.py: get_db
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from core.security import get_current_user
from database.db import get_db
from database.models import User, UserBadge
from services.gamification import BADGE_DEFINITIONS

router = APIRouter(tags=["Mobile — Badges"])


# ─── Response Schemas ─────────────────────────────────────────────────────────

class UserBadgeOut(BaseModel):
    """A badge that the user has already earned."""
    id: str
    badge_key: str
    earned_at: datetime

    # Resolved metadata from BADGE_DEFINITIONS — enriched in the endpoint, not stored in DB
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    tier: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class BadgeDefinitionOut(BaseModel):
    """A single entry in the badge catalogue, with an earned flag for this user."""
    badge_key: str
    name: str
    description: str
    icon: str
    tier: str
    earned: bool = False
    earned_at: Optional[datetime] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/badges", response_model=List[UserBadgeOut])
def get_user_badges(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all badges the current user has earned, enriched with catalogue metadata.

    The response includes name/description/icon/tier from BADGE_DEFINITIONS so the
    frontend doesn't need a separate /definitions call just to render earned badges.

    Ordered by earned_at DESC — most recent conquest shown first.
    """
    rows = (
        db.query(UserBadge)
        .filter(UserBadge.user_id == current_user.id)
        .order_by(UserBadge.earned_at.desc())
        .all()
    )

    # Enrich each DB row with static catalogue metadata
    result = []
    for badge in rows:
        definition = BADGE_DEFINITIONS.get(badge.badge_key, {})
        result.append(UserBadgeOut(
            id=badge.id,
            badge_key=badge.badge_key,
            earned_at=badge.earned_at,
            name=definition.get("name"),
            description=definition.get("description"),
            icon=definition.get("icon"),
            tier=definition.get("tier"),
        ))

    return result


@router.get("/badges/definitions", response_model=List[BadgeDefinitionOut])
def get_badge_definitions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the full badge catalogue with earned/locked state for the current user.

    This is the endpoint to power an "Achievements" screen:
    - All badges in BADGE_DEFINITIONS are listed (locked by default)
    - Badges found in UserBadge for this user are marked earned=True

    Tier ordering: gold → silver → bronze (most prestigious first).
    Within the same tier, earned badges come before locked badges.
    """
    # Fetch this user's earned badges in one query
    earned_map: dict[str, datetime] = {
        b.badge_key: b.earned_at
        for b in db.query(UserBadge).filter(UserBadge.user_id == current_user.id).all()
    }

    tier_order = {"gold": 0, "silver": 1, "bronze": 2}

    definitions = []
    for key, meta in BADGE_DEFINITIONS.items():
        earned_at = earned_map.get(key)
        definitions.append(BadgeDefinitionOut(
            badge_key=key,
            name=meta["name"],
            description=meta["description"],
            icon=meta["icon"],
            tier=meta["tier"],
            earned=key in earned_map,
            earned_at=earned_at,
        ))

    # Sort: gold first, then earned before locked within same tier
    definitions.sort(key=lambda b: (tier_order.get(b.tier, 99), not b.earned))

    return definitions
