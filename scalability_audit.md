# 🔍 Scalability & Performance Audit — Economist App

> **Stack:** FastAPI + SQLAlchemy (sync) + PostgreSQL · React Native (Expo) + Zustand
> **Audited files:** [models.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/models.py), [schemas.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/schemas.py), [db.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/db.py), [security.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/security.py), [config.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/config.py), [main.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/main.py), [routers/auth.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/auth.py), [routers/users.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py), [useAppStore.js](file:///c:/Users/prodr/Desktop/ECONOMIST/mobile-app/Src/store/useAppStore.js)

---

## 🚨 CRITICAL

### 1. Synchronous SQLAlchemy Blocking the FastAPI Event Loop
**File:** [db.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/db.py), all route files

Your [db.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/db.py) uses `create_engine` (sync) and `SessionLocal` (sync). Your routes use `def` (not `async def`). This forces FastAPI to run every DB call in a **threadpool executor**, capping concurrency at ~40 threads. At 10,000 concurrent users, this becomes a wall.

**Fix (choose one):**
- **Recommended (pragmatic):** Keep sync SQLAlchemy but ensure you are running Uvicorn with multiple workers (`--workers 4`). This is the simplest change and handles moderate scale.
- **Best (long-term):** Migrate to `sqlalchemy.ext.asyncio` (`AsyncSession`, `async_sessionmaker`, `asyncpg` driver). Requires rewriting all queries with `await session.execute(select(...))`.

```python
# db.py — async version (long-term)
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
DATABASE_URL = f"postgresql+asyncpg://..."
engine = create_async_engine(DATABASE_URL, pool_size=20, max_overflow=10)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
```

---

### 2. N+1 Query: [complete_level](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#134-214) loops with per-mistake DB queries
**File:** [routers/users.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py) — [complete_level()](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#134-214), lines 184–193

```python
# ❌ CURRENT: 1 query per wrong question ID — O(N) queries
for q_id in payload.wrong_question_ids:
    mistake = db.query(UserMistake).filter(...).first()
```

When a user gets 20 questions wrong, this fires **20 separate SELECT queries**. At scale, this is a DB killer.

**Fix:** Bulk-fetch all relevant mistakes in one query, then process in-memory.
```python
# ✅ FIXED: 1 query for all mistakes at once
existing_mistakes = db.query(UserMistake).filter(
    UserMistake.user_id == current_user.id,
    UserMistake.question_id.in_(payload.wrong_question_ids)
).all()
mistakes_map = {m.question_id: m for m in existing_mistakes}

for q_id in payload.wrong_question_ids:
    if q_id in mistakes_map:
        mistakes_map[q_id].mistakes_count += 1
        mistakes_map[q_id].is_resolved = False
    else:
        db.add(UserMistake(user_id=current_user.id, question_id=q_id, mistakes_count=1))
```

---

### 3. [RefreshToken](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/models.py#38-46) lookup by raw token string — no index
**File:** [models.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/models.py) — `RefreshToken.token`, [routers/auth.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/auth.py)

```python
# auth.py — this full-table-scans the refresh_tokens table:
db.query(RefreshToken).filter(RefreshToken.token == request.refresh_token).first()
```

Every `/refresh` and `/logout` call scans the entire `refresh_tokens` table. With 10,000 users each having active sessions, this is **extremely slow**.

**Fix:**
```python
# models.py
token = Column(String, nullable=False, index=True)  # ← ADD index=True
```

---

### 4. Leaderboard: Full table scan on every request, no caching
**File:** [routers/users.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py) — [get_Leaderboard()](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#339-344), line 342

```python
top100 = db.query(User).order_by(User.total_xp.desc()).limit(100).all()
```

`total_xp` already has `index=True` on the model — ✅ good. **However**, this query runs on every page load of every client. With 100 users refreshing the leaderboard screen, that's 100 full-sort operations per second.

**Fix (short-term):** Add a simple in-memory cache with TTL using `functools.lru_cache` or `cachetools`:
```python
# Leaderboard changes at most every time a level is completed.
# Cache for 60 seconds. Invalidate on complete_level.
```

**Fix (long-term):** Use a **Redis Sorted Set** — `ZADD leaderboard <xp> <user_id>` on every XP update, `ZREVRANGE leaderboard 0 99 WITHSCORES` for the leaderboard query. O(log N) write, O(log N + 100) read.

---

## ⚠️ WARNING

### 5. Missing Indexes on `user_progress` and `user_mistakes`
**File:** [models.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/models.py)

The two most-queried filtering columns have **no index**:

| Table | Column | Used in |
|---|---|---|
| `user_progress` | `user_id` | [get_main_dashboard](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#108-133), [complete_level](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#134-214) |
| `user_progress` | `level_id` | [complete_level](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#134-214) |
| `user_mistakes` | `user_id` | [get_active_mistakes](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#309-320), [get_redemption_quiz](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#244-276), [complete_level](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#134-214) |
| `user_mistakes` | `question_id` | [resolve_mistake](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#277-308), [complete_level](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#134-214) |
| `user_mistakes` | `is_resolved` | [get_active_mistakes](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#309-320), [get_redemption_quiz](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#244-276) |
| `refresh_tokens` | `user_id` | Cascade deletes |

**Fix:** Add `index=True` to these columns:
```python
# models.py — UserProgress
user_id = Column(pgUUID(as_uuid=True), ForeignKey(...), nullable=False, index=True)
level_id = Column(String, ForeignKey(...), nullable=False, index=True)

# models.py — UserMistake
user_id = Column(pgUUID(as_uuid=True), ForeignKey(...), nullable=False, index=True)
question_id = Column(String, ForeignKey(...), nullable=False, index=True)
is_resolved = Column(Boolean, default=False, index=True)
```

For the [(user_id, is_resolved)](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/models.py#12-37) filter used in mistakes queries, a **composite index** is even better:
```python
# models.py — add to UserMistake class
__table_args__ = (
    Index('ix_user_mistakes_user_resolved', 'user_id', 'is_resolved'),
)
```

---

### 6. [dashboard](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#108-133) Endpoint Returns ALL Progress for a User — No Pagination
**File:** [routers/users.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py) — [get_main_dashboard()](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#108-133), lines 122–126

```python
user_progress = db.query(UserProgress).filter(UserProgress.user_id == current_user.id).all()
```

This fetches the entire progress history for even the most advanced user. Consider limiting this to active/recent progress and implementing pagination as the app grows.

---

### 7. `scores` Pattern in [complete_level](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#134-214) is Fragile
**File:** [routers/users.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py), lines 170–171

```python
old_correct_answers = int((progress.score / 100) * total_questions)
```

`score` is stored as a percentage (0–100), but you're back-calculating correct answers from it using the current `total_questions` value. If a user played a level when it had 10 questions but now it has 8, the XP delta calculation is **wrong**. The `score` field doesn't represent the actual number of correct answers — it represents accuracy. Consider storing `correct_answers_count` directly in [UserProgress](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/models.py#91-105) to avoid this reconstruction.

---

### 8. Zustand `questionsCache` is Never Invalidated
**File:** [useAppStore.js](file:///c:/Users/prodr/Desktop/ECONOMIST/mobile-app/Src/store/useAppStore.js), lines 124–138

```js
if (questionsCache[levelId]) return questionsCache[levelId];
```

Questions are cached in memory (and persisted to AsyncStorage) forever. If you update questions in the backend (e.g., fix a typo, add a new question), users will get the stale version until they reinstall. Add a TTL or a version hash to invalidate the cache.

---

### 9. [onRehydrateStorage](file:///c:/Users/prodr/Desktop/ECONOMIST/mobile-app/Src/store/useAppStore.js#275-280) Fires API Call on Every App Open
**File:** [useAppStore.js](file:///c:/Users/prodr/Desktop/ECONOMIST/mobile-app/Src/store/useAppStore.js), lines 275–279

```js
onRehydrateStorage: () => (state) => {
    if (state && (!state.chapters || state.chapters.length === 0)) {
        state.fetchDashboardData();
    }
}
```

This is the correct guard (`chapters.length === 0` prevents redundant fetches). However, the condition `CHECKING_AUTH` state check inside [fetchDashboardData](file:///c:/Users/prodr/Desktop/ECONOMIST/mobile-app/Src/store/useAppStore.js#27-91) (lines 28–39) already short-circuits if chapters exist. This double-guard is good but could be simplified; it's not a bug, just noise.

---

### 10. `datetime.utcnow()` is Deprecated in Python 3.12+
**File:** [models.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/models.py) (line 29, 101, 115), [routers/auth.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/auth.py) (line 89, 108)

`datetime.utcnow()` is deprecated and will be removed. Use timezone-aware datetimes:
```python
# ❌ Old
default=datetime.utcnow
# ✅ New
from datetime import datetime, timezone
default=lambda: datetime.now(timezone.utc)
```
Also affects OTP expiry comparison in [auth.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/auth.py):
```python
# ❌ Naive comparison (line 108)
user_in_db.reset_otp_expire < datetime.utcnow()
# ✅ Aware comparison
user_in_db.reset_otp_expire < datetime.now(timezone.utc)
```

---

## 💡 SUGGESTION

### 11. XP Calculation: Move to a Background Task
**File:** [routers/users.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py) — [complete_level()](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#134-214)

Currently, [complete_level](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#134-214) does: XP calculation + mistake upserts + progress update + coins + `db.commit()` — all synchronously inside the HTTP request. As history grows, this will add latency. The user doesn't need the XP result synchronously to show the quiz summary.

**Strategy:** Use FastAPI's `BackgroundTasks` (already imported in [auth.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/auth.py)) for XP writes. Return the result immediately to the client with an optimistic "xp_gained" estimate based on the request payload.

---

### 12. `coins` Should Have an Index for the Store Feature
When you implement the App Store, you'll filter or sort users by coins. Add `index=True` to `User.coins` preemptively.

---

### 13. Schemas: `daily_quiz_count` and `last_quiz_date` Not Exposed in [UserResponse](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/schemas.py#19-34)
**File:** [schemas.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/schemas.py) — [UserResponse](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/schemas.py#19-34)

The freemium gate logic (`daily_quiz_count`, `last_quiz_date`) lives only on the server model. When the frontend needs to show "X quizzes remaining today", it will need these fields. Plan to add them to [UserResponse](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/schemas.py#19-34) before building that UI.

---

## 🔮 Future-Proofing Review

### Schema Readiness for Badges & Store

| Feature | Assessment | Action Required |
|---|---|---|
| **Badges** | [User](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/models.py#12-37) model has no `badges` relation. `total_xp` and `streak_days` are already tracked — the signal is there. | Add a `Badge` table and a `UserBadge` junction table. No changes to existing columns needed. **Zero breaking migrations.** |
| **Store Purchases** | No `StorePurchase` or `Perk` model exists. `User.coins` is the correct currency field. | Add `Perk` (items) + `UserPurchase` (transaction log) tables. The `is_premium` flag can represent the "premium subscription" perk. **Zero breaking migrations.** |
| **Roadmap (Duolingo-style)** | [Chapter](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/models.py#47-57) has `order_num` and `is_premium`. [Level](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/models.py#58-70) has `min_xp_required`. The unlock gate is already present. | Add `position_x`, `position_y` or `node_config JSON` column to [Level](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/models.py#58-70)/[Chapter](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/models.py#47-57) for 3D map coordinates. **Single migration, non-breaking.** |

### Recommended New Models (add now, cost $0)

```python
# models.py additions

class Badge(Base):
    __tablename__ = "badges"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True)
    description = Column(String)
    icon_key = Column(String)  # maps to frontend icon name
    condition_type = Column(String)  # "xp_threshold", "streak_days", "level_complete"
    condition_value = Column(Integer)

class UserBadge(Base):
    __tablename__ = "user_badges"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(pgUUID(as_uuid=True), ForeignKey("user_profile.id", ondelete="CASCADE"), index=True)
    badge_id = Column(String, ForeignKey("badges.id"), index=True)
    earned_at = Column(DateTime(timezone=True), server_default=func.now())

class StorePerk(Base):
    __tablename__ = "store_perks"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    description = Column(String)
    cost_coins = Column(Integer, nullable=False)
    perk_type = Column(String)  # "cosmetic", "gameplay", "premium_unlock"
    icon_key = Column(String)

class UserPurchase(Base):
    __tablename__ = "user_purchases"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(pgUUID(as_uuid=True), ForeignKey("user_profile.id", ondelete="CASCADE"), index=True)
    perk_id = Column(String, ForeignKey("store_perks.id"), index=True)
    purchased_at = Column(DateTime(timezone=True), server_default=func.now())
    coins_spent = Column(Integer, nullable=False)
```

---

## Summary Prioritization Table

| # | Issue | Urgency | Est. Effort |
|---|---|---|---|
| 2 | N+1 in [complete_level](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#134-214) mistake loop | 🔴 CRITICAL | 30 min |
| 3 | Missing index on `RefreshToken.token` | 🔴 CRITICAL | 5 min |
| 4 | Leaderboard: no caching | 🔴 CRITICAL | 2 hrs (Redis) / 30 min (TTL cache) |
| 1 | Sync SQLAlchemy blocking event loop | 🔴 CRITICAL | 1–3 days (async migration) |
| 5 | Missing indexes on progress/mistakes | ⚠️ WARNING | 10 min |
| 7 | Fragile score back-calculation | ⚠️ WARNING | 2 hrs |
| 10 | `datetime.utcnow()` deprecation | ⚠️ WARNING | 30 min |
| 8 | `questionsCache` never invalidated | ⚠️ WARNING | 1 hr |
| 11 | XP calc blocking request | 💡 SUGGESTION | 1 hr |
| 12 | `coins` index for Store | 💡 SUGGESTION | 5 min |
