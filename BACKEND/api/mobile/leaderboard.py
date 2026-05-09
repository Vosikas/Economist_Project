"""
FILE: api/mobile/leaderboard.py
PURPOSE: Public leaderboard endpoint with an in-process TTL cache.

CACHE DESIGN:
    TTLCache(maxsize=1, ttl=60): stores one result ("top100") for 60 seconds.
    Threading Lock: prevents cache stampede — if N requests arrive simultaneously
    on a cold cache, only one fires the DB query; the rest wait and reuse the result.

    WHY TTLCache and not Redis?
    For < 50,000 users a single-process cache is sufficient and has zero infra cost.
    When you move to multiple Uvicorn workers, each worker will have its own cache
    (acceptable — max 60s staleness per worker). Switch to a Redis Sorted Set when
    you need cross-process consistency or real-time ranking updates.

    INVALIDATION:
    `_invalidate_leaderboard_cache()` is called by quiz.py's `complete_level()`
    whenever a user earns XP. This ensures updated rankings are reflected
    on the very next leaderboard request (not after waiting 60s).

CONNECTIONS:
    - api/mobile/quiz.py imports `_invalidate_leaderboard_cache` from this module.
    - models.py: User (total_xp has index=True for efficient ORDER BY).
    - schemas.py: LeaderboardUser.
"""

from cachetools import TTLCache
from threading import Lock
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from database.db import get_db
from database.models import User
from schemas import LeaderboardUser

router = APIRouter(tags=["Mobile — Leaderboard"])

# ─── Cache Singleton ──────────────────────────────────────────────────────────
# Module-level: shared across all requests handled by this worker process.
# maxsize=1: we only store one key ("top100") — no eviction logic needed.
# ttl=60: result is considered stale after 60 seconds.
_leaderboard_cache: TTLCache = TTLCache(maxsize=1, ttl=60)
_leaderboard_lock: Lock = Lock()


def _invalidate_leaderboard_cache() -> None:
    """
    Clears the leaderboard cache immediately.

    Called by `complete_level` in quiz.py whenever a user's XP increases,
    so that the next leaderboard request reflects the new ranking
    without waiting for the 60-second TTL to expire naturally.
    """
    with _leaderboard_lock:
        _leaderboard_cache.clear()


@router.get("/leaderboard", response_model=List[LeaderboardUser])
def get_leaderboard(db: Session = Depends(get_db)):
    """
    Returns the top 100 users ranked by total XP.

    This endpoint is intentionally PUBLIC (no authentication required).
    Leaderboards are a social hook — showing them to anonymous users
    encourages new sign-ups.

    PERFORMANCE:
        Cache HIT  → 0 DB queries, response in ~1ms.
        Cache MISS → 1 DB query (index scan on total_xp), result cached for 60s.

    The `User.total_xp` B-tree index in models.py allows PostgreSQL to satisfy
    `ORDER BY total_xp DESC LIMIT 100` with an index scan instead of a full sort.

    Args:
        db (Session): Injected DB session (used only on cache miss).

    Returns:
        List[LeaderboardUser]: Top 100 users (username + total_xp only).
    """
    with _leaderboard_lock:
        cached = _leaderboard_cache.get("top100")
        if cached is not None:
            return cached  # Cache HIT — zero DB cost

        # Cache MISS — query and store
        top100 = db.query(User).order_by(User.total_xp.desc()).limit(100).all()
        _leaderboard_cache["top100"] = top100
        return top100
