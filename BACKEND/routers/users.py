from fastapi import APIRouter, Depends, HTTPException, status,BackgroundTasks
from sqlalchemy.orm import Session
import jwt
from db import get_db
from models import User
from schemas import Usersignup, UserResponse
from security import get_password_hash, get_user, create_verification_token
import os
from emails_service import send_verification_email
from fastapi.responses import RedirectResponse

router = APIRouter(tags=["Users"])

@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user: Usersignup,background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user_exists = db.query(User).filter((User.username == user.username) | (User.email == user.email)).first()

    if user_exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username or email already exists")
    
    
    hashed_password = get_password_hash(user.password)
    
    new_user = User(username=user.username, email=user.email, password_hash=hashed_password)
    db.add(new_user)  
    db.commit()
    db.refresh(new_user) 
    token=create_verification_token(new_user.email)
    background_tasks.add_task(send_verification_email, new_user.email, token)    
    return new_user

@router.get("/verify-email/{token}")
def verify_email(token: str,db : Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
     payload = jwt.decode(token,os.getenv("SECRET_KEY"), algorithms=[os.getenv("ALGORITHM")])
     email= payload.get("sub")
     if email is None:
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Verification token has expired")
    except jwt.InvalidTokenError:
        raise credentials_exception
    user=db.query(User).filter(User.email == email).first()
    if not user:
        raise credentials_exception
    if user.verified_email:
       return RedirectResponse(url="http://127.0.0.1:8000/docs")
    user.verified_email=True
    db.commit() 
    return  RedirectResponse(url="http://127.0.0.1:8000/docs")
