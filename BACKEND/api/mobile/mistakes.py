"""
FILE: api/mobile/mistakes.py
PURPOSE: Notebook (mistake tracking) endpoints — fetch active mistakes,
         get redemption quiz, and resolve mistakes.

ENDPOINTS:
    GET  /mistakes/active  — All unresolved mistakes for the current user.
    GET  /mistakes/quiz    — Rate-limited redemption quiz (top 10 hardest mistakes).
    POST /mistakes/resolve — Mark a mistake as resolved, award coins + check badges.

CONNECTIONS:
    - models.py: User, UserMistake
    - schemas/__init__.py: UserMistakeOut, ResolveMistakeRequest
    - services/gamification.py: award_coins_for_mistake_resolution, check_and_award_badges
    - core/security.py: get_current_user
    - database/db.py: get_db
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from typing import List
from datetime import date, datetime, timezone

from database.db import get_db
from database.models import User, UserMistake, UserProgress
from schemas import UserMistakeOut, ResolveMistakeRequest
from core.security import get_current_user
from services.gamification import award_coins_for_mistake_resolution, check_and_award_badges

router = APIRouter()


@router.get("/active", response_model=List[UserMistakeOut])
def get_active_mistakes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns all unresolved mistakes for the current user's Notebook screen.
    Eagerly loads the associated question via selectinload to avoid N+1 queries.
    """
    mistakes = (
        db.query(UserMistake)
        .options(selectinload(UserMistake.question))
        .filter(
            UserMistake.user_id == current_user.id,
            UserMistake.is_resolved == False
        )
        .all()
    )
    return mistakes


@router.get("/quiz", response_model=List[UserMistakeOut])
def get_redemption_quiz(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns the top 10 hardest unresolved mistakes for the Redemption Quiz.

    Ordered by mistakes_count DESC — the most-failed questions are prioritised.
    This is the core freemium mechanic: free users are rate-limited by daily_quiz_count.

    Rate limit: FREE_DAILY_LIMIT per calendar day. Resets at midnight (date.today() check).
    """
    FREE_DAILY_LIMIT = 100  # Development mode — set to 3 for production freemium gate

    today = date.today()
    if current_user.last_quiz_date != today:
        current_user.daily_quiz_count = 0
        current_user.last_quiz_date = today

    if not current_user.is_premium and current_user.daily_quiz_count >= FREE_DAILY_LIMIT:
        raise HTTPException(status_code=403, detail="limit_reached")

    quiz_mistakes = (
        db.query(UserMistake)
        .options(selectinload(UserMistake.question))
        .filter(
            UserMistake.user_id == current_user.id,
            UserMistake.is_resolved == False
        )
        .order_by(UserMistake.mistakes_count.desc())
        .limit(10)
        .all()
    )

    if not quiz_mistakes:
        raise HTTPException(
            status_code=404,
            detail="Μπράβο! Δεν έχεις κανένα ενεργό λάθος για να λύσεις."
        )

    current_user.daily_quiz_count += 1
    db.commit()

    return quiz_mistakes


@router.post("/resolve")
def resolve_mistake(
    payload: ResolveMistakeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Marks a mistake as resolved after the user answers it correctly in the Redemption Quiz.

    Coin reward is tiered via gamification.award_coins_for_mistake_resolution():
        - 1x mistake  → 5 coins
        - 2x mistake  → 10 coins
        - 3–4x mistake → 15 coins
        - 5x+ mistake  → 20 coins  (chronic mistake = highest reward)

    Also checks for newly earned badges (mistake_master, coin_hoarder).

    Returns:
        dict: { message, coins_earned, new_total_coins, question_id, badges_earned }
    Raises:
        404: Mistake not found or already resolved.
    """
    mistake = db.query(UserMistake).filter(
        UserMistake.user_id == current_user.id,
        UserMistake.question_id == payload.question_id,
        UserMistake.is_resolved == False
    ).first()

    if not mistake:
        raise HTTPException(
            status_code=404,
            detail="Το λάθος δεν βρέθηκε ή έχει ήδη λυθεί."
        )

    # ── Mark as resolved ───────────────────────────────────────────────────────
    mistake.is_resolved = True
    mistake.resolved_at = datetime.now(timezone.utc)

    # ── Award tiered coins ─────────────────────────────────────────────────────
    coins_earned = award_coins_for_mistake_resolution(mistake.mistakes_count)
    current_user.coins += coins_earned

    # ── Count levels above 80% for high_scorer badge check ────────────────────
    levels_above_80 = db.query(UserProgress).filter(
        UserProgress.user_id == current_user.id,
        UserProgress.score >= 80,
    ).count()

    # ── Check for newly earned badges ──────────────────────────────────────────
    badges_earned = check_and_award_badges(
        user=current_user,
        db=db,
        context={
            "is_first_level_completion": False,
            "is_perfect": False,
            "is_mistake_resolved": True,
            "levels_above_80_pct": levels_above_80,
        },
    )

    # ── Single commit ──────────────────────────────────────────────────────────
    db.commit()
    db.refresh(current_user)

    return {
        "message": "Το λάθος επιλύθηκε επιτυχώς!",
        "coins_earned": coins_earned,
        "new_total_coins": current_user.coins,
        "question_id": mistake.question_id,
        "badges_earned": badges_earned,
    }