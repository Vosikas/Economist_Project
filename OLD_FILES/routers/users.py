"""
FILE: routers/users.py
PURPOSE: All user-facing business logic endpoints — signup, dashboard, quiz, mistakes, leaderboard.

ARCHITECTURE & 'WHY':
    This is the largest router and contains all the core gamification mechanics.
    Every route (except /signup and /verify-email) requires authentication via
    `current_user: User = Depends(get_current_user)`.

SCALABILITY HIGHLIGHTS (see scalability_audit.md for full details):
    - `complete_level`: The mistake upsert loop was a classic N+1 problem.
      FIXED: Now bulk-fetches all relevant UserMistake rows in ONE query before the loop.
    - `get_main_dashboard`: Uses `selectinload` + `load_only` to fetch chapters and
      their level metadata in 2 queries total (not one per chapter).
    - `get_redemption_quiz` / `get_active_mistakes`: Use `selectinload(UserMistake.question)`
      to fetch question data in one additional batched query, not one per mistake.
    - `get_Leaderboard`: `User.total_xp` has `index=True` in models.py. Still recommend
      Redis caching for the ranked query at high user counts (see audit).

CONNECTIONS:
    - `models.py` → User, Chapter, Level, UserProgress, UserMistake, Question ORM models.
    - `schemas.py` → All request/response Pydantic models.
    - `security.py` → `get_current_user` dependency for JWT validation.
    - `emails_service.py` → Email verification on signup via BackgroundTasks.
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy.orm import load_only
import jwt
import random
import os
from datetime import datetime, timedelta, date, timezone
from typing import List
from cachetools import TTLCache
from threading import Lock

from database.db import get_db
from database.models import User, Chapter, Level, UserProgress, UserMistake, Question
from schemas import (
    LeaderboardUser,
    Usersignup,
    UserResponse,
    DashboardResponse,
    LevelCompleteRequest,
    LevelOut,
    UserMistakeOut,
    ResolveMistakeRequest,
)
from core.security import get_password_hash, create_verification_token, get_current_user
from emails_service import send_verification_email
from fastapi.responses import FileResponse, HTMLResponse

router = APIRouter(tags=["Users"])

# ─── Leaderboard Cache ────────────────────────────────────────────────────────
# Stores the top-100 result for up to 60 seconds.
# WHY TTLCache instead of Redis?
#   For <50,000 users, an in-process cache is sufficient and has zero infra cost.
#   Upgrade to a Redis Sorted Set when you need cross-process consistency
#   (multiple Uvicorn workers) or real-time rank updates.
#
# TTLCache(maxsize=1): we only ever store one key ("top100").
# ttl=60: the leaderboard refreshes at most once per minute, even under heavy load.
# Lock: prevents a "cache stampede" — if two requests arrive simultaneously on a
#   cold cache, only one fires the DB query; the other waits and reuses the result.
_leaderboard_cache: TTLCache = TTLCache(maxsize=1, ttl=60)
_leaderboard_lock: Lock = Lock()


def _invalidate_leaderboard_cache() -> None:
    """
    Clears the leaderboard cache immediately.
    Called by complete_level() whenever a user's XP changes so the next
    leaderboard request reflects the updated rankings without waiting 60 seconds.
    """
    with _leaderboard_lock:
        _leaderboard_cache.clear()


# ─── Registration & Email Verification ───────────────────────────────────────

@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user: Usersignup, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Registers a new user account and sends a verification email.

    Checks for duplicate username OR email in a single DB query using an OR filter.
    The password is hashed before any DB write — plaintext never touches the database.

    The verification email is sent as a BackgroundTask so the HTTP response (201 Created)
    is returned immediately without waiting for the email service. If the email fails to
    send, the user account still exists but remains unverified — they can trigger a resend
    in a future feature.

    Args:
        user (Usersignup): username, email, password from the request body.
        background_tasks (BackgroundTasks): FastAPI background task queue.
        db (Session): Injected DB session.

    Returns:
        UserResponse: The newly created user (without password hash).

    Raises:
        HTTPException 400: Username or email already in use.
    """
    # Check both username AND email in one query using OR — avoids two round trips
    user_exists = db.query(User).filter(
        (User.username == user.username) | (User.email == user.email)
    ).first()

    if user_exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username or email already exists")

    hashed_password = get_password_hash(user.password)
    new_user = User(username=user.username, email=user.email, password_hash=hashed_password)
    db.add(new_user)
    db.commit()
    # `db.refresh(new_user)` re-reads the row from DB to populate server-default fields
    # (e.g., `created_at` set by `server_default=func.now()`). Without this, those
    # fields would be None in the response.
    db.refresh(new_user)

    # Issue a short-lived verification JWT and email it. The user must click the link
    # before they can log in (enforced in /login by checking `verified_email`).
    token = create_verification_token(new_user.email)
    background_tasks.add_task(send_verification_email, new_user.email, token)

    return new_user


@router.get("/verify-email/", response_class=HTMLResponse)
def verify_email(token: str, db: Session = Depends(get_db)):
    """
    Handles the email verification link clicked by the user in their inbox.

    WHY return HTML instead of JSON?
    This endpoint is opened by the user's browser (not the app). It must render
    a user-friendly success page, not a JSON response. The `response_class=HTMLResponse`
    tells FastAPI to set Content-Type: text/html automatically.

    If the token is expired, a 401 is raised. If already verified, serves a static
    HTML file (`emailverifyscr.html`) — which should probably say "already verified".

    Args:
        token (str): The JWT verification token from the email link query parameter.
        db (Session): Injected DB session.

    Returns:
        HTMLResponse: A styled success page.

    Raises:
        HTTPException 401: Token expired or invalid.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Inline HTML for the success page. Kept here (rather than a separate file)
    # for portability — one less static file to manage.
    success_html = """
    <!DOCTYPE html>
    <html lang="el">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>20_E - Επαλήθευση Email</title>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
        <style>
            body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: linear-gradient(135deg, #0f172a, #1e293b); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #f1f5f9; }
            .card { background: rgba(30, 41, 59, 0.8); padding: 40px; border-radius: 20px; border: 1px solid #334155; text-align: center; max-width: 400px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); animation: fadeIn 0.8s ease-out; }
            .icon-container { width: 80px; height: 80px; background: rgba(16, 185, 129, 0.1); border-radius: 50%; display: flex; justify-content: center; align-items: center; margin: 0 auto 20px; border: 2px solid #10b981; box-shadow: 0 0 20px rgba(16, 185, 129, 0.4); }
            .icon { font-size: 40px; color: #10b981; }
            .logo { font-size: 48px; font-weight: 900; color: #f1f5f9; letter-spacing: -2px; margin-bottom: 20px; }
            .logo span { font-size: 24px; color: #10b981; margin-left: 2px; }
            h1 { margin: 0 0 10px; font-size: 28px; letter-spacing: 1px; }
            p { color: #94a3b8; font-size: 16px; line-height: 1.5; margin-bottom: 30px; }
            .btn { background: linear-gradient(90deg, #10b981, #059669); color: white; padding: 12px 25px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 16px; transition: transform 0.2s; display: inline-block; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); }
            .btn:hover { transform: scale(1.05); }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="logo">20<span>E</span></div>
            <div class="icon-container">
                <i class="fas fa-shield-alt icon"></i>
            </div>
            <h1>Θωράκιση Επιτυχής!</h1>
            <p>Το email σου επαληθεύτηκε. Το προφίλ σου στο <b>20_E</b> είναι πλέον ενεργό και έτοιμο για το επόμενο Level.</p>
            <a href="javascript:window.close();" class="btn">Επιστροφή στο App</a>
        </div>
    </body>
    </html>
    """

    try:
        # Decode the verification JWT — same key as auth tokens but contains email (not user_id)
        payload = jwt.decode(token, os.getenv("SECRET_KEY"), algorithms=[os.getenv("ALGORITHM")])
        email = payload.get("sub")
        if email is None:
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Το link έχει λήξει.")
    except jwt.InvalidTokenError:
        raise credentials_exception

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise credentials_exception

    # Idempotent: if already verified, show a static "already verified" page
    if user.verified_email:
        return FileResponse("emailverifyscr.html")

    user.verified_email = True
    db.commit()

    return HTMLResponse(content=success_html, status_code=200)


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=DashboardResponse)
def get_main_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    The primary bootstrap endpoint — returns everything the app needs on launch.

    Called by Zustand's `fetchDashboardData()` on app open (if chapters cache is cold).
    Returns the authenticated user's profile, all their progress records, and the
    full course structure (chapters → levels).

    QUERY STRATEGY:
        Two DB queries total for the course content:
        1. SELECT all chapters with their level metadata (via selectinload + load_only).
           `load_only` prevents eagerly loading question data here — that's fetched
           on-demand per-level when a quiz session starts.
        2. SELECT all UserProgress records for this user.
        The user object is already loaded by `get_current_user` (no extra query).

    WHY not paginate chapters?
        The full chapter list is cached in AsyncStorage by the frontend. Re-fetching
        only occurs on cold start. The payload is small (metadata only, no question text).
        Pagination would add complexity for no practical benefit at this scale.

    Args:
        db (Session): Injected DB session.
        current_user (User): The authenticated user (from JWT via get_current_user).

    Returns:
        DashboardResponse: { user, progress, chapters }
    """
    # Query 1: Load all chapters and their level metadata.
    # `selectinload` issues a single batched SELECT for all levels: efficient.
    # `load_only(...)` fetches only the columns needed for Roadmap/HomeScreen
    # display — avoids pulling full Level data (xp_reward, min_xp_required are
    # included as they're needed for the lock/unlock UI logic).
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
        .order_by(Chapter.order_num)  # Consistent ordering for the Roadmap and Home Screen
        .all()
    )

    # Query 2: All progress records for this user.
    # The frontend uses these to determine which levels are completed (green nodes)
    # and what score was achieved (star display).
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


# ─── Quiz & Level Completion ──────────────────────────────────────────────────

@router.post("/levels/complete")
def complete_level(
    payload: LevelCompleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Records the result of a completed quiz session and updates XP, coins, and mistakes.

    This is the core XP engine. Called immediately when a quiz session ends on the frontend.

    XP CALCULATION LOGIC:
        - 20 XP per correct answer ("base XP").
        - +20 XP "perfect bonus" if zero wrong answers.
        - XP is only awarded for IMPROVEMENT over the user's previous best.
          e.g., 1st play: 80% → gets full XP for 4/5 correct.
               2nd play: 90% → gets only the delta XP (1 more correct answer's worth).
          This prevents infinite XP farming by replaying completed levels.

    COIN ECONOMY:
        - First play, passing (≥80%): 10 coins (perfect) or 5 coins (passing).
        - Repeat play, achieving perfect for the first time: 5 coins bonus.
        - No coins for failing or for replays without improvement.

    N+1 FIX (CRITICAL):
        The old implementation queried the DB once per wrong question ID:
            for q_id in wrong_ids: db.query(UserMistake).filter(...).first()  # N queries!
        The new implementation fetches all relevant mistakes in ONE query,
        processes them in-memory via a dict lookup, then bulk-inserts new ones.

    Args:
        payload (LevelCompleteRequest): level_id, score, wrong_question_ids, total_questions.
        db (Session): Injected DB session.
        current_user (User): The authenticated user.

    Returns:
        dict: { xp_gained, new_total_xp, accuracy, passed }
    """
    level = db.query(Level).filter(Level.id == payload.level_id).first()
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")

    # Check if the user has played this level before
    progress = db.query(UserProgress).filter(
        UserProgress.user_id == current_user.id,
        UserProgress.level_id == payload.level_id
    ).first()

    wrong_count = len(payload.wrong_question_ids)
    total_questions = payload.total_questions if payload.total_questions > 0 else 1
    correct_answers = total_questions - wrong_count
    accuracy = correct_answers / total_questions
    # A level is "passed" if the user answered ≥80% correctly
    passed = accuracy >= 0.8

    # XP formula constants — adjust these to tune game balance
    XP_PER_QUESTION = 20
    PERFECT_BONUS = 20  # Bonus for a flawless run (all correct)

    base_xp_earned = correct_answers * XP_PER_QUESTION
    bonus_xp = PERFECT_BONUS if wrong_count == 0 else 0
    total_potential_xp = base_xp_earned + bonus_xp

    xp_to_grant = 0
    coins_to_grant = 0

    if not progress:
        # First time playing this level — award full XP
        xp_to_grant = total_potential_xp
        if passed:
            # Coin rewards are only given on first completion (not replays)
            coins_to_grant = 10 if wrong_count == 0 else 5
    else:
        # Replay: only award XP for improvement beyond the previous best.
        # WHY reconstruct old_correct_answers from score percentage?
        # The `score` column stores accuracy as a percentage (0-100), not raw count.
        # This back-calculation is a known fragility (see audit item #7).
        # Fix: store `correct_answers_count` as an explicit column in UserProgress.
        old_correct_answers = int((progress.score / 100) * total_questions)
        old_total_xp = (old_correct_answers * XP_PER_QUESTION) + (PERFECT_BONUS if progress.score == 100 else 0)

        if total_potential_xp > old_total_xp:
            xp_to_grant = total_potential_xp - old_total_xp
            # Bonus coins if the user achieved perfect for the first time on a replay
            if wrong_count == 0 and progress.score < 100:
                coins_to_grant = 5

    current_user.total_xp += xp_to_grant
    current_user.coins += coins_to_grant

    # ── Mistake Notebook Update (N+1 FIX) ────────────────────────────────────
    # BEFORE (bad): one SELECT per wrong question ID — O(N) DB round trips
    # AFTER (good): one SELECT for ALL wrong IDs at once — O(1) DB round trip
    if wrong_count > 0:
        # Bulk-fetch all existing mistake records for this user + these question IDs
        existing_mistakes = db.query(UserMistake).filter(
            UserMistake.user_id == current_user.id,
            UserMistake.question_id.in_(payload.wrong_question_ids)
        ).all()
        # Build an O(1) lookup map: { question_id → UserMistake }
        mistakes_map = {m.question_id: m for m in existing_mistakes}

        new_mistakes = []
        for q_id in payload.wrong_question_ids:
            if q_id in mistakes_map:
                # Already has a mistake record — increment count and re-open it
                mistakes_map[q_id].mistakes_count += 1
                mistakes_map[q_id].is_resolved = False  # Re-open if already resolved
                mistakes_map[q_id].last_failed_at = datetime.now(timezone.utc)
            else:
                # First time failing this question — create a new record
                new_mistakes.append(
                    UserMistake(
                        user_id=current_user.id,
                        question_id=q_id,
                        mistakes_count=1,
                        is_resolved=False,
                    )
                )
        if new_mistakes:
            db.add_all(new_mistakes)  # Single INSERT for all new mistakes (bulk-add)

    # ── Progress Record Update ────────────────────────────────────────────────
    current_score_percentage = int(accuracy * 100)
    if not progress:
        progress = UserProgress(
            user_id=current_user.id,
            level_id=payload.level_id,
            is_completed=passed,
            score=current_score_percentage,
        )
        db.add(progress)
    else:
        # Ratchet forward — never reduce a score or revoke completion
        if passed:
            progress.is_completed = True
        if current_score_percentage > progress.score:
            progress.score = current_score_percentage

    db.commit()
    # `db.refresh` re-reads the user row to get the updated total_xp and coins
    db.refresh(current_user)

    # Invalidate the leaderboard cache immediately so the updated XP rank is
    # visible on the next leaderboard request without waiting up to 60 seconds.
    if xp_to_grant > 0:
        _invalidate_leaderboard_cache()

    return {
        "xp_gained": xp_to_grant,
        "new_total_xp": current_user.total_xp,
        "accuracy": current_score_percentage,
        "passed": passed,
    }


@router.get("/levels/{level_id}/questions", response_model=LevelOut)
def get_level(
    level_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fetches a level's metadata and a randomised subset of its questions for a quiz session.

    WHY random selection?
    Serving a random 5 of N questions on each play ensures variety, discourages
    rote memorisation of a fixed question order, and keeps replay value high.

    `selectinload(Level.questions)` fetches all questions for the level in one extra
    SELECT, then the randomisation happens in Python. This is safe given the question
    pool per level is small (typically 10–20). If question counts ever exceed 100,
    consider moving the random sampling to SQL using ORDER BY RANDOM() LIMIT 5.

    Args:
        level_id (str): The UUID string of the level to load.
        db (Session): Injected DB session.
        current_user (User): Authenticated user (required — this is a protected endpoint).

    Returns:
        LevelOut: Level metadata + a randomised list of up to 5 QuestionOut objects.

    Raises:
        HTTPException 404: Level not found.
    """
    # Single query: loads level + all its questions via selectinload (2 SQL SELECTs total)
    level = db.query(Level).options(selectinload(Level.questions)).filter(Level.id == level_id).first()
    if not level:
        raise HTTPException(status_code=404, detail="Το Level δεν βρέθηκε.")

    all_questions = list(level.questions)

    # Randomly select QUESTIONS_PER_PLAY questions from the pool for this session
    QUESTIONS_PER_PLAY = 5
    if len(all_questions) > QUESTIONS_PER_PLAY:
        selected_questions = random.sample(all_questions, QUESTIONS_PER_PLAY)
    else:
        # Pool is smaller than or equal to QUESTIONS_PER_PLAY — use all, but shuffle order
        selected_questions = all_questions.copy()
        random.shuffle(selected_questions)

    # Manually construct the response object rather than returning `level` directly,
    # because `level.questions` would include all questions (not just the selected subset).
    return LevelOut(
        id=level.id,
        title=level.title,
        order_num=level.order_num,
        xp_reward=level.xp_reward,
        min_xp_required=level.min_xp_required,
        chapter_id=level.chapter_id,
        questions=selected_questions,
    )


# ─── Redemption Quiz (Freemium Feature) ───────────────────────────────────────

@router.get("/mistakes/quiz", response_model=List[UserMistakeOut])
def get_redemption_quiz(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns the user's top unresolved mistakes for the Redemption Quiz session.

    FREEMIUM GATE LOGIC:
        Free users get FREE_DAILY_LIMIT Redemption Quiz sessions per calendar day.
        The limit resets at midnight (detected by comparing `last_quiz_date` with `date.today()`).
        Premium users bypass the limit entirely.

        WHY use `date.today()` (not datetime)?
        Date comparison is simpler and avoids timezone edge cases when all we need
        to know is "has a calendar day changed?". The reset is "local server midnight"
        which is acceptable for a soft freemium gate.

    QUESTION ORDERING:
        Questions are sorted by `mistakes_count DESC` — the most-failed questions are
        prioritised. This ensures the Redemption Quiz tackles the user's biggest weaknesses first.

    `selectinload(UserMistake.question)`:
        Fetches the full question data (text, options, etc.) for each mistake in one
        extra batched SELECT. Without this, Pydantic would get None for the nested
        `question` field (since lazy loading is not available after the session closes).

    Args:
        db (Session): Injected DB session.
        current_user (User): Authenticated user.

    Returns:
        List[UserMistakeOut]: Up to 10 active mistakes with nested question data.

    Raises:
        HTTPException 403: "limit_reached" — free user has exhausted their daily quota.
        HTTPException 404: No active mistakes exist for this user.
    """
    # DEVELOPMENT NOTE: FREE_DAILY_LIMIT is set very high (100) to avoid blocking
    # testing. Set to a real business value (e.g., 3) before production launch.
    FREE_DAILY_LIMIT = 100

    today = date.today()
    # Detect day rollover: if stored date != today, reset the counter for the new day
    if current_user.last_quiz_date != today:
        current_user.daily_quiz_count = 0
        current_user.last_quiz_date = today

    # Freemium gate: block free users who have hit the daily limit
    if not current_user.is_premium and current_user.daily_quiz_count >= FREE_DAILY_LIMIT:
        raise HTTPException(status_code=403, detail="limit_reached")

    quiz_mistakes = (
        db.query(UserMistake)
        .options(selectinload(UserMistake.question))  # Eagerly load question data (no N+1)
        .filter(
            UserMistake.user_id == current_user.id,
            UserMistake.is_resolved == False,  # noqa: E712 (SQLAlchemy requires == not `is`)
        )
        .order_by(UserMistake.mistakes_count.desc())  # Worst mistakes first
        .limit(10)
        .all()
    )

    if not quiz_mistakes:
        raise HTTPException(status_code=404, detail="Μπράβο! Δεν έχεις κανένα ενεργό λάθος για να λύσεις.")

    # Increment the daily counter AFTER successfully fetching the quiz
    current_user.daily_quiz_count += 1
    db.commit()

    return quiz_mistakes


@router.post("/mistakes/resolve")
def resolve_mistake(
    payload: ResolveMistakeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Marks a mistake as resolved and awards coins to the user.

    Called by the frontend when a user correctly answers a question during the
    Redemption Quiz. The coin reward is tiered by mistake severity:
        - `mistakes_count >= 3` (chronic failure): 15 coins — bigger reward for harder work.
        - `mistakes_count < 3` (minor stumble): 5 coins.

    The filter includes `is_resolved == False` to prevent double-resolving the same
    mistake (e.g., if the frontend sends the request twice due to a network retry).

    Args:
        payload (ResolveMistakeRequest): The question_id of the resolved mistake.
        db (Session): Injected DB session.
        current_user (User): Authenticated user.

    Returns:
        dict: { message, coins_earned, new_total_coins, question_id }

    Raises:
        HTTPException 404: Mistake not found or already resolved.
    """
    mistake = db.query(UserMistake).filter(
        UserMistake.user_id == current_user.id,
        UserMistake.question_id == payload.question_id,
        UserMistake.is_resolved == False,  # noqa: E712
    ).first()

    if not mistake:
        raise HTTPException(status_code=404, detail="Το λάθος δεν βρέθηκε ή έχει ήδη λυθεί.")

    mistake.is_resolved = True
    mistake.resolved_at = datetime.now(timezone.utc)

    # Tiered coin reward: chronic mistakes (≥3 failures) earn more coins
    coins_earned = 15 if mistake.mistakes_count >= 3 else 5
    current_user.coins += coins_earned

    db.commit()
    db.refresh(current_user)

    return {
        "message": "Το λάθος επιλύθηκε επιτυχώς!",
        "coins_earned": coins_earned,
        "new_total_coins": current_user.coins,
        "question_id": mistake.question_id,
    }


# ─── Mistake Notebook ─────────────────────────────────────────────────────────

@router.get("/mistakes/active", response_model=List[UserMistakeOut])
def get_active_mistakes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns all unresolved mistakes for display on the Notebook Screen.

    Unlike `get_redemption_quiz`, this endpoint has no limit and returns ALL
    active mistakes (not just top 10). It is used to populate the full Notebook
    view, not to start a quiz session. No daily counter is incremented here.

    `selectinload(UserMistake.question)` fetches question details in one extra
    batched SELECT — essential for displaying question text in the Notebook cards.

    Args:
        db (Session): Injected DB session.
        current_user (User): Authenticated user.

    Returns:
        List[UserMistakeOut]: All active (unresolved) mistakes with question data.
    """
    mistakes = (
        db.query(UserMistake)
        .options(selectinload(UserMistake.question))  # One extra SELECT — no N+1
        .filter(
            UserMistake.user_id == current_user.id,
            UserMistake.is_resolved == False,  # noqa: E712
        )
        .all()
    )
    return mistakes


# ─── Account Management ───────────────────────────────────────────────────────

@router.delete("/me", status_code=status.HTTP_200_OK)
def delete_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Permanently deletes the authenticated user's account and all associated data.

    WHY no explicit deletion of Progress and Mistakes?
    The `User` model defines `cascade="all, delete-orphan"` on both the `progress`
    and `mistakes` relationships. SQLAlchemy handles the cascade automatically when
    `db.delete(current_user)` is called. No manual child deletions needed.

    The `try/except` ensures the DB is rolled back to a consistent state if the
    delete fails (e.g., a constraint violation), preventing partial data deletion.

    Args:
        db (Session): Injected DB session.
        current_user (User): The authenticated user to delete.

    Returns:
        dict: Confirmation message.

    Raises:
        HTTPException 500: Internal error during deletion (DB rolled back).
    """
    try:
        db.delete(current_user)
        db.commit()
        return {"message": "Ο λογαριασμός και όλα τα δεδομένα διαγράφηκαν επιτυχώς."}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Προέκυψε σφάλμα κατά τη διαγραφή του λογαριασμού.",
        )


# ─── Leaderboard ──────────────────────────────────────────────────────────────

@router.get("/leaderboard", response_model=List[LeaderboardUser])
def get_Leaderboard(db: Session = Depends(get_db)):
    """
    Returns the top 100 users ranked by total XP.

    NOTE: This endpoint intentionally does NOT require authentication.
    Leaderboards are a public social feature — showing them to anonymous users
    encourages sign-up and competition.

    PERFORMANCE:
        `User.total_xp` has `index=True` applied in models.py. PostgreSQL can
        use a B-tree index scan for `ORDER BY total_xp DESC` — much faster than
        a full table sort. The `LIMIT 100` further reduces data transfer.

    SCALABILITY WARNING (see audit):
        At 10,000+ users this query still runs on every page view. Consider:
        1. SHORT-TERM: Cache the result for 60 seconds using `cachetools.TTLCache`.
        2. LONG-TERM: Maintain a Redis Sorted Set updated on every `complete_level`
           call. O(log N) write, O(100) read — handles millions of users.

    Args:
        db (Session): Injected DB session.

    Returns:
        List[LeaderboardUser]: Top 100 users (username + total_xp only).
    """
    # Try to serve from cache first (zero DB cost on cache hit)
    with _leaderboard_lock:
        cached = _leaderboard_cache.get("top100")
        if cached is not None:
            return cached

        # Cache miss: query the DB and store the result
        # The index on User.total_xp makes this an efficient index scan, not a full sort.
        top100 = db.query(User).order_by(User.total_xp.desc()).limit(100).all()
        _leaderboard_cache["top100"] = top100
        return top100
