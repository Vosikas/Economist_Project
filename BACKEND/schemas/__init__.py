"""
FILE: schemas.py
PURPOSE: Pydantic V2 models for API request validation and response serialization.

ARCHITECTURE & 'WHY':
    Pydantic schemas are the contract between the frontend and backend. They have two roles:
    1. INPUT VALIDATION: Parse and validate incoming JSON request bodies (e.g., `Usersignup`).
    2. OUTPUT SERIALIZATION: Shape the response data returned from SQLAlchemy ORM objects
       (e.g., `UserResponse`, `ChapterOut`). This is why `model_config = ConfigDict(from_attributes=True)`
       appears on output schemas: it tells Pydantic to read from ORM object attributes.

ALIAS PATTERN ('WHY' Field aliases exist):
    The DB columns are named `question_type` and `question_text` (snake_case, descriptive).
    The frontend expects `type` and `question` (shorter, idiomatic JS).
    Pydantic V2 `Field(validation_alias=..., serialization_alias=...)` bridges this gap:
    - `validation_alias`: maps the DB attribute name → Pydantic field during input (from ORM).
    - `serialization_alias`: maps the Pydantic field name → JSON key during output (to API).
    - `populate_by_name=True`: allows using EITHER the field name OR the alias in tests/code.

IMPORT DUPLICATION NOTE:
    There are duplicate `from pydantic import ...` lines in this file (lines 1 and 48, 53).
    This is harmless in Python but messy. Safe to consolidate into a single import block
    at the top of the file in a future cleanup.

CONNECTIONS:
    - All `Out` schemas (ChapterOut, LevelOut, etc.) have counterpart ORM models in `models.py`.
    - `DashboardResponse` is the largest single payload — it combines User, Progress, and Chapters.
    - `routers/users.py` imports and uses all schemas below.
"""

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import List, Optional, Any
from datetime import date, datetime
from uuid import UUID


# ─── Authentication Schemas ────────────────────────────────────────────────────

class RefreshReq(BaseModel):
    """Request body for the /refresh and /logout endpoints. Contains only the refresh token."""
    refresh_token: str


class Usersignup(BaseModel):
    """
    Validated input for the POST /signup endpoint.

    WHY no `role` field here?
    Users cannot self-assign their role. The `role` field is set server-side
    to `"user"` by default in the ORM model. Admin roles are granted manually via DB.
    """
    username: str
    password: str
    email: EmailStr  # Pydantic validates email format before we even touch the DB


class Userlogin(BaseModel):
    """Request body for POST /login. Uses username (not email) as the login identifier."""
    username: str
    password: str


class UserResponse(BaseModel):
    """
    API response shape for the authenticated user object.


    WHAT'S MISSING (intentionally):
        - `password_hash`: Never exposed to the client.
        - `reset_otp`, `reset_otp_expire`: Sensitive OTP data, kept server-side only.
        - `daily_quiz_count`, `last_quiz_date`: Currently server-only. Add these
          when the frontend needs to display "X free quizzes remaining today".
        - `verified_email`: Not needed by the app UI post-login (login is already blocked
          for unverified users, so if you're here, you're verified).

    `from_attributes=True`: Allows `UserResponse.model_validate(user_orm_object)` to work
    by reading attributes directly from the SQLAlchemy User model instance.
    """
    id: UUID
    username: str
    email: EmailStr
    role: str
    is_premium: bool
    created_at: datetime

    # Gamification fields — consumed by the frontend stats header and leaderboard
    total_xp: int
    coins: int
    streak_days: int
    
    # SHIELD SYSTEM 🛡️
    shields: int
    shields_updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    """Response body for /login and /refresh. Both tokens are JWTs signed with SECRET_KEY."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


# ─── Password Reset Schemas ───────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    """
    Input for POST /forgot-password.
    Only needs the email to look up the user and send the OTP.
    The endpoint is intentionally vague in its response (anti-enumeration: same message
    whether or not the email exists in the DB).
    """
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """
    Input for POST /reset-password.
    Requires the OTP received via email + the new desired password.
    The 6-digit OTP is compared against `User.reset_otp` and checked against expiry.
    """
    email: EmailStr
    new_password: str
    otp: str


# ─── Course Content Schemas ───────────────────────────────────────────────────

class QuestionBase(BaseModel):
    """
    Base schema for a quiz question. Used by both API responses and internal processing.

    ALIAS EXPLANATION ('WHY' is this not just `question_type: str`?):
        The SQLAlchemy `Question` model uses `question_type` and `question_text` as column names
        (descriptive Python convention). However, the React Native frontend was built to expect
        the shorter `type` and `question` keys in the JSON response.

        Pydantic V2's Field aliases solve this without renaming DB columns or adding a transform layer:
        - `validation_alias="question_type"` → reads from the ORM attribute `question.question_type`
        - `serialization_alias="type"` → writes `"type"` into the JSON response body
        This is a clean, zero-cost adapter between two naming conventions.

        `populate_by_name=True` in the config allows BOTH `type` and `question_type` to be used
        when constructing a `QuestionBase` instance in Python code (e.g., in tests or factories).
    """
    # Maps from DB column `question_type` → JSON key `type`
    type: str = Field(validation_alias="question_type", serialization_alias="type")
    # Maps from DB column `question_text` → JSON key `question`
    question: str = Field(validation_alias="question_text", serialization_alias="question")

    # Type-specific fields — only one group will be populated per question (see models.py)
    options: Optional[List[str]] = None           # multiple_choice only
    correct_answer: Optional[str] = None          # multiple_choice only
    correct_answers: Optional[List[str]] = None   # fill_in only (list of acceptable answers)
    pairs: Optional[List[dict]] = None             # match only
    explanation: Optional[str] = None              # Shown after answering (all types)

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class QuestionOut(QuestionBase):
    """
    Full question schema for API responses. Extends QuestionBase with DB-assigned IDs.
    Returned nested inside `LevelOut.questions` when a quiz session is started.
    """
    id: str
    level_id: str
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class LevelBase(BaseModel):
    """Core level metadata used in list views (e.g., Roadmap nodes)."""
    title: str
    order_num: int
    xp_reward: int
    min_xp_required: int      # Frontend uses this to determine lock/unlock state


class LevelOut(LevelBase):
    """
    Full level schema including questions. Returned by GET /levels/{level_id}/questions.
    The `questions` list is populated server-side with a random subset (5 of N questions)
    to ensure quiz variety on every play.
    """
    id: str
    chapter_id: str
    questions: List[QuestionOut] = []
    model_config = ConfigDict(from_attributes=True)


class ChapterBase(BaseModel):
    """Core chapter metadata. `is_premium=False` makes free-tier the safe default."""
    title: str
    description: Optional[str] = None
    order_num: int
    is_premium: bool = False


class ChapterOut(ChapterBase):
    """
    Full chapter schema including nested levels. Used in the Dashboard response.
    The frontend uses this to build the entire Home Screen course structure and
    the 3D Roadmap (when implemented).

    NOTE ON LOAD VOLUME: ChapterOut contains levels, which contain questions for the
    dashboard query. The dashboard query uses `load_only(Level.id, Level.title, ...)` to
    avoid eagerly loading all question data — only question IDs/types are needed for the map.
    """
    id: str
    levels: List[LevelOut] = []
    model_config = ConfigDict(from_attributes=True)


# ─── Progress Schemas ─────────────────────────────────────────────────────────

class UserProgressBase(BaseModel):
    """
    Core progress record for one (user, level) pair.
    `score` is a 0–100 integer representing percentage accuracy.
    `is_completed` is True only if accuracy >= 80% on the best attempt.
    """
    level_id: str
    is_completed: bool
    score: int            # Percentage accuracy (0–100)
    stars_earned: int     # Future feature: 1/2/3 stars based on score bands


class UserProgressOut(UserProgressBase):
    """Progress record as returned to the frontend. Includes the DB ID and timestamp."""
    id: str
    last_played_at: datetime
    model_config = ConfigDict(from_attributes=True)


class DashboardResponse(BaseModel):
    """
    The primary bootstrap payload. Returned by GET /dashboard on every app launch.
    Contains everything the frontend needs to boot the app state:
    - `user`: The authenticated user's profile (XP, coins, streak, shields)
    - `progress`: All level completion records for this user
    - `chapters`: The full course structure (all chapters and their levels)

    WHY return all chapters every time?
    Chapters change rarely (when new content is released). Sending the full structure
    on login allows the frontend (Zustand) to cache it in AsyncStorage and skip the
    API call on subsequent opens if the cache is warm (see `fetchDashboardData` in
    the store — it short-circuits if `chapters.length > 0`).
    """
    user: UserResponse
    progress: List[UserProgressOut] = []
    chapters: List[ChapterOut] = []


# ─── Level Completion Schema ───────────────────────────────────────────────────

class LevelCompleteRequest(BaseModel):
    """
    Request body for POST /levels/complete. Sent immediately after a quiz session ends.

    `wrong_question_ids`: List of question IDs the user answered incorrectly.
    The server uses this to update `UserMistake` records (see Notebook feature).

    `total_questions`: Total questions presented in the session. Used server-side to
    calculate accuracy percentage. Defaults to 10 but is overridden by the actual
    session length (QUESTIONS_PER_PLAY = 5 currently, but may change).

    WHY send `total_questions` from the client?
    The server randomly selects 5 questions per play from a larger pool. Rather than
    re-querying to find out how many were served, the client reports back the count.
    TRUST MODEL: This is fine for XP balance (approximate) since the server re-validates
    everything. Do NOT use this for any payment-critical calculation.
    """
    level_id: str
    score: int                          # Raw score sent by client (used as reference)
    wrong_question_ids: List[str] = []  # Empty list = perfect score
    total_questions: int = 10           # How many questions were in this session


# ─── Mistakes / Notebook Schemas ──────────────────────────────────────────────

class UserMistakeOut(BaseModel):
    """
    A mistake record as returned to the Notebook screen and Redemption Quiz.

    `question` is an Optional nested QuestionOut — populated via `selectinload(UserMistake.question)`
    in the router. Without `selectinload`, Pydantic would either get None (lazy load disabled)
    or trigger an N+1 query (one extra SELECT per mistake). The `selectinload` bakes the question
    data into the same DB roundtrip as the mistakes query.
    """
    id: str
    question_id: str
    mistakes_count: int     # Higher = prioritised in Redemption Quiz
    is_resolved: bool
    last_failed_at: datetime
    question: Optional[QuestionOut] = None  # Eagerly loaded via selectinload in router

    model_config = ConfigDict(from_attributes=True)


class ResolveMistakeRequest(BaseModel):
    """
    Request body for POST /mistakes/resolve.
    Sent when a user answers a question correctly during the Redemption Quiz.
    """
    question_id: str


# ─── Leaderboard Schema ────────────────────────────────────────────────────────

class LeaderboardUser(BaseModel):
    """
    Minimal user data exposed on the public Leaderboard.
    Only `username` and `total_xp` — no email, coins, or progress details.
    This is intentional privacy scoping: the leaderboard is a public-facing feature.

    FUTURE: Add `streak_days` and `rank` (computed) here when building the
    full leaderboard UI with badges and profile avatars.
    """
    username: str
    total_xp: int

    model_config = ConfigDict(from_attributes=True)


# ─── Admin Auth Schema ─────────────────────────────────────────────────────────

class AdminLoginRequest(BaseModel):
    """Credentials for POST /admin/login."""
    username: str
    password: str

# ─── Store / Purchase Schema ───────────────────────────────────────────────────
class PurchaseResponse(BaseModel):
    """
    Returned by POST /store/buy-shields when a user spends coins to buy shields.
    Contains the new coin balance so the frontend can stay in sync.
    """
    success: bool
    message: str
    new_coin_balance: int
class ChangePasswordRequest(BaseModel):
    """
    Input for POST /change-password.
    Requires both the current and new passwords. The new password is enforced
    to a minimum of 8 characters server-side.
    """
    current_password: str = Field(min_length=1, description="Current account password for verification.")
    new_password: str = Field(
        min_length=8,
        max_length=128,
        description="New password. Minimum 8 characters.",
    )


class ChangeEmailRequest(BaseModel):
    """
    Input for POST /change-email.
    Uses EmailStr so Pydantic validates the format before the DB query fires.
    """
    new_email: EmailStr  # Validates format: requires '@' and a valid domain.


class PushTokenRequest(BaseModel):
    """
    Input for POST /update-push-token.
    Stores the Expo push token, capped to prevent oversized payloads.
    """
    token: str = Field(min_length=1, max_length=512)


class SyncShieldsRequest(BaseModel):
    """
    Input for POST /sync-shields.
    Called when the user aborts a quiz mid-session. The server clamps the
    value to [0, SHIELD_MAX] server-side, but Pydantic also enforces the
    range as a first-pass validation layer.

    ge=0: Cannot send negative shields (shields cannot go below zero).
    le=5: Cannot send more than the max (prevents trivial cheat payloads).
    """
    remaining_shields: int = Field(ge=0, le=5)
    # --- Pydantic Schemas ---
class SubmitScoreRequest(BaseModel):
    quiz_id: int
    score: int # Πόσες σωστές έκανε (π.χ. 4/5)
    total_time_ms: int # Πόσο χρόνο έκανε
class GoogleAuthRequest(BaseModel):
    id_token: str  # Το ID token που δίνει το Google Sign-In στο frontend
class AppleAuthRequest(BaseModel):
    id_token: str        # JWT από την Apple
    full_name: str | None = None  # Μόνο στο ΠΡΩΤΟ login δίνει η Apple το όνομα

