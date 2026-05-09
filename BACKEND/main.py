"""
FILE: main.py
PURPOSE: FastAPI application entry point — creates tables on startup, registers all routers.

ROUTER MAP:
    Mobile API (no prefix — backward compatible with existing React Native frontend):
        /signup, /login, /logout, /refresh, /forgot-password, /reset-password — auth.py
        /verify-email/                                                         — auth.py
        /dashboard                                                             — dashboard.py
        /me (DELETE)                                                           — profile.py
        /levels/{id}/questions, /levels/complete                              — quiz.py
        /mistakes/active, /mistakes/quiz, /mistakes/resolve                   — mistakes.py
        /leaderboard                                                           — leaderboard.py
        /badges, /badges/definitions                                           — badges.py

    Admin API (/admin prefix):
        POST /admin/login                                                      — admin/auth.py
        POST /admin/chapters, /admin/questions                                 — admin/content.py
        GET  /admin/users, /admin/users/{id}, ...                              — admin/users.py

CONNECTIONS:
    - database/db.py: create_tables() — auto-creates tables from models on startup
    - All api/mobile/* and api/admin/* routers
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from database.db import create_tables
from core.config import ALLOWED_ORIGINS


# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Auto-create all tables defined in models.py on startup.
# WHY here and not in a migration tool?
# For the current scale, create_all() is safe and fast. When we add Alembic (Phase 3+),
# this call will become a no-op (tables already exist) and can be removed.
try:
    create_tables()
    logger.info("✅ Database tables verified/created.")
except Exception as e:
    logger.error(f"❌ Database error on startup: {e}")

app = FastAPI(
    title="Economist App API",
    description="Mobile + Admin API for the Economist learning app.",
    version="2.0.0",
)

# SECURITY: Origins are explicitly allowlisted via the ALLOWED_ORIGINS environment
# variable (set in .env). The wildcard "*" is intentionally forbidden here because
# combining allow_origins=["*"] with allow_credentials=True violates the CORS spec
# and is rejected by all modern browsers.
# Development default (set in config.py): http://localhost:8081
# Production example .env: ALLOWED_ORIGINS=https://admin.yourdomain.com
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ─── Mobile Routers ───────────────────────────────────────────────────────────
# No URL prefix — all endpoints stay backward-compatible with the existing frontend.

from api.mobile import auth, daily_quiz, dashboard, profile, quiz, mistakes, leaderboard, badges
from api import webhooks
from services import ai_tutor

app.include_router(auth.router)                         # /signup, /login, /logout, /refresh, ...
app.include_router(dashboard.router)                    # /dashboard
app.include_router(profile.router)                      # /me (DELETE)
app.include_router(quiz.router)                         # /levels/{id}/questions, /levels/complete
app.include_router(mistakes.router, prefix="/mistakes") # ← ΔΙΟΡΘΩΣΗ: /mistakes/active, /quiz, /resolve
app.include_router(leaderboard.router)                  # /leaderboard
app.include_router(badges.router)                       # /badges, /badges/definitions
app.include_router(daily_quiz.router)                    # /daily-quiz/today, /daily-quiz/submit
app.include_router(ai_tutor.router)                    # /ai-tutor/grade
app.include_router(webhooks.router)                     # /webhooks/revenuecat

# ─── Admin Routers ────────────────────────────────────────────────────────────
# All admin endpoints are prefixed with /admin for clear namespace separation.
# Admin routes authenticate with ADMIN_SECRET_KEY (different from mobile SECRET_KEY).

from api.admin import auth as admin_auth, users as admin_users, content as admin_content

app.include_router(admin_auth.router, prefix="/admin")      # /admin/login
app.include_router(admin_users.router, prefix="/admin")     # /admin/users/*
app.include_router(admin_content.router, prefix="/admin")   # /admin/chapters, /admin/questions


# ─── Health Check ─────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def root():
    """Simple health check — returns 200 if the server is running."""
    return {
        "status": "success",
        "message": "Phase 2 Gamification Active",
        "docs": "/docs",
        "admin_docs": "/docs#/Admin",
    }
