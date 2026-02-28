from pydantic import BaseModel, EmailStr
from datetime import datetime
from uuid import UUID

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