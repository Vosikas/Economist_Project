from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import os
import jwt

from db import get_db
from models import User, RefreshToken
from schemas import Userlogin, TokenResponse, RefreshReq
from security import verify_password, create_access_token, create_refresh_token

# Ορίζουμε το router για το Authentication
router = APIRouter(tags=["Authentication"])

@router.post("/login", response_model=TokenResponse)
def login(user: Userlogin, db: Session = Depends(get_db)):
    user_in_db = db.query(User).filter(User.username == user.username).first()
    if not user_in_db:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid username or password")
    
    if not verify_password(user.password, user_in_db.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid username or password") 
    
    access_token = create_access_token(data={"sub": str(user_in_db.id)})
    refresh_token = create_refresh_token(data={"sub": str(user_in_db.id)})
    
    expires = datetime.now(timezone.utc) + timedelta(days=int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS")))
    new_ses = RefreshToken(user_id=user_in_db.id, token=refresh_token, expires_at=expires)
    db.add(new_ses)
    db.commit()

    return TokenResponse(access_token=access_token, refresh_token=refresh_token, token_type="bearer")

@router.post("/refresh", response_model=TokenResponse)
def refresh(request: RefreshReq, db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(request.refresh_token, os.getenv("SECRET_KEY"), algorithms=[os.getenv("ALGORITHM")])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception 
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has expired")
    except jwt.InvalidTokenError:
        raise credentials_exception
    
    stored_token = db.query(RefreshToken).filter(RefreshToken.token == request.refresh_token).first()
    if not stored_token:
        raise credentials_exception
        
    db.delete(stored_token)
    db.commit()
    
    new_access_token = create_access_token(data={"sub": str(user_id)})
    new_refresh_token = create_refresh_token(data={"sub": str(user_id)})    
    
    expires = datetime.now(timezone.utc) + timedelta(days=int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS")))
    new_ses = RefreshToken(user_id=user_id, token=new_refresh_token, expires_at=expires)
    db.add(new_ses)        
    db.commit()
    
    return TokenResponse(access_token=new_access_token, refresh_token=new_refresh_token, token_type="bearer")   

@router.post("/logout")
def logout(request: RefreshReq, db: Session = Depends(get_db)):
    token_in_db = db.query(RefreshToken).filter(RefreshToken.token == request.refresh_token).first()
    if token_in_db:
        db.delete(token_in_db)
        db.commit()
    return {"detail": "Logged out successfully"}