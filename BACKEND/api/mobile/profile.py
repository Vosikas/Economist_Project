"""
FILE: api/mobile/profile.py
PURPOSE: User account management — owns only the DELETE /me endpoint.

ENDPOINTS:
    DELETE /me — Permanently delete the authenticated user's account and all their data.

NOTE ON ROUTING SPLIT:
    - /signup, /verify-email/ → api/mobile/auth.py     (canonical, correct imports)
    - /dashboard              → api/mobile/dashboard.py (canonical, registered in main.py)

    Previous versions of this file incorrectly duplicated those endpoints with a
    broken import path (from emails_service instead of from services.emails_service).
    Those duplicates have been removed. auth.py and dashboard.py are the sources of truth.

CONNECTIONS:
    - models.py: User (cascade='all, delete-orphan' removes Progress, Mistakes, Badges)
    - core/security.py: get_current_user (validates mobile JWT)
    - database/db.py: get_db (SQLAlchemy session)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import User
from core.security import get_current_user

router = APIRouter(tags=["Mobile — Profile"])


@router.delete("/me", status_code=status.HTTP_200_OK)
def delete_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Permanently deletes the authenticated user's account and all their data.

    WHY no explicit child deletion?
        The User model defines cascade='all, delete-orphan' on progress, mistakes,
        and badges relationships. SQLAlchemy cascades the delete automatically —
        no need to manually delete child rows.

    Atomicity: If the delete raises an exception, db.rollback() ensures the account
    is NOT partially deleted. The user can retry.

    Returns:
        dict: Confirmation message.
    Raises:
        500: Unexpected DB error (account NOT deleted in this case).
    """
    try:
        db.delete(current_user)
        db.commit()
        return {"message": "Ο λογαριασμός και όλα τα δεδομένα διαγράφηκαν επιτυχώς."}
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Προέκυψε σφάλμα κατά τη διαγραφή του λογαριασμού.",
        )
@router.post("/users/upgrade-premium")
def upgrade_user_to_premium(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Μετατρέπει τον συνδεδεμένο χρήστη σε Premium."""
    try:
        # Αλλάζουμε το status στη βάση
        current_user.is_premium = True
        db.commit()
        db.refresh(current_user)
        return {"message": "Success", "is_premium": current_user.is_premium}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Πρόβλημα κατά την αναβάθμιση.")
