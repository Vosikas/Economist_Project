from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database.db import get_db
from database.models import User
from schemas import UserResponse
from core.dependencies import require_role

router = APIRouter()

@router.get("/", response_model=List[UserResponse])
def get_all_users(
    skip: int = 0, 
    limit: int = 50, 
    db: Session = Depends(get_db),
    # RBAC: Μόνο αυτοί οι 3 ρόλοι έχουν πρόσβαση!
    admin: User = Depends(require_role("support_agent", "admin", "superadmin"))
):
    """
    [ADMIN ONLY] Fetch a paginated list of all registered users.
    """
    users = db.query(User).order_by(User.created_at.desc()).offset(skip).limit(limit).all()
    return users

@router.post("/{user_id}/grant-coins")
def grant_coins_to_user(
    user_id: str,
    amount: int,
    db: Session = Depends(get_db),
    # RBAC: Το support δεν μπορεί να δώσει νομίσματα, μόνο οι admins!
    admin: User = Depends(require_role("admin", "superadmin"))
):
    """
    [ADMIN ONLY] Grant or remove coins from a specific user.
    """
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Ο χρήστης δεν βρέθηκε.")
    
    target_user.coins += amount
    db.commit()
    return {"message": f"Επιτυχής προσθήκη {amount} νομισμάτων στον χρήστη {target_user.username}."}