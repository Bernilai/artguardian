from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


# Схемы пользователя
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str = "viewer"


class UserCreate(UserBase):
    password: str


class UserResponse(UserBase):
    id: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Схемы токена
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenData(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = None


class RefreshTokenCreate(BaseModel):
    refresh_token: str


# Схема логина
class LoginRequest(BaseModel):
    email: EmailStr
    password: str