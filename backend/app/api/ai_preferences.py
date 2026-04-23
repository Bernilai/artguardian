"""
API endpoints for AI preferences management.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_active_user
from app.models import AIPreferences, User
from app.schemas import AIPreferencesBase, AIPreferencesResponse

router = APIRouter()


@router.get("/preferences", response_model=AIPreferencesResponse)
async def get_ai_preferences(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get AI preferences for current user"""
    result = await db.execute(
        select(AIPreferences).where(AIPreferences.user_id == current_user.id)
    )
    preferences = result.scalar_one_or_none()

    if not preferences:
        # Create default preferences if they don't exist
        preferences = AIPreferences(
            user_id=current_user.id,
            auto_create_tickets=False,
            min_confidence=0.9,
            enabled=True,
        )
        db.add(preferences)
        await db.commit()
        await db.refresh(preferences)

    return preferences


@router.put("/preferences", response_model=AIPreferencesResponse)
async def update_ai_preferences(
    preferences_data: AIPreferencesBase,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update AI preferences for current user"""
    # Validate min_confidence range
    if not (0.0 <= preferences_data.min_confidence <= 1.0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="min_confidence must be between 0.0 and 1.0",
        )

    result = await db.execute(
        select(AIPreferences).where(AIPreferences.user_id == current_user.id)
    )
    preferences = result.scalar_one_or_none()

    if not preferences:
        preferences = AIPreferences(user_id=current_user.id)
        db.add(preferences)

    # Update all preference fields
    for field, value in preferences_data.model_dump().items():
        setattr(preferences, field, value)

    await db.commit()
    await db.refresh(preferences)

    return preferences
