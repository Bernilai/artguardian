import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, and_
from starlette.requests import Request

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_active_user
from app.models import User, RefreshToken
from app.schemas import (
    UserCreate,
    UserResponse,
    UserUpdate,
    LoginRequest,
    Token,
    RefreshTokenCreate,
    PasswordChange,
    AdminPasswordChange,
    PaginatedUsersResponse,
    PaginationInfo,
)
from app.utils.notifications import notify_password_changed
from app.security import (
    verify_password, get_password_hash, create_access_token,
    create_refresh_token, verify_access_token
)

logger = logging.getLogger(__name__)
router = APIRouter()

@router.options("/login")
@router.options("/register")
@router.options("/refresh")
@router.options("/logout")
async def options_handler():
    return {"message": "OK"}

async def get_user_by_email(db: AsyncSession, email: str):
    """Get user by email using async SQLAlchemy"""
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

@router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    try:
        logger.info(f"Attempting registration for email: {user_data.email}")

        db_user = await get_user_by_email(db, user_data.email)
        if db_user:
            logger.warning(f"Registration failed - email already exists: {user_data.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        hashed_password = get_password_hash(user_data.password)
        user = User(
            email=user_data.email,
            hashed_password=hashed_password,
            name=user_data.name,
            role=user_data.role or "viewer"
        )

        db.add(user)
        await db.flush()
        logger.info(f"User added to session, ID: {user.id}")
        
        await db.commit()
        logger.info(f"Database commit successful for user: {user.email}")
        
        await db.refresh(user)
        logger.info(f"User registered successfully: {user.email}, ID: {user.id}")
        
        from app.utils.notifications import notify_user_created
        await notify_user_created(
            db=db,
            new_user_id=user.id,
            new_user_name=user.name,
            new_user_role=user.role
        )
        await db.commit()
        
        return user

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Registration error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )


@router.post("/login", response_model=Token)
async def login(
        response: Response,
        request: Request,
        login_data: LoginRequest,
        db: AsyncSession = Depends(get_db)
):
    try:
        logger.info(f"🔐 Login attempt for email: {login_data.email}")

        # Аутентификация
        user = await get_user_by_email(db, login_data.email)
        if not user or not verify_password(login_data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Incorrect email or password")

        if not user.is_active:
            raise HTTPException(status_code=400, detail="Inactive user")

        # Check for existing token
        result = await db.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == user.id,
                RefreshToken.revoked == False,
                RefreshToken.expires_at > datetime.now(timezone.utc)
            )
        )
        existing_token = result.scalar_one_or_none()

        refresh_token_value = None

        if existing_token:
            logger.info(f"🔄 Using existing refresh token for user: {user.email}")
            existing_token.expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
            refresh_token_value = "existing"  # Маркер, что токен уже существует
        else:
            logger.info(f"🆕 Creating new refresh token for user: {user.email}")
            refresh_token_value = create_refresh_token()
            refresh_token_hash = hash_token(refresh_token_value)

            db_refresh_token = RefreshToken(
                user_id=user.id,
                token_hash=refresh_token_hash,
                expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
            )
            db.add(db_refresh_token)
            await db.flush()
            logger.info(f"Refresh token added to session for user: {user.email}")

        # Создаем access token
        access_token = create_access_token(data={"sub": user.id, "email": user.email})

        await db.commit()
        logger.info(f"Database commit successful for login: {user.email}")

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

    except HTTPException:
        # Пробрасываем HTTPException без rollback
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"💥 Login error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


@router.post("/refresh", response_model=Token)
async def refresh_token(
        request: Request,
        response: Response,
        db: AsyncSession = Depends(get_db)
):
    try:
        # Получаем refresh token из cookie
        refresh_token = request.cookies.get("refresh_token")
        if not refresh_token:
            raise HTTPException(status_code=401, detail="Refresh token missing")

        # Находим refresh token в БД
        token_hash = hash_token(refresh_token)
        result = await db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked == False,
                RefreshToken.expires_at > datetime.now(timezone.utc)
            )
        )
        db_token = result.scalar_one_or_none()

        if not db_token:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        # Load user relationship
        await db.refresh(db_token, ["user"])
        user = db_token.user

        if not user.is_active:
            raise HTTPException(status_code=400, detail="Inactive user")

        access_token = create_access_token(data={"sub": user.id, "email": user.email})
        db_token.expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

        await db.commit()

        return Token(
            access_token=access_token,
            token_type="bearer",
            user=user
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Token refresh error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Token refresh failed: {str(e)}")


@router.post("/logout")
async def logout(
        request: Request,
        response: Response,
        db: AsyncSession = Depends(get_db)
):
    try:
        # Получаем refresh token из cookie
        refresh_token = request.cookies.get("refresh_token")

        if refresh_token:
            # Инвалидируем refresh token в БД
            token_hash = hash_token(refresh_token)
            result = await db.execute(
                select(RefreshToken).where(RefreshToken.token_hash == token_hash)
            )
            db_token = result.scalar_one_or_none()

            if db_token:
                db_token.revoked = True
                await db.commit()

        # Удаляем cookie
        response.delete_cookie(
            key="refresh_token",
            path="/"
        )

        return {"message": "Successfully logged out"}

    except Exception as e:
        await db.rollback()
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


@router.get("/users", response_model=PaginatedUsersResponse)
async def get_users(
    role: Optional[str] = Query(None),
    include_inactive: bool = Query(False, alias="include_inactive"),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=500, alias="pageSize"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get list of users, optionally filtered by role (paginated)"""
    conditions = []
    if not include_inactive:
        conditions.append(User.is_active == True)
    if role:
        conditions.append(User.role == role)

    count_stmt = select(func.count()).select_from(User)
    query = select(User).order_by(User.name)
    if conditions:
        filt = and_(*conditions)
        count_stmt = count_stmt.where(filt)
        query = query.where(filt)

    total_items_result = await db.execute(count_stmt)
    total_items_value = int(total_items_result.scalar_one() or 0)

    total_pages = (total_items_value + pageSize - 1) // pageSize if total_items_value > 0 else 0
    offset = (page - 1) * pageSize

    query = query.offset(offset).limit(pageSize)
    result = await db.execute(query)
    users = result.scalars().all()

    return PaginatedUsersResponse(
        users=[UserResponse.model_validate(user) for user in users],
        pagination=PaginationInfo(
            currentPage=page,
            totalPages=total_pages,
            totalItems=total_items_value,
            itemsPerPage=pageSize,
        ),
    )


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update user (admin only)"""
    # Only admins can update users
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can update users"
        )
    
    # Find user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent self-deactivation
    if user_data.is_active is False and user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account"
        )
    
    # Update fields
    if user_data.name is not None:
        user.name = user_data.name
    if user_data.role is not None:
        user.role = user_data.role
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    
    user.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(user)
    
    logger.info(f"User {user_id} updated by admin {current_user.id}")
    return UserResponse.model_validate(user)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete user (admin only, soft delete by setting is_active=False)"""
    # Only admins can delete users
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can delete users"
        )
    
    # Find user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent self-deletion
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    # Soft delete by setting is_active=False
    user.is_active = False
    user.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    
    logger.info(f"User {user_id} deactivated by admin {current_user.id}")
    return {"message": "User deactivated successfully"}


# Дополнительные эндпоинты для управления сессиями

@router.post("/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Change user's own password"""
    # Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Текущий пароль неверен"
        )
    
    # Check if new password is different from current
    if verify_password(password_data.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Новый пароль должен отличаться от текущего"
        )
    
    # Update password
    current_user.hashed_password = get_password_hash(password_data.new_password)
    current_user.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(current_user)
    
    # Notify admins about password change
    await notify_password_changed(
        db=db,
        user_id=current_user.id,
        user_name=current_user.name,
        changed_by_admin=False
    )
    await db.commit()
    
    logger.info(f"Password changed for user: {current_user.email}")
    return {"message": "Пароль успешно изменен"}


@router.post("/users/{user_id}/change-password")
async def admin_change_user_password(
    user_id: str,
    password_data: AdminPasswordChange,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Change user password (admin only)"""
    # Only admins can change user passwords
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can change user passwords"
        )
    
    # Find user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Password validation is handled automatically by Pydantic via AdminPasswordChange schema
    # Check if new password is different from current
    if verify_password(password_data.new_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Новый пароль должен отличаться от текущего"
        )
    
    # Update password
    user.hashed_password = get_password_hash(password_data.new_password)
    user.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(user)
    
    # Notify admins about password change
    await notify_password_changed(
        db=db,
        user_id=user.id,
        user_name=user.name,
        changed_by_admin=True,
        admin_name=current_user.name
    )
    await db.commit()
    
    logger.info(f"Password changed for user {user.email} by admin {current_user.email}")
    return {"message": f"Пароль пользователя {user.name} успешно изменен"}


@router.post("/revoke-all")
async def revoke_all_tokens(current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    try:
        logger.info(f"Revoking all tokens for user: {current_user.email}")

        # Отзываем все refresh токены пользователя
        stmt = (
            update(RefreshToken)
            .where(
                RefreshToken.user_id == current_user.id,
                RefreshToken.revoked == False
            )
            .values(revoked=True)
        )
        result = await db.execute(stmt)
        revoked_count = result.rowcount

        await db.commit()

        logger.info(f"Revoked tokens for user: {current_user.email}")

        return {"message": f"All tokens revoked successfully", "revoked_count": revoked_count}

    except Exception as e:
        await db.rollback()
        logger.error(f"Error revoking all tokens: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke tokens: {str(e)}"
        )


@router.get("/sessions")
async def get_active_sessions(current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    try:
        logger.info(f"Retrieving active sessions for user: {current_user.email}")

        result = await db.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == current_user.id,
                RefreshToken.revoked == False,
                RefreshToken.expires_at > datetime.now(timezone.utc)
            )
        )
        active_sessions = result.scalars().all()

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
                         db: AsyncSession = Depends(get_db)):
    try:
        logger.info(f"Revoking session {session_id} for user: {current_user.email}")

        result = await db.execute(
            select(RefreshToken).where(
                RefreshToken.id == session_id,
                RefreshToken.user_id == current_user.id
            )
        )
        session = result.scalar_one_or_none()

        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )

        session.revoked = True
        await db.commit()

        logger.info(f"Session {session_id} revoked successfully")

        return {"message": "Session revoked successfully"}

    except HTTPException:
        # Пробрасываем уже созданные HTTPException
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error revoking session: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke session: {str(e)}"
        )