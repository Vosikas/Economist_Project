import os
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from db import get_db
from models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: dict):
    encoded = data.copy()
    time_now = datetime.now(timezone.utc)
    expiring_time = time_now + timedelta(minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES")))
    encoded.update({"exp": expiring_time})    
    encoded_jwt = jwt.encode(encoded, os.getenv("SECRET_KEY"), algorithm=os.getenv("ALGORITHM"))
    return encoded_jwt  

def create_refresh_token(data: dict):
    encoded = data.copy()
    time_now = datetime.now(timezone.utc)
    expiring_time = time_now + timedelta(days=int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS")))
    encoded.update({"exp": expiring_time})    
    encoded_jwt = jwt.encode(encoded, os.getenv("SECRET_KEY"), algorithm=os.getenv("ALGORITHM"))
    return encoded_jwt

def get_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, os.getenv("SECRET_KEY"), algorithms=[os.getenv("ALGORITHM")])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise credentials_exception
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user
def create_verification_token(email: str):
    encoded= { "sub" : email}
    time_now=datetime.now(timezone.utc)
    expiring_time=time_now + timedelta(hours=int(os.getenv("EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS")))
    encoded.update({"exp":expiring_time})
    encoded_jwt = jwt.encode(encoded,os.getenv("SECRET_KEY" ), algorithm = os.getenv("ALGORITHM"))
    return encoded_jwt