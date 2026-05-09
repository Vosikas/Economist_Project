"""
FILE: services/rate_limiter.py

PURPOSE:
    In-process sliding-window rate limiters for protecting sensitive endpoints
    from brute-force and abuse.

ARCHITECTURE & 'WHY':
    Uses a per-key sliding window stored in-process memory (a dict of timestamp
    lists, guarded by a threading.Lock for thread-safety under Uvicorn's
    multi-threaded request handling).

    WHY not a FastAPI middleware or slowapi?
        We need granular, per-user/per-email rate limiting (not per-IP), which
        is not easily achieved with standard middleware. This module lets each
        endpoint explicitly call ``limiter.check(email, max_calls, window_seconds)``.

    PRODUCTION SCALING NOTE:
        This implementation is process-local. When deploying with multiple Uvicorn
        workers (``--workers N``) or multiple server instances, each process maintains
        its own independent counter. For true cross-process rate limiting, replace
        the ``_windows`` dict with a Redis sorted set (ZADD + ZRANGEBYSCORE).

EXPORTED SINGLETONS:
    ``ai_tutor_limiter``  — Limits AI Tutor grading calls (prevent LLM cost abuse).
    ``otp_limiter``       — Limits OTP verification attempts (prevent brute-force).
    ``password_reset_limiter`` — Limits forgot-password requests (prevent email spam).

CONNECTIONS:
    - Used by: api/mobile/auth.py (/forgot-password, /reset-password)
    - Used by: services/ai_tutor.py (/ai-tutor/grade)
"""

import time
import threading
import logging
from collections import defaultdict
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


class InMemoryRateLimiter:
    """
    A thread-safe, in-process sliding-window rate limiter.

    Tracks request timestamps per key (e.g. an email address or user ID).
    On each ``check()`` call, timestamps outside the sliding window are evicted,
    then the current window count is compared against ``max_calls``.

    Thread safety:
        A ``threading.Lock`` guards all reads and writes to ``_windows``.
        This is safe under Uvicorn's default single-process, multi-thread model.

    Memory management:
        Stale windows are evicted lazily on each ``check()`` call.
        For a system with millions of unique keys, consider a periodic background
        cleanup task or switch to Redis with TTL-based eviction.

    Example usage::

        from services.rate_limiter import otp_limiter

        # Allow max 5 OTP checks per email in a 10-minute window:
        otp_limiter.check(user_email, max_calls=5, window_seconds=600)
    """

    def __init__(self, name: str = "default") -> None:
        """
        Initialises the rate limiter.

        Args:
            name (str): A human-readable name for this limiter instance,
                        used in log messages. Defaults to ``"default"``.
        """
        self._name = name
        self._lock = threading.Lock()
        # { key: [unix_timestamp, unix_timestamp, ...] }
        # Each list holds the timestamps of requests within the current window.
        self._windows: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str, max_calls: int, window_seconds: int) -> None:
        """
        Records a request and raises HTTP 429 if the rate limit is exceeded.

        This method both CHECKS and RECORDS the call atomically under the lock.
        If the limit is not exceeded, the current timestamp is appended so it
        counts toward the next call's window.

        Args:
            key            (str): A unique identifier for the client being limited.
                                  Use email or user_id (not IP) for per-user limits.
            max_calls      (int): Maximum number of allowed calls within the window.
            window_seconds (int): The sliding window duration in seconds.

        Raises:
            HTTPException 429 (Too Many Requests): The client has exceeded ``max_calls``
                within the last ``window_seconds`` seconds.
        """
        now = time.time()
        cutoff = now - window_seconds

        with self._lock:
            # Evict timestamps that have fallen outside the sliding window
            self._windows[key] = [t for t in self._windows[key] if t > cutoff]
            current_count = len(self._windows[key])

            if current_count >= max_calls:
                logger.warning(
                    "[RateLimit:%s] Key '%s' exceeded %d calls / %ds window",
                    self._name, key, max_calls, window_seconds,
                )
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        f"Υπέρβαση ορίου. Μπορείς να προσπαθήσεις έως {max_calls} "
                        f"φορές ανά {window_seconds // 60} λεπτά."
                    ),
                )

            self._windows[key].append(now)

    def reset(self, key: str) -> None:
        """
        Clears all recorded timestamps for the given key.

        Call this after a successful operation to immediately restore access.
        Example: clear OTP attempts after a successful password reset so the
        user is not locked out if they request another reset.

        Args:
            key (str): The key to clear (e.g. the user's email address).
        """
        with self._lock:
            self._windows.pop(key, None)
        logger.debug("[RateLimit:%s] Reset window for key '%s'", self._name, key)


# ─── Singleton Instances ──────────────────────────────────────────────────────
# These are module-level singletons — import and use them directly in routers.

# AI Tutor grading endpoint: max 10 grade requests per user per 5 minutes.
# Prevents runaway LLM API costs from a single abusive account.
ai_tutor_limiter = InMemoryRateLimiter(name="ai_tutor")

# OTP verification: max 5 attempts per email per 10 minutes.
# A 6-digit OTP has 1,000,000 combinations. At 5 attempts / 10 min,
# brute-forcing takes >23 days, making it economically infeasible.
otp_limiter = InMemoryRateLimiter(name="otp_verify")

# Password reset requests: max 3 forgot-password emails per email per 15 minutes.
# Prevents email spam/flooding of a victim's inbox.
password_reset_limiter = InMemoryRateLimiter(name="password_reset")
