from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import User
from core.dependencies import require_role

router = APIRouter()

@router.post("/chapters")
def create_chapter(
    # payload: ChapterCreateRequest, # Θα το φτιάξουμε όταν έρθει η ώρα του Admin Panel
    db: Session = Depends(get_db),
    # RBAC: Οι content editors μπορούν να φτιάξουν περιεχόμενο!
    admin: User = Depends(require_role("content_editor", "admin", "superadmin"))
):
    """
    [ADMIN ONLY] Create a new Chapter in the roadmap.
    """
    return {"message": "Το endpoint για δημιουργία Chapter είναι έτοιμο και προστατευμένο!"}

@router.post("/questions")
def create_question(
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("content_editor", "admin", "superadmin"))
):
    """
    [ADMIN ONLY] Add a new question to a specific level.
    """
    return {"message": "Το endpoint για δημιουργία Ερώτησης είναι έτοιμο και προστατευμένο!"}