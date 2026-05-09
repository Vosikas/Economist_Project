"""
FILE: services/gamification.py
PURPOSE: Centralised gamification engine — XP calculation, streak tracking,
         coin rewards, and badge evaluation.

ARCHITECTURE & 'WHY':
    All reward maths live here. Routers (quiz.py, mistakes.py) call these
    functions and own only the DB persistence. This means:
    - Game balance changes happen in exactly ONE place.
    - Each function is independently unit-testable without a running DB.
    - Badge conditions are a data structure (BADGE_DEFINITIONS dict), not
      branching code — adding a new badge is one dict entry + one condition check.

CONNECTIONS:
    - Called by: api/mobile/quiz.py (complete_level)
    - Called by: api/mobile/mistakes.py (resolve_mistake)
    - Called by: api/mobile/badges.py (badge definitions)
    - Reads/writes: database/models.py (User, UserBadge)
    - Never writes XP/coins directly — that's the router's job after calling here.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from database.models import User

# ─── Badge Catalogue ──────────────────────────────────────────────────────────

BADGE_DEFINITIONS: dict[str, dict] = {
    "first_level": {
        "name": "First Victory",
        "description": "Ολοκλήρωσες το πρώτο σου level.",
        "icon": "trophy",
        "tier": "bronze",
    },
    "perfect_score": {
        "name": "Perfectionist",
        "description": "Τελείωσες ένα level με 100% ακρίβεια.",
        "icon": "star",
        "tier": "gold",
    },
    "streak_3": {
        "name": "On Fire 🔥",
        "description": "Έπαιξες 3 συνεχόμενες μέρες.",
        "icon": "fire",
        "tier": "bronze",
    },
    "streak_7": {
        "name": "Week Warrior",
        "description": "Διατήρησες 7ήμερο streak.",
        "icon": "fire",
        "tier": "silver",
    },
    "streak_30": {
        "name": "Unstoppable",
        "description": "Διατήρησες 30ήμερο streak.",
        "icon": "fire",
        "tier": "gold",
    },
    "mistake_master": {
        "name": "Mistake Master",
        "description": "Διόρθωσες την πρώτη σου λανθασμένη απάντηση.",
        "icon": "book",
        "tier": "bronze",
    },
    "coin_hoarder": {
        "name": "Coin Hoarder 💰",
        "description": "Συγκέντρωσες 100 νομίσματα.",
        "icon": "coins",
        "tier": "silver",
    },
    "high_scorer": {
        "name": "High Scorer",
        "description": "Πέτυχες πάνω από 80% σε 5 διαφορετικά levels.",
        "icon": "chart-bar",
        "tier": "silver",
    },
}

# ─── XP & Coin Calculation ────────────────────────────────────────────────────

_XP_PER_CORRECT_ANSWER = 20
_PERFECT_BONUS_XP = 20
_COINS_FIRST_PERFECT = 10
_COINS_FIRST_PASSED = 5
_COINS_IMPROVEMENT_PERFECT = 5


def calculate_level_xp(
    correct_answers: int,
    wrong_count: int,
    total_questions: int,
    is_first_play: bool,
    previous_score_pct: int = 0,
) -> dict:
    """
    Pure function — calculates XP and coins earned for a completed level.

    Delta XP model for replays: only the IMPROVEMENT over the previous best
    earns XP. Prevents grinding the same easy level for unlimited XP.

    Args:
        correct_answers:   Questions answered correctly.
        wrong_count:       Questions answered incorrectly.
        total_questions:   Total questions in the session.
        is_first_play:     True if user has never attempted this level before.
        previous_score_pct: User's previous best score (0–100). Ignored on first play.

    Returns:
        dict with keys: xp_earned, coins_earned, is_perfect, passed, accuracy_pct
    """
    total_questions = max(total_questions, 1)  # Guard against division by zero
    accuracy = correct_answers / total_questions
    is_perfect = wrong_count == 0
    passed = accuracy >= 0.8
    accuracy_pct = int(accuracy * 100)

    total_potential_xp = (
        correct_answers * _XP_PER_CORRECT_ANSWER
        + (_PERFECT_BONUS_XP if is_perfect else 0)
    )

    if is_first_play:
        xp_earned = total_potential_xp
        if passed:
            coins_earned = _COINS_FIRST_PERFECT if is_perfect else _COINS_FIRST_PASSED
        else:
            coins_earned = 0
    else:
        # Delta XP: only grant improvement over previous best
        old_correct = int((previous_score_pct / 100) * total_questions)
        old_xp = old_correct * _XP_PER_CORRECT_ANSWER + (
            _PERFECT_BONUS_XP if previous_score_pct == 100 else 0
        )
        xp_earned = max(0, total_potential_xp - old_xp)

        # Bonus coins only for achieving perfection for the first time on a replay
        coins_earned = (
            _COINS_IMPROVEMENT_PERFECT
            if (is_perfect and previous_score_pct < 100 and xp_earned > 0)
            else 0
        )

    return {
        "xp_earned": xp_earned,
        "coins_earned": coins_earned,
        "is_perfect": is_perfect,
        "passed": passed,
        "accuracy_pct": accuracy_pct,
    }


# ─── Streak Logic ─────────────────────────────────────────────────────────────

def update_streak(user: "User") -> int:
    """
    Updates the user's streak based on today's date vs their last active date.

    Rules:
        Same day       → no change (already played today)
        1-day gap      → increment (consecutive day)
        Gap > 1 day    → reset to 1 (broken)
        Never played   → start at 1

    Mutates the ORM object in memory only. Caller owns the DB commit.

    Returns:
        int: The new streak_days value.
    """
    today = date.today()
    last_active: date | None = user.streak_last_active  # type: ignore[attr-defined]

    if last_active is None:
        user.streak_days = 1
    elif last_active == today:
        pass  # Already played today — no change
    elif (today - last_active).days == 1:
        user.streak_days += 1
    else:
        user.streak_days = 1  # Streak broken

    user.streak_last_active = today  # type: ignore[attr-defined]
    return user.streak_days


# ─── Coin Reward for Mistake Resolution ───────────────────────────────────────

def award_coins_for_mistake_resolution(mistakes_count: int) -> int:
    """
    Tiered coin reward for resolving a mistake in the Redemption Quiz.

    Higher mistakes_count = harder habit to break = higher reward.
    Incentivises users to tackle their worst mistakes first.
    """
    if mistakes_count >= 5:
        return 20   # Platinum — chronic mistake
    elif mistakes_count >= 3:
        return 15   # Gold — recurring mistake
    elif mistakes_count >= 2:
        return 10   # Silver — repeated mistake
    else:
        return 5    # Bronze — first-time mistake


# ─── Badge Evaluation ─────────────────────────────────────────────────────────

def check_and_award_badges(
    user: "User",
    db: Session,
    context: dict,
) -> list[dict]:
    """
    Evaluates all badge conditions and inserts new UserBadge rows for newly earned badges.

    Design: one DB read (existing badges) + one bulk insert (new badges).
    The existing-badge set prevents duplicates. The DB unique index
    (user_id, badge_key) acts as a hard safety net against concurrent races.

    Args:
        user: The SQLAlchemy User ORM object (with up-to-date XP/coins/streak).
        db:   SQLAlchemy session. Badges are added but NOT committed here.
              The caller owns the commit (keeps one transaction boundary).
        context: Dict of flags from the calling endpoint:
            is_first_level_completion (bool) — first ever level completed
            is_perfect                (bool) — accuracy == 100%
            is_mistake_resolved       (bool) — called from resolve_mistake
            levels_above_80_pct       (int)  — count of levels with score >= 80%
            current_coins             (int)  — user's coin total AFTER this reward
                                               (pass this so coin_hoarder triggers
                                               correctly from both quiz & mistakes)

    Returns:
        list[dict]: Full badge detail dicts for newly earned badges
                    (empty list if none). Router uses these to drive the
                    BadgeUnlockCelebration UI component.
    """
    from database.models import UserBadge  # Local import avoids circular dependency

    # Single read: all badge keys this user already holds
    existing: set[str] = {
        b.badge_key
        for b in db.query(UserBadge)
        .filter(UserBadge.user_id == user.id)
        .all()
    }

    candidates: list[str] = []

    # ── Helper: only award if not already held ────────────────────────────────
    def _award_if_new(key: str, condition: bool) -> None:
        if condition and key not in existing and key not in candidates:
            candidates.append(key)

    # ── Condition checks ──────────────────────────────────────────────────────

    _award_if_new(
        "first_level",
        context.get("is_first_level_completion", False),
    )

    _award_if_new(
        "perfect_score",
        context.get("is_perfect", False),
    )

    # All three streak tiers checked independently so a 30-day streaker
    # who skipped the earlier milestones still earns bronze & silver retroactively.
    _award_if_new("streak_3", user.streak_days >= 3)
    _award_if_new("streak_7", user.streak_days >= 7)
    _award_if_new("streak_30", user.streak_days >= 30)

    _award_if_new(
        "mistake_master",
        context.get("is_mistake_resolved", False),
    )

    # Use context["current_coins"] so this triggers correctly whether the coins
    # came from quiz completion OR mistake resolution.
    current_coins = context.get("current_coins", user.coins)
    _award_if_new("coin_hoarder", current_coins >= 100)

    levels_80 = context.get("levels_above_80_pct", 0)
    _award_if_new("high_scorer", isinstance(levels_80, int) and levels_80 >= 5)

    # ── Bulk insert newly earned badges ───────────────────────────────────────
    if candidates:
        db.add_all([
            UserBadge(
                user_id=user.id,
                badge_key=key,
                earned_at=datetime.now(timezone.utc),
            )
            for key in candidates
        ])
        # Flush so the identity map is aware — no commit (caller owns that)
        db.flush()

    # Return full badge detail dicts for the frontend celebration UI
    return [
        {**BADGE_DEFINITIONS[key], "badge_key": key}
        for key in candidates
        if key in BADGE_DEFINITIONS  # Guard against unknown keys
    ]
