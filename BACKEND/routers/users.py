from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from db import get_db
from models import User
from schemas import Usersignup, UserResponse
from security import get_password_hash, get_user

router = APIRouter(tags=["Users"])

@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user: Usersignup, db: Session = Depends(get_db)):
    user_exists = db.query(User).filter((User.username == user.username) | (User.email == user.email)).first()

    if user_exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username or email already exists")
    
    
    hashed_password = get_password_hash(user.password)
    
    new_user = User(username=user.username, email=user.email, password_hash=hashed_password)
    db.add(new_user)  
    db.commit()
    db.refresh(new_user) 
    
    return new_user

@router.get("/me", response_model=UserResponse)
def get_my_profile(current_user: User = Depends(get_user)):
    return current_user