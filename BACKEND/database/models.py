"""
FILE: models.py
PURPOSE: SQLAlchemy ORM models — the single source of truth for database table structure.

ARCHITECTURE & 'WHY':
    Each class here maps 1-to-1 to a PostgreSQL table. SQLAlchemy reads these class
    definitions and uses them to auto-generate the schema via `Base.metadata.create_all()`
    called in main.py on startup.

    Relationships defined here (e.g., `User.progress`) allow SQLAlchemy to automatically
    join tables when you use `selectinload()`/`joinedload()` in queries, preventing N+1
    query problems. If you add a relationship here, make sure to add the corresponding
    `selectinload()` call in the router queries.

INDEXING STRATEGY:
    - `index=True` is applied to every column used in a WHERE filter or ORDER BY clause.
    - Composite indexes (via `__table_args__`) are used for multi-column filters
      (e.g., filtering by BOTH user_id AND is_resolved simultaneously).
    - ForeignKey columns are indexed because they are always used in JOIN conditions.

CONNECTIONS:
    - `db.py` provides the `Base` class that all models inherit from.
    - `schemas.py` mirrors these models with Pydantic classes for API serialization.
    - `routers/users.py` performs all DML (INSERT/UPDATE/DELETE) against these tables.
    - Adding a new column here requires a database migration (e.g., via Alembic).
"""

from sqlalchemy import Column, String, Boolean, DateTime, Date, ForeignKey, Integer, JSON, Index , UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime, timezone
from db import Base


def generate_uuid() -> str:
    """
    Generates a new UUID4 string.

    WHY a string instead of uuid.uuid4 directly?
    Chapter, Level, Question, UserProgress, and UserMistake use String PKs (not pgUUID)
    to keep the JSON payload clean (no UUID objects to serialize) and simplify
    joins across tables that mix String and UUID primary keys.

    Returns:
        str: A new UUID4 as a lowercase hyphenated string.
    """
    return str(uuid.uuid4())


# ─── Core User Table ──────────────────────────────────────────────────────────

class User(Base):
    """
    The central user table. Stores credentials, gamification stats, and freemium gate fields.

    GAMIFICATION FIELDS:
        - `total_xp`: The primary ranking signal. Already indexed (index=True) since it
          is used in ORDER BY for the Leaderboard query. Every level completion updates this.
        - `coins`: The in-app currency. Used by the freemium Redemption Quiz (spending)
          and the upcoming App Store (spending). Indexed for future Store queries.
        - `shields`: The energy system. Decreases on wrong answers. Max is 5.
        - `shields_updated_at`: Used to calculate offline shield regeneration.
        - `streak_days`: Used for future Badge triggers (e.g., "7-day streak" badge).
          Not indexed — currently never filtered, only read.

    FREEMIUM GATE FIELDS:
        - `is_premium`: Master premium flag. Free users are gated by `daily_quiz_count`.
        - `daily_quiz_count`: Resets to 0 each calendar day. Checked in `get_redemption_quiz`.
        - `last_quiz_date`: The date of the last quiz session. Used to detect day rollover
          and reset `daily_quiz_count`. Stored as Date (not DateTime) for easy comparison
          with `date.today()`.

    FUTURE-PROOFING:
        - No "badges" or "purchases" columns here. Those are handled via separate
          `UserBadge` and `UserPurchase` junction tables to avoid adding nullable
          columns to this already-wide table.
    """
    __tablename__ = "user_profile"

    # Primary key: UUID ensures global uniqueness and prevents enumeration attacks
    # (attackers can't guess /users/1001 to scrape profiles).
    id = Column(pgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user")  # Values: "user" | "content_editor" | "support_agent" | "admin" | "superadmin"

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    verified_email = Column(Boolean, default=False)

    # OTP fields for password reset flow. Cleared to None after successful reset.
    reset_otp = Column(String, nullable=True)
    reset_otp_expire = Column(DateTime, nullable=True)

    # ── Gamification ──────────────────────────────────────────────────────────
    # index=True on total_xp: The Leaderboard query does ORDER BY total_xp DESC.
    # Without an index, this is a full table sort — O(n log n) with n=all users.
    total_xp = Column(Integer, default=0, index=True)

    # index=True on coins: When the App Store is implemented, queries will filter
    # or sort by coins (e.g., "can user afford this perk?").
    coins = Column(Integer, default=0, index=True)

    # 🛡️ SHIELD SYSTEM 🛡️
    shields = Column(Integer, default=5)
    shields_updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    streak_days = Column(Integer, default=0)

    # WHY track streak_last_active separately?
    # We need to compare the last play DATE (not DateTime) to determine if the user
    # played yesterday (streak continues) or skipped a day (streak resets).
    # Stored as Date (not DateTime) for O(1) comparison with date.today().
    streak_last_active = Column(Date, nullable=True)

    # WHY lambda instead of datetime.utcnow directly?
    # Passing `datetime.utcnow` (without parentheses) as a default makes SQLAlchemy
    # call it at INSERT time. `datetime.utcnow` is deprecated in Python 3.12+; use
    # `lambda: datetime.now(timezone.utc)` for timezone-aware datetimes.
    last_login = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # ── Freemium Gate ─────────────────────────────────────────────────────────
    is_premium = Column(Boolean, default=False)
    daily_quiz_count = Column(Integer, default=0)
    last_quiz_date = Column(Date, nullable=True)

    # --- Notifications ---
    push_token = Column(String, nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    # cascade="all, delete-orphan": When a User is deleted, all child records are
    # automatically deleted too. This prevents orphaned rows across all features.
    progress = relationship("UserProgress", back_populates="user", cascade="all, delete-orphan")
    mistakes = relationship("UserMistake", back_populates="user", cascade="all, delete-orphan")
    badges = relationship("UserBadge", back_populates="user", cascade="all, delete-orphan")

    # ── OAuth (Google / Apple Sign-In) ────────────────────────────────────────
    # oauth_provider: identifies which external provider authenticated this user.
    # oauth_sub: the stable unique identifier issued by the provider (Google "sub" claim).
    # Indexed because _get_or_create_oauth_user queries by (provider, sub) on every
    # OAuth login — without the index this would be a full table scan.
    #
    # SECURITY NOTE: These two columns were previously defined OUTSIDE the class body
    # (module-level indentation), making them invisible to SQLAlchemy. They have been
    # moved inside the class to ensure they are registered as real DB columns.
    oauth_provider = Column(String, nullable=True)        # "google" | "apple" | None
    oauth_sub = Column(String, nullable=True, index=True) # Provider's unique user identifier

    # ── OTP Brute-Force Protection ────────────────────────────────────────────
    # Counts how many times a user has submitted an incorrect OTP on /reset-password.
    # After MAX_OTP_ATTEMPTS (5) failures, the OTP is invalidated and must be re-requested.
    # Reset to 0 on every successful password reset or new OTP generation.
    reset_otp_attempts = Column(Integer, default=0, nullable=False)

# ─── Auth ─────────────────────────────────────────────────────────────────────

class RefreshToken(Base):
    """
    Stores active refresh tokens (the "remember me" mechanism).

    WHY store refresh tokens in the DB instead of just trusting the JWT signature?
    This allows logout and token revocation to work. If someone's phone is stolen,
    an admin (or user) can delete all their refresh tokens from the DB, invalidating
    all active sessions immediately — something impossible with stateless JWTs alone.

    SCALABILITY NOTE:
        `token` is indexed (`index=True`) because every `/refresh` and `/logout` call
        does `WHERE token = ?`. Without an index, this scans the entire table.
        At 10,000 users with active sessions, this is catastrophically slow without it.
    """
    __tablename__ = "refresh_tokens"

    id = Column(pgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        pgUUID(as_uuid=True),
        ForeignKey("user_profile.id", ondelete="CASCADE"),
        nullable=False,
        index=True,  # Indexed for fast cascade deletes when a user account is deleted
    )
    # CRITICAL INDEX: Every auth refresh and logout does a WHERE on this column.
    token = Column(String, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ─── Course Content ───────────────────────────────────────────────────────────

class Chapter(Base):
    """
    Top-level content grouping (e.g., "Microeconomics", "Macroeconomics").

    `order_num` controls the visual order on the Home Screen and the 3D Roadmap.
    `is_premium` gates entire chapters behind the premium paywall.
    """
    __tablename__ = "chapters"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    description = Column(String)
    order_num = Column(Integer, nullable=False)
    is_premium = Column(Boolean, default=False)

    # Levels within this chapter, ordered by their own order_num.
    levels = relationship("Level", back_populates="chapter", cascade="all, delete-orphan")


class Level(Base):
    """
    A single playable quiz session within a Chapter.

    `min_xp_required`: The XP gate. The frontend compares `user.total_xp` against
    this field to determine if a Level node on the Roadmap is locked or unlocked.
    This is the core mechanic for the Duolingo-style progression system.

    `xp_reward`: The maximum XP a user can earn from this level (used in UI display).
    Actual XP earned is calculated server-side in `complete_level` based on accuracy.
    """
    __tablename__ = "levels"

    id = Column(String, primary_key=True, default=generate_uuid)
    # index=True: Used in JOIN when loading dashboard. ForeignKeys should always be indexed.
    chapter_id = Column(String, ForeignKey("chapters.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    order_num = Column(Integer, nullable=False)
    xp_reward = Column(Integer, default=100)
    min_xp_required = Column(Integer, default=0)

    chapter = relationship("Chapter", back_populates="levels")
    questions = relationship("Question", back_populates="level", cascade="all, delete-orphan")


class Question(Base):
    """
    A single quiz question. Supports three types via the `question_type` discriminator.

    TYPE SYSTEM ('WHY' the nullable JSON columns):
        Rather than three separate tables (MultipleChoiceQuestion, FillInQuestion,
        MatchQuestion), we use a single polymorphic table with nullable JSON columns.
        This avoids complex UNION queries and keeps the API simple. The trade-off is
        that the DB cannot enforce type-specific NOT NULL constraints — that enforcement
        happens via Pydantic schemas and frontend rendering logic.

        - `question_type = "multiple_choice"` → uses `options` + `correct_answer`
        - `question_type = "fill_in"`         → uses `correct_answers` (list of valid answers)
        - `question_type = "match"`           → uses `pairs` (list of {left, right} dicts)
    """
    __tablename__ = "questions"

    id = Column(String, primary_key=True, default=generate_uuid)
    # index=True: Queried on every quiz load via selectinload(Level.questions)
    level_id = Column(String, ForeignKey("levels.id"), nullable=False, index=True)

    # Discriminator field: determines which JSON columns are populated
    question_type = Column(String, nullable=False)  # "multiple_choice" | "fill_in" | "match"
    question_text = Column(String, nullable=False)
    explanation = Column(String)  # Shown after the user answers (correct or wrong)

    # Type-specific payload columns. Only one set is populated per question.
    options = Column(JSON, nullable=True)           # multiple_choice: ["A", "B", "C", "D"]
    correct_answer = Column(String, nullable=True)  # multiple_choice: "A"
    correct_answers = Column(JSON, nullable=True)   # fill_in: ["gdp", "GDP", "G.D.P."]
    pairs = Column(JSON, nullable=True)             # match: [{"left": "X", "right": "Y"}]

    level = relationship("Level", back_populates="questions")
    mistakes = relationship("UserMistake", back_populates="question", cascade="all, delete-orphan")


class TheoryQuestion(Base):
    """
    Premium AI Tutor Content: Stores the open-ended theory questions.
    
    The AI Tutor uses these records (specifically the ideal_answer and keywords) 
    to dynamically evaluate the student's text input.
    """
    __tablename__ = "theory_questions"

    id = Column(Integer, primary_key=True, index=True)
    # Linked to Chapters to allow the frontend to group theory by section
    chapter_id = Column(String, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True)
    
    question_text = Column(String, nullable=False)
    ideal_answer = Column(String, nullable=False)
    
    # A list of strings that MUST be present (or strongly implied) in the student's answer
    # Example: ["ceteris paribus", "αντίστροφη σχέση", "ζητούμενη ποσότητα"]
    keywords = Column(JSON, nullable=False) 

    chapter = relationship("Chapter")


# ─── User Progress & Mistakes ─────────────────────────────────────────────────

class UserProgress(Base):
    """
    Tracks a user's completion state for each Level they have attempted.

    One row per (user, level) pair. Updated on every `complete_level` call.

    SCALABILITY NOTE:
        Both `user_id` and `level_id` are indexed individually. A composite index
        `(user_id, level_id)` is even more efficient for the exact equality filter
        `WHERE user_id=? AND level_id=?` used in `complete_level`.

    FRAGILITY NOTE (see audit item #7):
        `score` is stored as a 0–100 integer percentage. The `complete_level` endpoint
        reconstructs the original correct-answer-count from this percentage. This is
        lossy — consider adding `correct_answers_count` and `total_questions_played`
        as explicit columns in a future migration.
    """
    __tablename__ = "user_progress"

    id = Column(String, primary_key=True, default=generate_uuid)
    # Both FK columns indexed: used in WHERE on every dashboard load and level completion.
    user_id = Column(
        pgUUID(as_uuid=True),
        ForeignKey("user_profile.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    level_id = Column(String, ForeignKey("levels.id", ondelete="CASCADE"), nullable=False, index=True)

    is_completed = Column(Boolean, default=False)
    score = Column(Integer, default=0)       # Stored as percentage (0–100)
    stars_earned = Column(Integer, default=0)
    last_played_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),  # Auto-updates on every save
    )

    user = relationship("User", back_populates="progress")
    level = relationship("Level")

    # Composite index: the complete_level query filters by BOTH user_id AND level_id.
    # This is significantly faster than two separate single-column index lookups.
    __table_args__ = (
        Index("ix_user_progress_user_level", "user_id", "level_id"),
    )


class UserMistake(Base):
    """
    Tracks which questions a user has answered incorrectly (the "Notebook" feature).

    One row per (user, question) pair. `mistakes_count` increments on each failure.
    `is_resolved` is set to True when the user successfully passes the Redemption Quiz
    for that specific question.

    FREEMIUM MODEL ROLE:
        The Redemption Quiz (`/mistakes/quiz`) is the core freemium mechanic. It fetches
        rows from this table ordered by `mistakes_count DESC` — the most-failed questions
        are prioritised. Free users are rate-limited via `User.daily_quiz_count`.

    COMPOSITE INDEX:
        The most common query pattern is `WHERE user_id=? AND is_resolved=False`.
        The composite index `(user_id, is_resolved)` covers this exact filter pattern
        far more efficiently than scanning all of a user's mistakes and filtering in Python.
    """
    __tablename__ = "user_mistakes"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(
        pgUUID(as_uuid=True),
        ForeignKey("user_profile.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id = Column(
        String,
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,  # Indexed for fast lookup in resolve_mistake and complete_level
    )

    mistakes_count = Column(Integer, default=1)  # Drives Redemption Quiz priority ordering
    is_resolved = Column(Boolean, default=False, index=True)  # Indexed for active-mistakes filter
    last_failed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    resolved_at = Column(DateTime(timezone=True), nullable=True)  # Set when Redemption Quiz is passed

    user = relationship("User", back_populates="mistakes")
    question = relationship("Question", back_populates="mistakes")

    # Composite index for the dominant query: "give me all UNRESOLVED mistakes for user X"
    # Used by: get_active_mistakes, get_redemption_quiz
    __table_args__ = (
        Index("ix_user_mistakes_user_resolved", "user_id", "is_resolved"),
    )


# ─── Gamification — Badges ────────────────────────────────────────────────────

class UserBadge(Base):
    """
    Junction table recording which badges each user has earned.

    One row per (user_id, badge_key) pair — the composite unique index ensures
    a user can never earn the same badge twice, even under concurrent requests.

    BADGE KEY CATALOGUE (defined in services/gamification.py BADGE_DEFINITIONS):
        first_level    — Completed first level
        perfect_score  — 100% accuracy on any level
        streak_3/7/30  — Consecutive day streaks
        mistake_master — Resolved first notebook mistake
        coin_hoarder   — Accumulated 100+ coins
        high_scorer    — ≥80% on 5+ different levels

    WHY store badge_key as a String instead of a FK to a badges table?
        Badge definitions (name, description, icon) are static, version-controlled
        data in BADGE_DEFINITIONS dict (services/gamification.py), not DB rows.
        This avoids a join on every badge read and makes adding new badges a
        code-only change — no migration needed for the definition itself.
    """
    __tablename__ = "user_badges"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(
        pgUUID(as_uuid=True),
        ForeignKey("user_profile.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The string key matching an entry in BADGE_DEFINITIONS (e.g. "streak_7", "perfect_score")
    badge_key = Column(String, nullable=False)
    earned_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="badges")

    # Composite unique: prevents awarding the same badge twice even under concurrent requests.
    __table_args__ = (
        Index("ix_user_badges_user_key", "user_id", "badge_key", unique=True),
    )
#----- Daily Quiz -----
class DailyQuiz(Base):
    __tablename__ = "daily_quizzes"
    
    id = Column(Integer, primary_key=True, index=True)
    date_active = Column(DateTime, unique=True, index=True)
    questions_json = Column(String)
    
    attempts = relationship("DailyQuizAttempt", back_populates="quiz", cascade="all, delete-orphan")

class DailyQuizAttempt(Base):
    __tablename__ = "daily_quiz_attempts"
    
    __table_args__ = (
        UniqueConstraint('user_id', 'quiz_id', name='uix_user_quiz_attempt'),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    
    # 🔥 ΔΙΟΡΘΩΣΗ 1: pgUUID και σωστό όνομα πίνακα (user_profile)
    user_id = Column(
        pgUUID(as_uuid=True), 
        ForeignKey("user_profile.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    
    # 🔥 ΔΙΟΡΘΩΣΗ 2: Σωστό FK για το quiz με CASCADE
    quiz_id = Column(
        Integer, 
        ForeignKey("daily_quizzes.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    
    score = Column(Integer, default=0)
    total_time_ms = Column(Integer, default=0)
    
    # 🔥 ΔΙΟΡΘΩΣΗ 3: Timezone-aware DateTime για να ταιριάζει με το υπόλοιπο σύστημα
    completed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    user = relationship("User")
    quiz = relationship("DailyQuiz", back_populates="attempts")