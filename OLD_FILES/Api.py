from fastapi.security import OAuth2PasswordBearer
from fastapi import FastAPI, HTTPException, status, Depends 
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, Column, String, Boolean, DateTime , ForeignKey
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from sqlalchemy.sql import func
import bcrypt
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
import uuid
from uuid import UUID
import jwt
load_dotenv()
app = FastAPI()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False, 
    allow_methods=["*"],
    allow_headers=["*"]
)
class RefreshReq(BaseModel):
    refresh_token: str
class Usersignup(BaseModel):
    username: str
    password: str
    email: EmailStr
class Userlogin(BaseModel):
    username: str
    password: str
class UserResponse(BaseModel):
    id: UUID
    username: str
    email: EmailStr
    role: str
    is_premium: bool
    created_at: datetime
    class Config:
        from_attributes = True
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str  
    token_type: str = "bearer"
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
Base = declarative_base()
class User(Base):
    __tablename__ = "user_profile"
    id = Column(pgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user")
    is_premium = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
class RefreshToken(Base):
    __tablename__= "refresh_tokens"
    id = Column(pgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(pgUUID(as_uuid=True), ForeignKey("user_profile.id"), nullable=False)
    token = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)    
    created_at= Column(DateTime(timezone=True),server_default=func.now())
def create_access_token(data:dict):
    encoded=data.copy()
    time_now=datetime.now(timezone.utc)
    expiring_time=time_now+timedelta(minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES")))
    encoded.update({"exp": expiring_time})    
    encoded_jwt=jwt.encode(encoded, os.getenv("SECRET_KEY"), algorithm=os.getenv("ALGORITHM"))
    return encoded_jwt  
def create_refresh_token(data:dict):
    encoded=data.copy()
    time_now=datetime.now(timezone.utc)
    expiring_time=time_now+timedelta(days=int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS")))
    encoded.update({"exp": expiring_time})    
    encoded_jwt=jwt.encode(encoded, os.getenv("SECRET_KEY"), algorithm=os.getenv("ALGORITHM"))
    return encoded_jwt                       
Base.metadata.create_all(bind=engine)
def get_user(token:str=Depends(oauth2_scheme),db : Session=Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload= jwt.decode(token, os.getenv("SECRET_KEY"),algorithms=[os.getenv("ALGORITHM")])
        user_id=payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise credentials_exception
    user=db.query(User).filter(User.id==user_id).first()
    if user is None:
        raise credentials_exception
    return user   
@app.post("/signup", response_model=UserResponse,status_code=status.HTTP_201_CREATED)
def register(user: Usersignup, db: Session = Depends(get_db)):
    user_exists = db.query(User).filter((User.username == user.username) | (User.email == user.email)).first()

    if user_exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username or email already exists")
    
    
    hashed_password = bcrypt.hashpw(user.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
  
    new_user = User(username=user.username, email=user.email, password_hash=hashed_password)
    db.add(new_user)  
    db.commit()
    db.refresh(new_user) 
    

    return new_user
@app.post("/login", response_model=TokenResponse)
def login(user: Userlogin,db: Session = Depends(get_db)):
    user_in_db = db.query(User).filter(User.username==user.username ).first()
    if not user_in_db:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid username or password")
    if not bcrypt.checkpw(user.password.encode('utf-8'), user_in_db.password_hash.encode('utf-8')):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid username or password") 
    access_token = create_access_token(data={"sub": str(user_in_db.id)})
    refresh_token = create_refresh_token(data={"sub": str(user_in_db.id)})
    expires=datetime.now(timezone.utc)+timedelta(days=int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS")))
    new_ses=RefreshToken(user_id=user_in_db.id, token=refresh_token, expires_at=expires)
    db.add(new_ses)
    db.commit()

    return TokenResponse(access_token=access_token, refresh_token=refresh_token, token_type="bearer")
@app.post("/refresh", response_model=TokenResponse)
def refresh(request : RefreshReq, db: Session = Depends(get_db)):
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
    expires=datetime.now(timezone.utc)+timedelta(days=int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS")))
    new_ses=RefreshToken(user_id=user_id, token=new_refresh_token, expires_at=expires)
    db.add(new_ses)         
    db.commit()
    return TokenResponse(access_token=new_access_token, refresh_token=new_refresh_token, token_type="bearer")   
@app.post("/logout")
def logout(request : RefreshReq , db: Session = Depends(get_db)):
    token_in_db = db.query(RefreshToken).filter(RefreshToken.token == request.refresh_token).first()
    if token_in_db:
        db.delete(token_in_db)
        db.commit()
    return {"detail": "Logged out successfully"}