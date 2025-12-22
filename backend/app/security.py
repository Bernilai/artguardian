# /app/security.py
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings
import secrets
import logging
import hashlib

logger = logging.getLogger(__name__)

# Используем argon2 как основной, с fallback на bcrypt
try:
    pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
    # Тестируем работу хэширования
    pwd_context.hash("test")
    logger.info("Using argon2 for password hashing")
except Exception as e:
    logger.warning(f"Argon2 not available, using bcrypt: {str(e)}")
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    logger.info("Using bcrypt for password hashing")

logger.info(f"Using hashing algorithm: {pwd_context.default_scheme()}")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        # Для bcrypt обрабатываем длинные пароли так же, как при хэшировании
        password_to_verify = plain_password
        if pwd_context.default_scheme() == "bcrypt":
            password_bytes = plain_password.encode('utf-8')
            if len(password_bytes) > 72:
                # Если пароль был предварительно хэширован, хэшируем и проверяемый пароль
                password_to_verify = hashlib.sha256(password_bytes).hexdigest()
        
        return pwd_context.verify(password_to_verify, hashed_password)
    except Exception as e:
        logger.error(f"Password verification error: {str(e)}")
        return False


def get_password_hash(password: str) -> str:
    try:
        # Для bcrypt обрабатываем длинные пароли
        if pwd_context.default_scheme() == "bcrypt":
            # Преобразуем в байты для проверки длины
            password_bytes = password.encode('utf-8')
            if len(password_bytes) > 72:
                logger.warning("Password too long for bcrypt, using SHA-256 pre-hashing")
                # Хэшируем пароль перед передачей в bcrypt, чтобы обойти ограничение длины
                # Используем hexdigest для получения строки фиксированной длины
                password = hashlib.sha256(password_bytes).hexdigest()

        return pwd_context.hash(password)
    except Exception as e:
        logger.error(f"Password hashing error: {str(e)}")
        raise


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    try:
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.now(timezone.utc) + expires_delta
        else:
            expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        return encoded_jwt
    except Exception as e:
        logger.error(f"Access token creation error: {str(e)}")
        raise


def create_refresh_token() -> str:
    try:
        return secrets.token_urlsafe(32)
    except Exception as e:
        logger.error(f"Refresh token creation error: {str(e)}")
        raise


def verify_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError as e:
        logger.warning(f"JWT verification failed: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Token verification error: {str(e)}")
        return None