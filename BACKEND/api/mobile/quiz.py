"""
FILE: api/mobile/quiz.py
PURPOSE: Quiz session endpoints — fetch questions for a level, submit completed quiz results.

ENDPOINTS:
    GET  /levels/{level_id}/questions — Returns a randomised question set for a quiz session.
    POST /levels/complete             — Records results, awards XP/coins/badges, updates streak.

GAMIFICATION:
    All XP and coin maths are delegated to services/gamification.py (calculate_level_xp).
    Streak detection is delegated to gamification.update_streak().
    Badge checks are delegated to gamification.check_and_award_badges().
    This file only owns: DB persistence, request validation, and response shaping.

CONNECTIONS:
    - models.py: User, Level, UserProgress, UserMistake
    - schemas/__init__.py: LevelCompleteRequest, LevelOut
    - services/gamification.py: calculate_level_xp, update_streak, check_and_award_badges
    - core/security.py: get_current_user
    - api/mobile/leaderboard.py: _invalidate_leaderboard_cache (called when XP changes)
"""

import random
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from database.db import get_db
from database.models import User, Level, UserProgress, UserMistake
from schemas import LevelCompleteRequest, LevelOut
from core.security import get_current_user
from services.gamification import (
    calculate_level_xp,
    update_streak,
    check_and_award_badges,
)

# Safe import — avoids circular dependency at module load time
try:
    from api.mobile.leaderboard import _invalidate_leaderboard_cache
except ImportError:
    def _invalidate_leaderboard_cache():
        pass

router = APIRouter()


@router.get("/levels/{level_id}/questions", response_model=LevelOut)
def get_level(
    level_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fetches a level's metadata and a randomised subset of its questions for a quiz session.

    Randomisation: If the level has more questions than QUESTIONS_PER_PLAY, we select
    a random subset. This ensures quiz variety on replays without changing the DB.

    Returns:
        LevelOut: Level metadata + shuffled question subset.
    Raises:
        404: Level not found.
    """
    level = (
        db.query(Level)
        .options(selectinload(Level.questions))
        .filter(Level.id == level_id)
        .first()
    )
    if not level:
        raise HTTPException(status_code=404, detail="Το Level δεν βρέθηκε.")

    all_questions = list(level.questions)
    QUESTIONS_PER_PLAY = 5

    if len(all_questions) > QUESTIONS_PER_PLAY:
        selected_questions = random.sample(all_questions, QUESTIONS_PER_PLAY)
    else:
        selected_questions = all_questions.copy()
        random.shuffle(selected_questions)

    return LevelOut(
        id=level.id,
        title=level.title,
        order_num=level.order_num,
        xp_reward=level.xp_reward,
        min_xp_required=level.min_xp_required,
        chapter_id=level.chapter_id,
        questions=selected_questions,
    )


@router.post("/levels/complete")
def complete_level(
    payload: LevelCompleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Records the result of a completed quiz session.
    Awards XP (delta model), coins, updates streak, checks for new badges.

    XP Delta Model: Only the IMPROVEMENT over the user's previous best score earns XP.
    This prevents grinding easy levels for unlimited XP.

    Gamification pipeline (in order):
        1. calculate_level_xp() — determines XP + coins earned
        2. Update UserMistake records (N+1-safe batch query)
        3. Upsert UserProgress record
        4. Commit XP + coins to user
        5. update_streak() — increments or resets based on date
        6. check_and_award_badges() — evaluates all badge conditions
        7. Commit all changes in ONE transaction
        8. Invalidate leaderboard cache (if XP changed)

    Returns:
        dict: {
            xp_gained, new_total_xp, coins_gained, new_total_coins,
            accuracy, passed, streak_days, badges_earned
        }
    Raises:
        404: Level not found.
    """
    level = db.query(Level).filter(Level.id == payload.level_id).first()
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")

    # ── 1. Fetch previous progress ────────────────────────────────────────────
    progress = db.query(UserProgress).filter(
        UserProgress.user_id == current_user.id,
        UserProgress.level_id == payload.level_id
    ).first()

    is_first_play = progress is None
    previous_score_pct = progress.score if progress else 0

    wrong_count = len(payload.wrong_question_ids)
    total_questions = payload.total_questions if payload.total_questions > 0 else 1
    correct_answers = total_questions - wrong_count

    # BUG-1 FIX: Count previously completed levels BEFORE adding the new progress
    # row to the session. SQLAlchemy flushes pending ORM objects before executing
    # a .count() query, which means counting AFTER the upsert would always return
    # >= 1 on the user's first ever level, making `is_first_level_completion` always
    # False and preventing the `first_level` badge from ever being awarded.
    total_previously_completed = db.query(UserProgress).filter(
        UserProgress.user_id == current_user.id,
        UserProgress.is_completed == True,
    ).count()

    # ── 2. Calculate XP and coin rewards ──────────────────────────────────────
    reward = calculate_level_xp(
        correct_answers=correct_answers,
        wrong_count=wrong_count,
        total_questions=total_questions,
        is_first_play=is_first_play,
        previous_score_pct=previous_score_pct,
    )
    xp_to_grant = reward["xp_earned"]
    coins_to_grant = reward["coins_earned"]

    # ── 3. Update mistake notebook (N+1-safe batch query) ─────────────────────
    if wrong_count > 0:
        existing_mistakes = db.query(UserMistake).filter(
            UserMistake.user_id == current_user.id,
            UserMistake.question_id.in_(payload.wrong_question_ids)
        ).all()

        mistakes_map = {m.question_id: m for m in existing_mistakes}
        new_mistakes = []

        for q_id in payload.wrong_question_ids:
            if q_id in mistakes_map:
                mistakes_map[q_id].mistakes_count += 1
                mistakes_map[q_id].is_resolved = False
                mistakes_map[q_id].last_failed_at = datetime.now(timezone.utc)
            else:
                new_mistakes.append(UserMistake(
                    user_id=current_user.id,
                    question_id=q_id,
                    mistakes_count=1,
                    is_resolved=False,
                ))
        if new_mistakes:
            db.add_all(new_mistakes)

    # ── 4. Upsert progress record ──────────────────────────────────────────────
    current_score_pct = reward["accuracy_pct"]
    if not progress:
        progress = UserProgress(
            user_id=current_user.id,
            level_id=payload.level_id,
            is_completed=reward["passed"],
            score=current_score_pct,
        )
        db.add(progress)
    else:
        if reward["passed"]:
            progress.is_completed = True
        if current_score_pct > progress.score:
            progress.score = current_score_pct

    # ── 5. Apply XP and coin deltas to user ───────────────────────────────────
    current_user.total_xp += xp_to_grant
    current_user.coins += coins_to_grant

    # ── 6. Update streak (mutates user ORM object, committed below) ───────────
    new_streak = update_streak(current_user)

    # ── 7. Count levels above 80% for high_scorer badge ──────────────────────
    levels_above_80 = db.query(UserProgress).filter(
        UserProgress.user_id == current_user.id,
        UserProgress.score >= 80,
    ).count()

    # ── 8. Check and award badges ─────────────────────────────────────────────
    # is_first_level_completion: True only when this is the user's very first level ever
    # BUG-1 FIX: Use the pre-upsert count captured above (total_previously_completed)
    # instead of re-querying after the new progress row has been added to the session.
    # is_first_level_completion is True only when the user has ZERO previously
    # completed levels AND this is their first play AND they passed.
    is_first_level_completion = (
        is_first_play
        and reward["passed"]
        and total_previously_completed == 0
    )

    badges_earned = check_and_award_badges(
        user=current_user,
        db=db,
        context={
            "is_first_level_completion": is_first_level_completion,
            "is_perfect": reward["is_perfect"],
            "is_mistake_resolved": False,
            "levels_above_80_pct": levels_above_80,
        },
    )

    # ── 9. Single commit for all changes ──────────────────────────────────────
    db.commit()
    db.refresh(current_user)

    # ── 10. Invalidate leaderboard cache if XP changed ────────────────────────
    if xp_to_grant > 0:
        _invalidate_leaderboard_cache()

    # Παίρνουμε το πρώτο badge (αν υπάρχει) για να δείξουμε το animation στο κινητό
    new_badge_to_display = badges_earned[0] if badges_earned else None

    return {
        "xp_gained": xp_to_grant,
        "new_total_xp": current_user.total_xp,
        "coins_gained": coins_to_grant,
        "new_total_coins": current_user.coins,
        "accuracy": current_score_pct,
        "passed": reward["passed"],
        "streak_days": new_streak,
        "new_badge": new_badge_to_display, # <--- ΑΥΤΟ ΘΕΛΕΙ ΤΟ REACT NATIVE!
        "badges_earned": badges_earned,    # Κρατάμε και τη λίστα για μελλοντική χρήση
    }