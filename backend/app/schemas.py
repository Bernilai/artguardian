import re

from pydantic import BaseModel, EmailStr, field_validator, Field, ConfigDict
from typing import Optional
from datetime import datetime


# Схемы пользователя
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str = "viewer"

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        pattern = r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
        if not re.match(pattern, v):
            raise ValueError("Некорректный формат email адреса")
        return v.lower()

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Имя не может быть пустым")

        pattern = r'^[А-Яа-яЁё \-\']+$'
        if not re.match(pattern, v):
            raise ValueError("Имя должно содердать только русские буквы, пробелы дефисы и апострофы")
        return v.strip()


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=32)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8 or len(v) > 32:
            raise ValueError("Пароль должен содержать от 8 до 32 символов")

        if ' ' in v:
            raise ValueError("Пароль не должен содержать пробелы")

        pattern = r'^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};:\'",.<>?/\\|`~]+$'
        if not re.match(pattern, v):
            raise ValueError(
                "Пароль должен содержать только латинские буквы, цифры и специальные символы"
            )

        # if not re.search(r'[A-Z]', v):
        #     raise ValueError("Пароль должен содержать хотя бы одну заглавную букву")
        #
        # if not re.search(r'[a-z]', v):
        #     raise ValueError("Пароль должен содержать хотя бы одну строчную букву")
        #
        # if not re.search(r'\d', v):
        #     raise ValueError("Пароль должен содержать хотя бы одну цифру")
        #
        # if not re.search(r'[!@#$%^&*()_+\-=\[\]{};:\'",?/\\|`~]', v):
        #     raise ValueError("Пароль должен содержать хотя бы один специальный символ")

        return v


class UserResponse(UserBase):
    id: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


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

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        pattern = r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
        if not re.match(pattern, v):
            raise ValueError("Некорректный формат email адреса")
        return v.lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8 or len(v) > 32:
            raise ValueError("Пароль должен содержать от 8 до 32 символов")

        if ' ' in v:
            raise ValueError("Пароль не должен содержать пробелы")

        pattern = r'^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};:\'",.<>?/\\|`~]+$'
        if not re.match(pattern, v):
            raise ValueError(
                "Пароль должен содержать только латинские буквы, цифры и специальные символы"
            )

        return v
