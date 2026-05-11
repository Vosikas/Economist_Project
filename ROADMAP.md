# 🗺️ Economist App — Action Roadmap

## ✅ Τι έγινε ήδη (δεν χρειάζεται να κάνεις τίποτα)

| Αρχείο | Τι άλλαξε |
|---|---|
| `BACKEND/models.py` | Indexes σε όλες τις κρίσιμες στήλες + composite indexes + timezone fix |
| `BACKEND/schemas.py` | Docstrings, εξήγηση alias pattern |
| `BACKEND/db.py` | Docstrings, async migration guide |
| `BACKEND/routers/auth.py` | Docstrings, timezone fix |
| `BACKEND/routers/users.py` | **🔴 N+1 bug διορθώθηκε** στο `complete_level` |
| `mobile-app/Src/store/useAppStore.js` | JSDoc σε κάθε action |

---

## 🚨 Τι πρέπει να κάνεις — Κατά σειρά προτεραιότητας

### 🔴 ΚΡΙΣΙΜΟ — Κάνε αυτά ΠΡΩΤΑ

---

#### 1. ⚡ Leaderboard Cache (30 λεπτά)

**Πρόβλημα:** Κάθε φορά που ανοίγει το Leaderboard screen, κάνει full table sort στη βάση.

**Λύση:**
```bash
# Στο BACKEND/
pip install cachetools
```

Πες μου **"φτιάξε το leaderboard cache"** και το γράφω αμέσως.

---

#### 2. 🏗️ Backend Restructure & RBAC (1–2 εβδομάδες)

**Πρόβλημα:** Το `users.py` είναι 400+ γραμμές και κάνει τα πάντα. Πριν βάλεις Admin Panel, Stripe ή AI Tutor, χρειάζεσαι καθαρή δομή.

**Νέα δομή:**
```
BACKEND/
  api/
    mobile/         ← Το τωρινό app
      auth.py
      quiz.py       ← Από users.py
      mistakes.py   ← Από users.py
      leaderboard.py← Από users.py
    admin/          ← Νέο
      content.py    ← CRUD chapters/levels
      users.py      ← Manage users
  core/
    config.py       ← Μετακίνηση
    db.py           ← Μετακίνηση
    security.py     ← Μετακίνηση
    dependencies.py ← RBAC require_role()
  services/
    stripe_service.py
    openai_service.py
```

Πες μου **"ξεκίνα Phase 1"** και αρχίζουμε.

---

#### 3. ⚠️ Quiz Cache Invalidation (1 ώρα)

**Πρόβλημα:** Αν αλλάξεις ερωτήσεις στη βάση, οι χρήστες βλέπουν το παλιό περιεχόμενο μέχρι να κάνουν reinstall.

**Λύση:** Βάλε version timestamp στο cache key στο `useAppStore.js`.

Πες μου **"φτιάξε το quiz cache"** και το γράφω.

---

#### 4. 🔧 `UserProgress.score` Fragility (2 ώρες)

**Πρόβλημα:** Αν αλλάξεις το μέγεθος του quiz (π.χ. από 5 σε 8 ερωτήσεις), ο υπολογισμός XP delta στο `complete_level` βγάζει λάθος αποτελέσματα γιατί ανακατασκευάζει τις σωστές απαντήσεις από ποσοστό.

**Λύση:** Πρόσθεσε `correct_answers_count INTEGER` column στο `UserProgress`.

Πες μου **"φτιάξε το score column"** και το κάνω.

---

### 🟡 ΜΕΣΟΠΡΟΘΕΣΜΑ — Για το επόμενο μήνα

---

#### 5. 🔐 OAuth 2.0 — Google & Apple Sign-In (1 εβδομάδα)

Απαιτεί:
- Νέο `OAuthAccount` table στη βάση
- `User.password_hash → nullable`
- `POST /auth/oauth` endpoint
- Merge logic αν το email υπάρχει ήδη

Πες **"ξεκίνα Phase 2 OAuth"**.

---

#### 6. 💳 Stripe Subscriptions & Coins (2 εβδομάδες)

Απαιτεί:
- `User.stripe_customer_id` column
- Νέα tables: `Subscription`, `CoinTransaction` (ledger)
- Webhook endpoint με signature verification
- Redis + Celery για background processing

Πες **"ξεκίνα Phase 3 Stripe"**.

---

#### 7. 🤖 AI Tutor — LLM Streaming (2–3 εβδομάδες)

Απαιτεί:
- Async SQLAlchemy migration (μεγαλύτερη αλλαγή)
- Νέα tables: `AITutorSession`, `AITutorMessage`
- SSE streaming endpoint (FastAPI)
- `EventSource` στο React Native

Πες **"ξεκίνα Phase 4 AI Tutor"**.

---

### 🟢 ΜΑΚΡΟΠΡΟΘΕΣΜΑ — Όταν είσαι έτοιμος

#### 8. 🖥️ Admin Panel — Next.js Backoffice

Ξεχωριστό repo, ξεχωριστό `ADMIN_SECRET_KEY`, Next.js frontend.

Πες **"ξεκίνα Admin Panel"**.

---

## 📚 Αρχεία Αναφοράς

| Έγγραφο | Περιεχόμενο |
|---|---|
| [`scalability_audit.md`](.gemini/antigravity/brain/6d6f4c27-4e81-4f93-99cd-c2ae89b89f60/scalability_audit.md) | Πλήρης audit με κώδικα λύσεων |
| [`architectural_design.md`](.gemini/antigravity/brain/6d6f4c27-4e81-4f93-99cd-c2ae89b89f60/architectural_design.md) | Schema evolution + infrastructure design |

---

## 🎯 Σύνοψη — Επόμενα 3 βήματα

```
[ ] 1. pip install cachetools → "φτιάξε το leaderboard cache"
[ ] 2. Αποφάσισε αν θέλεις να ξεκινήσεις Phase 1 (restructure)
[ ] 3. "φτιάξε το quiz cache" για να προστατέψεις το questionsCache
```
