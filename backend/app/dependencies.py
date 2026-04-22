from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import User
from app.security import verify_access_token
from app.config import settings
from app.services.met_museum_service import MetMuseumService

security = HTTPBearer()

async def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db: AsyncSession = Depends(get_db)
):
    token = credentials.credentials
    payload = verify_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


async def get_optional_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False)),
        db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """Get current user if authenticated, otherwise return None"""
    if not credentials:
        return None
    
    token = credentials.credentials
    payload = verify_access_token(token)
    if not payload:
        return None

    user_id = payload.get("sub")
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active == True)
    )
    user = result.scalar_one_or_none()
    return user


async def require_admin(current_user: User = Depends(get_current_active_user)) -> User:
    """Require admin role"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can access this resource"
        )
    return current_user


async def require_curator_or_admin(current_user: User = Depends(get_current_active_user)) -> User:
    """Require curator or admin role"""
    if current_user.role not in ["curator", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only curators and administrators can access this resource"
        )
    return current_user


def get_met_museum_service() -> MetMuseumService:
    return MetMuseumService(
        settings.MET_MUSEUM_API_BASE_URL,
        timeout=settings.MET_MUSEUM_TIMEOUT,
        pool_cap=settings.MET_MUSEUM_INSPIRATION_POOL_CAP,
        deck_cache_ttl_sec=settings.MET_MUSEUM_DECK_CACHE_TTL_SEC,
        deck_cache_max=settings.MET_MUSEUM_DECK_CACHE_MAX,
    )


async def require_restorer_curator_or_admin(current_user: User = Depends(get_current_active_user)) -> User:
    """Require restorer, curator, or admin role (excludes viewer)"""
    if current_user.role not in ["restorer", "curator", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This resource is not available to viewers"
        )
    return current_user