# 🏗️ Architectural Design Document — Economist App
### Enterprise Milestones: Stripe · OAuth 2.0 · AI Tutor · Admin Panel

> **Audience:** Principal/Staff level review
> **Stack:** FastAPI + SQLAlchemy (sync→async) + PostgreSQL · React Native (Expo) + Zustand
> **Date:** 2026-03-30

---

## Table of Contents
1. [Implementation Roadmap (Order Matters)](#roadmap)
2. [Database Schema Evolution](#schema)
3. [Backend Architecture & Modularity](#backend)
4. [Infrastructure & Performance Bottlenecks](#infra)
5. [Feature Deep-Dives](#features)

---

## D. Implementation Roadmap — Order Matters {#roadmap}

> The sequence is designed so each milestone **does not break** the one before it.

```
Phase 1 ──────────── Phase 2 ──────────── Phase 3 ──────────── Phase 4
Backend RBAC &        OAuth 2.0            Stripe                AI Tutor
Admin Panel           (Google/Apple)       Subscriptions         (LLM + WS)
────────────          ─────────────        ──────────────        ──────────
Weeks 1–3             Weeks 4–6            Weeks 7–10            Weeks 11–16
```

**Why this order?**

| Phase | Rationale |
|---|---|
| **1 → Admin Panel first** | You need a backoffice to manage content and users before monetisation. RBAC also protects the webhook endpoints you'll add in Phase 3. |
| **2 → OAuth before Stripe** | The Stripe Customer object is linked to a verified user identity. OAuth solidifies that identity first. Account-merge logic must exist before a Stripe customer is created, or you'll end up with orphaned Stripe customers. |
| **3 → Stripe after Auth** | Webhooks fire against a User record. Both the user record (Phase 1) and the auth identity (Phase 2) must be stable before you attach payment state. |
| **4 → AI Tutor last** | Highest complexity, requires the async migration (triggered by Phase 1/2 scale concerns), Redis (added for Celery in Phase 3), and a stable user identity. |

---

## A. Database Schema Evolution {#schema}

### Current Model Issues to Fix First

Before adding new models, fix two structural weaknesses:

1. **`User.password_hash` must become nullable** — OAuth users have no password.
2. **Add `auth_provider` + `provider_user_id`** to support multiple sign-in methods per user.

---

### New & Modified SQLAlchemy Models

```python
# ─── MODIFIED: models.py ──────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "user_profile"
    # ... (all existing columns stay) ...

    # WHY nullable=True for password_hash?
    # OAuth users (Google/Apple) have no password. A null hash means "OAuth-only account".
    # The login endpoint must check: if password_hash is None → redirect to OAuth flow.
    password_hash = Column(String, nullable=True)  # CHANGED: was nullable=False

    # Stripe integration fields
    stripe_customer_id = Column(String, unique=True, nullable=True, index=True)
    # WHY store stripe_customer_id on User?
    # Every Stripe API call (create subscription, charge) needs the Customer ID.
    # Keeping it here avoids a JOIN. It's indexed for webhook event lookup:
    # webhook fires → extract customer_id → look up user in one indexed query.

    # Relationships (add alongside existing ones)
    oauth_accounts = relationship("OAuthAccount", back_populates="user", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("CoinTransaction", back_populates="user", cascade="all, delete-orphan")
    ai_sessions = relationship("AITutorSession", back_populates="user", cascade="all, delete-orphan")
```

```python
# ─── NEW TABLE: OAuth provider accounts ───────────────────────────────────────

class OAuthAccount(Base):
    """
    One row per (user × OAuth provider) pair.

    WHY a separate table instead of columns on User?
    A user may connect BOTH Google and Apple Sign-In to the same account.
    Columns on User (google_id, apple_id) don't scale to N providers.
    This table scales to any future provider (GitHub, Microsoft, etc.) with zero migrations.

    ACCOUNT MERGE LOGIC:
    On OAuth login:
      1. Look up OAuthAccount by (provider, provider_user_id).
      2. If found → return the linked User (normal login).
      3. If NOT found → check if User.email matches.
         a. If email match → link this OAuthAccount to the existing User (merge).
         b. If no email match → create a NEW User + OAuthAccount (new registration).
    """
    __tablename__ = "oauth_accounts"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(pgUUID(as_uuid=True), ForeignKey("user_profile.id", ondelete="CASCADE"),
                     nullable=False, index=True)

    provider = Column(String, nullable=False)           # "google" | "apple" | "github"
    provider_user_id = Column(String, nullable=False)   # The sub/id from the OAuth token
    provider_email = Column(String, nullable=True)      # Email returned by provider (for merge)
    access_token = Column(String, nullable=True)        # Provider access token (optional storage)
    refresh_token = Column(String, nullable=True)       # Provider refresh token (optional)
    token_expires_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="oauth_accounts")

    __table_args__ = (
        # Composite unique: one account per (provider, user) pair
        Index("ix_oauth_provider_user", "provider", "provider_user_id", unique=True),
    )
```

```python
# ─── NEW TABLE: Stripe Subscriptions ─────────────────────────────────────────

class Subscription(Base):
    """
    Mirrors a Stripe Subscription object in our DB for fast local reads.

    WHY not just query Stripe's API every time?
    Stripe API calls add 200–500ms latency. Every request that checks `is_premium`
    would incur this cost. We mirror the key state locally and keep it in sync via webhooks.

    WEBHOOK SYNC EVENTS (update this table on):
      - customer.subscription.created   → insert row
      - customer.subscription.updated   → update status, current_period_end
      - customer.subscription.deleted   → set status='canceled'
      - invoice.payment_succeeded       → extend current_period_end
      - invoice.payment_failed          → set status='past_due', trigger dunning email
    """
    __tablename__ = "subscriptions"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(pgUUID(as_uuid=True), ForeignKey("user_profile.id", ondelete="CASCADE"),
                     nullable=False, index=True)

    stripe_subscription_id = Column(String, unique=True, nullable=False, index=True)
    stripe_price_id = Column(String, nullable=False)   # The Stripe Price (plan) ID
    status = Column(String, nullable=False)             # "active"|"past_due"|"canceled"|"trialing"
    current_period_start = Column(DateTime(timezone=True), nullable=False)
    current_period_end = Column(DateTime(timezone=True), nullable=False)
    cancel_at_period_end = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="subscriptions")
```

```python
# ─── NEW TABLE: Coin Transactions (Ledger Pattern) ────────────────────────────

class CoinTransaction(Base):
    """
    Immutable ledger of all coin changes. NEVER update or delete rows.

    WHY a ledger instead of just incrementing User.coins?
    `User.coins` is a derived value (sum of the ledger). The ledger gives you:
    - Full audit trail (required for any dispute resolution with users)
    - Ability to reconstruct `User.coins` if it ever gets corrupted
    - Analytics: "how many coins are earned per level vs. spent in store?"

    SOURCES: "level_complete" | "resolve_mistake" | "store_purchase" | "stripe_purchase"
            | "admin_grant" | "refund"
    """
    __tablename__ = "coin_transactions"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(pgUUID(as_uuid=True), ForeignKey("user_profile.id", ondelete="CASCADE"),
                     nullable=False, index=True)

    amount = Column(Integer, nullable=False)        # Positive = earn, Negative = spend
    source = Column(String, nullable=False)         # What triggered this transaction
    source_ref_id = Column(String, nullable=True)   # e.g., level_id, stripe_payment_intent_id
    balance_after = Column(Integer, nullable=False) # Snapshot of User.coins after this tx
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="transactions")
```

```python
# ─── NEW TABLE: AI Tutor Sessions ─────────────────────────────────────────────

class AITutorSession(Base):
    """
    Container for one AI Tutor conversation thread.

    WHY separate Session + Message tables (not storing messages in a JSON column)?
    - JSON column: fast to write, but impossible to query ("find all sessions
      where the user asked about 'GDP'"), and the column grows unbounded.
    - Separate table: queryable, allows pgvector embeddings per message for semantic
      search, and enables per-message cost tracking.

    CONTEXT MANAGEMENT STRATEGY:
    An LLM context window has token limits. On each new message:
    1. Fetch the last N messages from AITutorMessage for this session.
    2. If total token count approaches the limit, summarise older messages using the
       LLM itself (map-reduce summarisation) and store the summary in `context_summary`.
    3. Next call uses: system_prompt + context_summary + last N messages.
    This avoids passing the entire history on every call.
    """
    __tablename__ = "ai_tutor_sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(pgUUID(as_uuid=True), ForeignKey("user_profile.id", ondelete="CASCADE"),
                     nullable=False, index=True)
    level_id = Column(String, ForeignKey("levels.id", ondelete="SET NULL"), nullable=True)

    context_summary = Column(String, nullable=True)  # LLM-compressed history for long sessions
    total_tokens_used = Column(Integer, default=0)   # For cost monitoring and user quotas
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_message_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="ai_sessions")
    messages = relationship("AITutorMessage", back_populates="session", cascade="all, delete-orphan",
                            order_by="AITutorMessage.created_at")


class AITutorMessage(Base):
    """One message in an AI Tutor conversation. Append-only."""
    __tablename__ = "ai_tutor_messages"

    id = Column(String, primary_key=True, default=generate_uuid)
    session_id = Column(String, ForeignKey("ai_tutor_sessions.id", ondelete="CASCADE"),
                        nullable=False, index=True)

    role = Column(String, nullable=False)     # "user" | "assistant" | "system"
    content = Column(String, nullable=False)  # The message text
    tokens_used = Column(Integer, nullable=True)  # Tokens for THIS message (from API response)
    # Optional: embedding vector for semantic search (requires pgvector extension)
    # embedding = Column(Vector(1536), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("AITutorSession", back_populates="messages")
```

---

### Schema Migration Map

```
CURRENT STATE                    PHASE 1          PHASE 2          PHASE 3          PHASE 4
─────────────────────            ───────────       ───────          ───────          ───────
User                   ───────►  + role checks     + password      + stripe_        (no change)
  .total_xp                        for admin         _hash →         customer_id
  .coins                           endpoints         nullable
  .streak_days                                     OAuthAccount    Subscription
RefreshToken                                       (NEW)           (NEW)
Chapter/Level                                                      CoinTransaction  AITutorSession
Question                                                           (NEW)            (NEW)
UserProgress                                                                        AITutorMessage
UserMistake                                                                         (NEW)
```

---

## B. Backend Architecture & Modularity {#backend}

### The Problem: Monolith [main.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/main.py)

Your current structure:
```
BACKEND/
  main.py                ← Everything registered here
  routers/
    auth.py
    users.py             ← 344+ lines, doing everything
```

### Target: Namespaced API Architecture

```
BACKEND/
  main.py                ← Mounts two separate FastAPI sub-applications
  core/
    config.py            ← (move from root)
    db.py                ← (move from root)
    security.py          ← (move from root)
    dependencies.py      ← Shared FastAPI Depends() functions
  models/
    __init__.py
    user.py              ← User, RefreshToken, OAuthAccount
    content.py           ← Chapter, Level, Question
    progress.py          ← UserProgress, UserMistake
    monetisation.py      ← Subscription, CoinTransaction
    ai_tutor.py          ← AITutorSession, AITutorMessage
  schemas/
    auth.py
    users.py
    content.py
    monetisation.py
    ai_tutor.py
  api/
    mobile/              ← The current app's API (v1)
      __init__.py        ← Creates mobile_router = APIRouter(prefix="/api/v1")
      auth.py
      users.py
      quiz.py
      leaderboard.py
      mistakes.py
      ai_tutor.py        ← New
      stripe_checkout.py ← New
    admin/               ← Separate namespace, separate auth
      __init__.py        ← Creates admin_router = APIRouter(prefix="/admin")
      users.py           ← CRUD for all users
      content.py         ← CRUD for Chapters, Levels, Questions
      analytics.py       ← Aggregate stats
      webhooks.py        ← Stripe webhooks (NOT under /admin prefix — see below)
  services/
    stripe_service.py    ← All Stripe API calls isolated here
    openai_service.py    ← All OpenAI API calls isolated here
    email_service.py     ← (move from root)
```

### Two Sub-Applications in [main.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/main.py)

```python
# main.py
from fastapi import FastAPI
from api.mobile import mobile_router
from api.admin import admin_router

# The public mobile API
mobile_app = FastAPI(title="Economist Mobile API", version="1.0")
mobile_app.include_router(mobile_router)

# The admin API — separate docs, separate auth middleware
admin_app = FastAPI(title="Economist Admin", docs_url="/admin/docs")
admin_app.include_router(admin_router)

# Root app mounts both
app = FastAPI()
app.mount("/api/v1", mobile_app)
app.mount("/admin", admin_app)

# Stripe webhooks CANNOT be under /admin — they have a different auth mechanism
# (Stripe-Signature header, not JWT Bearer). Mount separately.
app.include_router(webhook_router, prefix="/webhooks")
```

### RBAC: Role-Based Access Control

```python
# core/dependencies.py

def require_role(*allowed_roles: str):
    """
    Dependency factory for role-gated endpoints.

    Usage in admin routes:
        @router.delete("/users/{user_id}")
        def delete_user(
            user_id: str,
            current_user: User = Depends(require_role("admin", "superadmin"))
        ):
            ...

    WHY a factory (require_role()) instead of a fixed `require_admin` dependency?
    Granularity. Some admin endpoints are safe for "content_editor" role
    (update a question), others require "superadmin" (delete a user).
    A factory lets you express this at the route level without writing a new
    dependency function for each role combination.
    """
    def _dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {allowed_roles}"
            )
        return current_user
    return _dependency

# Admin panel middleware: completely separate SECRET_KEY for admin JWTs
# WHY? If the mobile app's SECRET_KEY is ever leaked (e.g., in a client decompile),
# it cannot be used to forge admin tokens. Two key domains = two blast radii.
ADMIN_SECRET_KEY = os.getenv("ADMIN_SECRET_KEY")  # Different from SECRET_KEY
```

---

## C. Infrastructure & Performance Bottlenecks {#infra}

### Architecture Risk Map

```
                     ┌─────────────────────────────────────────────────────┐
                     │                 RISK MATRIX                          │
                     ├─────────────────┬──────────────┬───────────────────┤
  Feature            │ Primary Risk    │ Peak Load    │ Mitigation        │
  ─────────────────  │ ───────────────│ ────────────── │ ─────────────────│
  Stripe Webhooks    │ Duplicate       │ Burst (sales)│ Idempotency keys  │
                     │ processing      │              │ + DB unique index  │
  AI Tutor           │ Event loop      │ Sustained    │ Async + streaming  │
                     │ blocking (slow  │ (per session)│ + token quotas    │
                     │ OpenAI calls)   │              │                   │
  Leaderboard        │ DB hot row      │ All users    │ Redis sorted set  │
                     │ (ORDER BY xp)   │ opening app  │                   │
  complete_level     │ XP calc latency │ Medium       │ BackgroundTasks   │
                     │ in request      │              │ → Celery          │
                     └─────────────────┴──────────────┴───────────────────┘
```

### Should You Use Celery/Redis?

**Yes. After Phase 3 (Stripe), it becomes non-negotiable.** Here's the decision tree:

```
Does the operation need to run after the HTTP response is sent?
  ├── YES → Can it fail and be retried safely?
  │           ├── YES → Use Celery + Redis (reliable, retryable, observable)
  │           └── NO  → Use FastAPI BackgroundTasks (fire-and-forget, no retry)
  └── NO  → Run it in the request handler (synchronous)
```

| Task | Tool | Why |
|---|---|---|
| Send verification email | `BackgroundTasks` | Already done. No retry needed — user can request resend. |
| Process Stripe webhook | **Celery** | MUST be idempotent + retryable. Payment processing cannot silently fail. |
| Trigger badge check after XP update | **Celery** | Non-blocking, retryable, scales independently. |
| Cache leaderboard | **Redis** | Sorted set for O(log N) rank updates. |
| AI Tutor response | **Async streaming** | Cannot be Celery (streaming). Needs async FastAPI + SSE. |
| Send dunning email (failed payment) | **Celery** + scheduled beat | Retry with exponential backoff. |

### Full Infrastructure Stack (Phase 4 Target)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  React Native (Expo)                                                          │
│  Zustand + Axios (REST) + EventSource (SSE for AI streaming)                 │
└────────────────────────────┬─────────────────────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼─────────────────────────────────────────────────┐
│  Nginx / Caddy (reverse proxy + TLS termination)                              │
└────────┬────────────────────────────────────────────────┬────────────────────┘
         │ /api/v1  /admin  /webhooks                     │ /ai/stream (SSE)
┌────────▼────────────────────────────┐   ┌───────────────▼──────────────────┐
│  FastAPI (Uvicorn, 4 workers)        │   │  FastAPI async worker (1 worker) │
│  Sync routes: auth, quiz, profile   │   │  Async routes: AI Tutor SSE      │
│  — SQLAlchemy sync + psycopg2       │   │  — asyncpg + AsyncSession        │
└────┬───────────────┬───────────────┘   └──────────────────────────────────┘
     │               │
┌────▼────┐    ┌─────▼──────────────┐
│PostgreSQL│    │ Redis             │
│  Main DB │    │  - Celery broker  │
│          │    │  - Leaderboard    │
└──────────┘    │    sorted set     │
                │  - Rate limiting  │
                └─────┬─────────────┘
                      │
              ┌───────▼───────┐
              │ Celery Workers│
              │ - Stripe hook │
              │ - Badge check │
              │ - Email       │
              └───────────────┘
```

### Stripe Webhook Security (Critical)

```python
# api/webhooks.py

@router.post("/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    WHY raw Request instead of a Pydantic body?
    Stripe signs the raw request body bytes. If FastAPI parses the body into JSON first,
    the bytes change (whitespace normalisation, key ordering), and the signature
    verification FAILS. We must read raw bytes before any parsing.
    """
    payload = await request.body()  # Raw bytes — do NOT parse first
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # IDEMPOTENCY: Stripe retries webhooks on failure. Store the event ID and
    # skip processing if already seen. Without this, a subscription.updated event
    # could credit coins twice.
    existing = await db.execute(
        select(ProcessedWebhookEvent).where(ProcessedWebhookEvent.stripe_event_id == event["id"])
    )
    if existing.scalar_one_or_none():
        return {"status": "already_processed"}

    # Dispatch to Celery — return 200 immediately, process asynchronously.
    # Stripe expects a 200 within 30 seconds or it will retry.
    process_stripe_event.delay(event["id"], event["type"], event["data"])

    # Record event ID BEFORE returning (idempotency lock)
    db.add(ProcessedWebhookEvent(stripe_event_id=event["id"]))
    await db.commit()

    return {"status": "queued"}
```

---

## E. Feature Deep-Dives {#features}

### 1. OAuth 2.0 — Google & Apple Sign-In

**Flow:**
```
Mobile App                    FastAPI Backend              Google/Apple
─────────                     ───────────────              ────────────
1. User taps "Sign in         
   with Google"               
2. Expo AuthSession  ──────►  (skipped — handled client-side)
   gets ID token              
3. Send ID token    ──────►  POST /api/v1/auth/oauth
   to backend                 4. Verify token with Google's
                                 public keys (no redirect needed)
                              5. Run account-merge logic (see schema)
                              6. Return JWT pair  ◄──────────────────
```

**Why verify server-side?**
The mobile app receives an `id_token` from Google. **Never trust it client-side only.** Send it to your backend, which verifies it against Google's public keys (`google-auth` library). Only then issue your own JWT. This prevents token forgery.

**Apple Sign-In special case:**
Apple only provides the user's email on the VERY FIRST sign-in. After that, [email](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py#106-196) comes back empty. You must store it in `OAuthAccount.provider_email` on the first call. Never assume Apple will give you the email again.

---

### 2. Stripe — Subscriptions & Coin Purchases

**Two purchase flows:**

```
SUBSCRIPTION FLOW:                    ONE-OFF COIN PURCHASE FLOW:
─────────────────                     ──────────────────────────
Mobile → POST /stripe/create-checkout-session
FastAPI → stripe.checkout.Session.create(mode="subscription"|"payment")
Stripe → returns session_url (or PaymentSheet token for native)
Mobile → open Stripe PaymentSheet (native SDK)
Stripe → fires webhook on success
Celery → processes webhook → updates Subscription table / credits coins
```

**Why use Stripe Checkout / PaymentSheet instead of a custom card form?**
PCI-DSS compliance. Card data never touches your server. Stripe (a PCI Level 1 provider) handles it. Building a custom card form exposes you to PCI audit scope — months of work and thousands of dollars.

---

### 3. AI Tutor — Streaming Architecture

**SSE vs WebSockets decision:**

| | Server-Sent Events (SSE) | WebSockets |
|---|---|---|
| Direction | Server → Client only | Bidirectional |
| HTTP compatibility | Natively HTTP/1.1 | Requires upgrade |
| Expo support | `EventSource` polyfill | `react-native-websocket` |
| Complexity | Low | Medium |
| **Use for AI Tutor?** | **YES** | Overkill — user sends one message, gets one stream back |

**FastAPI SSE Implementation:**
```python
# api/mobile/ai_tutor.py (async router)

from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI

client = AsyncOpenAI()

@router.post("/ai/chat/{session_id}")
async def ai_chat(
    session_id: str,
    message: AIChatRequest,
    current_user: User = Depends(get_current_user_async),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Streams the AI Tutor's response as Server-Sent Events.
    
    WHY async here specifically?
    The OpenAI streaming call holds an HTTP connection open for 5–30 seconds.
    With sync FastAPI (threading model), this blocks a thread for the entire duration.
    At 100 concurrent AI sessions, all 40 threads are exhausted → app freezes.
    Async releases the thread back to the event loop WHILE waiting for each token chunk.
    """
    async def token_stream():
        stream = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=build_context(session_id, message.text),
            stream=True,
        )
        full_response = ""
        async for chunk in stream:
            token = chunk.choices[0].delta.content or ""
            full_response += token
            yield f"data: {json.dumps({'token': token})}\n\n"

        # After stream ends, persist the full message
        await save_message(db, session_id, "assistant", full_response)
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(token_stream(), media_type="text/event-stream")
```

**pgvector vs Standard Relational for Context Storage:**

| Approach | When to Use | Cost |
|---|---|---|
| **Standard relational** (our design) | Fetching last N messages by timestamp | Low |
| **pgvector** | "Find past conversations where user struggled with GDP" (semantic search) | Medium — requires enabling `pgvector` extension |

**Recommendation:** Start with standard relational (`AITutorMessage` table, fetch by `created_at`). Add `pgvector` embeddings as a Phase 4b enhancement only if you build a "search your tutor history" feature.

---

### 4. Admin Panel — Next.js Backoffice

**Architecture decision: monorepo vs separate repo?**

Use a **separate repository** (`economist-admin`). Reasons:
- Different deployment pipeline (admin deploys rarely vs. app deploys often)
- Different access control (admin repo access ≠ mobile app repo access)
- Prevents accidental exposure of admin-only code in the mobile bundle

**Admin API authentication:**
```
Admin Panel (browser) → POST /admin/auth/login → issues ADMIN_JWT (signed with ADMIN_SECRET_KEY)
All /admin/* routes → Depends(require_role("admin", "superadmin")) using ADMIN_SECRET_KEY
```

This uses the **same `/admin` FastAPI sub-app** but a different secret key, so:
- A leaked mobile JWT cannot be used to hit admin endpoints
- A leaked admin JWT cannot be used to impersonate mobile users

**RBAC roles to implement:**

| Role | Permissions |
|---|---|
| [user](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/security.py#78-127) | Mobile app only |
| `content_editor` | CRUD on Chapters/Levels/Questions |
| `support_agent` | Read users, grant coins, view transactions |
| `admin` | All above + manage roles, view analytics |
| `superadmin` | All above + delete users, manage admins |

---

## Summary Checklist

### Phase 1 — Admin Panel & RBAC
- [ ] Restructure `BACKEND/` folder to `api/mobile/` + `api/admin/` + `core/` + `services/`
- [ ] Split [users.py](file:///c:/Users/prodr/Desktop/ECONOMIST/BACKEND/routers/users.py) router into `quiz.py`, `mistakes.py`, `leaderboard.py`, `profile.py`
- [ ] Implement `require_role()` dependency factory
- [ ] Add `ADMIN_SECRET_KEY` env var + separate admin JWT issuance
- [ ] Build `api/admin/content.py` (CRUD for Chapters/Levels/Questions)
- [ ] Init Next.js admin panel with admin login screen

### Phase 2 — OAuth 2.0
- [ ] Make `User.password_hash` nullable
- [ ] Create `OAuthAccount` table + migration
- [ ] Add `POST /api/v1/auth/oauth` endpoint with merge logic
- [ ] Install `google-auth` library for token verification
- [ ] Handle Apple Sign-In one-time email provision

### Phase 3 — Stripe
- [ ] Add `User.stripe_customer_id` column + migration
- [ ] Create `Subscription`, `CoinTransaction` tables + migration
- [ ] Install `stripe` Python library
- [ ] Add `services/stripe_service.py`
- [ ] Implement `POST /webhooks/stripe` with raw body + signature verification
- [ ] Set up Redis + Celery workers
- [ ] Implement idempotency table (`ProcessedWebhookEvent`)
- [ ] Wire `customer.subscription.*` webhook events

### Phase 4 — AI Tutor
- [ ] Migrate AI Tutor routes to async SQLAlchemy (`AsyncSession`)
- [ ] Create `AITutorSession` + `AITutorMessage` tables + migration
- [ ] Add `services/openai_service.py` with context management
- [ ] Implement SSE streaming endpoint
- [ ] Add per-user token quota tracking (`AITutorSession.total_tokens_used`)
- [ ] (Optional Phase 4b) Enable `pgvector` extension, add embedding column
