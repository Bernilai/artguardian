from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import hashlib
from pydantic import ValidationError
from starlette.requests import Request

from app.database import get_db
from app.dependencies import get_current_active_user
from app.models import User, RefreshToken
from app.schemas import UserCreate, UserResponse, LoginRequest, Token, RefreshTokenCreate
from app.security import (
    verify_password, get_password_hash, create_access_token,
    create_refresh_token, verify_access_token
)
from app.config import settings
import logging

from fastapi import Response

logger = logging.getLogger(__name__)
router = APIRouter()

@router.options("/login")
@router.options("/register")
@router.options("/refresh")
@router.options("/logout")
async def options_handler():
    return {"message": "OK"}

def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(User.email == email).first()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

@router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    try:
        logger.info(f"Attempting registration for email: {user_data.email}")

        # Проверяем, нет ли пользователя с таким email
        db_user = get_user_by_email(db, user_data.email)
        if db_user:
            logger.warning(f"Registration failed - email already exists: {user_data.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        # Создаем пользователя
        hashed_password = get_password_hash(user_data.password)
        user = User(
            email=user_data.email,
            hashed_password=hashed_password,
            name=user_data.name,
            role=user_data.role or "admin"  # Убедимся, что роль всегда есть
        )

        db.add(user)
        db.commit()
        db.refresh(user)

        logger.info(f"User registered successfully: {user.email}")
        return user

    except Exception as e:
        db.rollback()
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )


@router.post("/login", response_model=Token)
async def login(
        response: Response,
        request: Request,
        login_data: LoginRequest,
        db: Session = Depends(get_db)
):
    try:
        logger.info(f"🔐 Login attempt for email: {login_data.email}")

        # Аутентификация
        user = get_user_by_email(db, login_data.email)
        if not user or not verify_password(login_data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Incorrect email or password")

        if not user.is_active:
            raise HTTPException(status_code=400, detail="Inactive user")

        # 🔥 ИЩЕМ СУЩЕСТВУЮЩИЙ АКТИВНЫЙ REFRESH TOKEN
        existing_token = db.query(RefreshToken).filter(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked == False,
            RefreshToken.expires_at > datetime.utcnow()
        ).first()

        refresh_token_value = None

        if existing_token:
            # 🔥 ИСПОЛЬЗУЕМ СУЩЕСТВУЮЩИЙ ТОКЕН (продлеваем срок)
            logger.info(f"🔄 Using existing refresh token for user: {user.email}")
            existing_token.expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
            # 🔥 НЕ МОЖЕМ ПОЛУЧИТЬ ОРИГИНАЛЬНЫЙ ТОКЕН, ПОЭТОМУ НИЧЕГО НЕ ДЕЛАЕМ С COOKIE
            # Cookie останется прежним, если пользователь не очистил его
            refresh_token_value = "existing"  # Маркер, что токен уже существует
        else:
            # 🔥 СОЗДАЕМ НОВЫЙ ТОКЕН ТОЛЬКО ЕСЛИ НЕТ АКТИВНОГО
            logger.info(f"🆕 Creating new refresh token for user: {user.email}")
            refresh_token_value = create_refresh_token()
            refresh_token_hash = hash_token(refresh_token_value)

            db_refresh_token = RefreshToken(
                user_id=user.id,
                token_hash=refresh_token_hash,
                expires_at=datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
            )
            db.add(db_refresh_token)

        # Создаем access token
        access_token = create_access_token(data={"sub": user.id, "email": user.email})

        db.commit()

        # 🔥 УСТАНАВЛИВАЕМ COOKIE ТОЛЬКО ЕСЛИ СОЗДАЛИ НОВЫЙ ТОКЕН
        if refresh_token_value != "existing":
            logger.info(f"🍪 Setting new refresh_token cookie for: {login_data.email}")
            response.set_cookie(
                key="refresh_token",
                value=refresh_token_value,
                httponly=True,
                secure=False,
                samesite="lax",
                max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
                path="/"
            )
        else:
            logger.info(f"🔁 Keeping existing refresh token cookie for: {login_data.email}")

        logger.info(f"✅ Login successful for: {login_data.email}")

        return Token(
            access_token=access_token,
            token_type="bearer",
            user=user
        )

    except Exception as e:
        db.rollback()
        logger.error(f"💥 Login error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


@router.post("/refresh", response_model=Token)
async def refresh_token(
        request: Request,
        response: Response,
        db: Session = Depends(get_db)
):
    try:
        # Получаем refresh token из cookie
        refresh_token = request.cookies.get("refresh_token")
        if not refresh_token:
            raise HTTPException(status_code=401, detail="Refresh token missing")

        # Находим refresh token в БД
        token_hash = hash_token(refresh_token)
        db_token = db.query(RefreshToken).filter(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,
            RefreshToken.expires_at > datetime.utcnow()
        ).first()

        if not db_token:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        user = db_token.user

        if not user.is_active:
            raise HTTPException(status_code=400, detail="Inactive user")

        access_token = create_access_token(data={"sub": user.id, "email": user.email})
        db_token.expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

        db.commit()

        return Token(
            access_token=access_token,
            token_type="bearer",
            user=user
        )

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Token refresh error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Token refresh failed: {str(e)}")


@router.post("/logout")
async def logout(
        request: Request,
        response: Response,
        db: Session = Depends(get_db)
):
    try:
        # Получаем refresh token из cookie
        refresh_token = request.cookies.get("refresh_token")

        if refresh_token:
            # Инвалидируем refresh token в БД
            token_hash = hash_token(refresh_token)
            db_token = db.query(RefreshToken).filter(
                RefreshToken.token_hash == token_hash
            ).first()

            if db_token:
                db_token.revoked = True
                db.commit()

        # Удаляем cookie
        response.delete_cookie(
            key="refresh_token",
            path="/"
        )

        return {"message": "Successfully logged out"}

    except Exception as e:
        db.rollback()
        logger.error(f"Logout error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Logout failed: {str(e)}")


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: User = Depends(get_current_active_user)):
    try:
        logger.info(f"Profile request for user: {current_user.email}")
        return current_user

    except Exception as e:
        logger.error(f"Error retrieving user profile: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve user profile: {str(e)}"
        )


# Дополнительные эндпоинты для управления сессиями

@router.post("/revoke-all")
async def revoke_all_tokens(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    try:
        logger.info(f"Revoking all tokens for user: {current_user.email}")

        # Отзываем все refresh токены пользователя
        result = db.query(RefreshToken).filter(
            RefreshToken.user_id == current_user.id,
            RefreshToken.revoked == False
        ).update({"revoked": True})

        db.commit()

        logger.info(f"Revoked {result} tokens for user: {current_user.email}")

        return {"message": f"All tokens revoked successfully", "revoked_count": result}

    except Exception as e:
        db.rollback()
        logger.error(f"Error revoking all tokens: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke tokens: {str(e)}"
        )


@router.get("/sessions")
async def get_active_sessions(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    try:
        logger.info(f"Retrieving active sessions for user: {current_user.email}")

        active_sessions = db.query(RefreshToken).filter(
            RefreshToken.user_id == current_user.id,
            RefreshToken.revoked == False,
            RefreshToken.expires_at > datetime.utcnow()
        ).all()

        sessions_data = []
        for session in active_sessions:
            sessions_data.append({
                "id": session.id,
                "created_at": session.created_at,
                "expires_at": session.expires_at,
                "device_info": session.device_info
            })

        return {"sessions": sessions_data, "total": len(sessions_data)}

    except Exception as e:
        logger.error(f"Error retrieving sessions: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve sessions: {str(e)}"
        )


@router.delete("/sessions/{session_id}")
async def revoke_session(session_id: str, current_user: User = Depends(get_current_active_user),
                         db: Session = Depends(get_db)):
    try:
        logger.info(f"Revoking session {session_id} for user: {current_user.email}")

        session = db.query(RefreshToken).filter(
            RefreshToken.id == session_id,
            RefreshToken.user_id == current_user.id
        ).first()

        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )

        session.revoked = True
        db.commit()

        logger.info(f"Session {session_id} revoked successfully")

        return {"message": "Session revoked successfully"}

    except HTTPException:
        # Пробрасываем уже созданные HTTPException
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error revoking session: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke session: {str(e)}"
        )