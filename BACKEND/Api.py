
from fastapi import FastAPI, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, Column, String, Boolean, DateTime
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from sqlalchemy.sql import func
import bcrypt
import os
from dotenv import load_dotenv
from typing import Optional
from datetime import datetime
import uuid
from uuid import UUID

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False, 
    allow_methods=["*"],
    allow_headers=["*"]
)
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
@app.post("/login", response_model=UserResponse)
def login(user: Userlogin,db: Session = Depends(get_db)):
    user_in_db = db.query(User).filter(User.username==user.username ).first()
    if not user_in_db:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid username or password")
    if not bcrypt.checkpw(user.password.encode('utf-8'), user_in_db.password_hash.encode('utf-8')):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid username or password") 
    return user_in_db