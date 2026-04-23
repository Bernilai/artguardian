import logging
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_active_user
from app.models import Notification, NotificationPreferences
from app.models import User as UserModel
from app.schemas import (
    NotificationPreferencesBase,
    NotificationPreferencesResponse,
    NotificationResponse,
    NotificationUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", response_model=List[NotificationResponse])
async def get_notifications(
    unread_only: bool = Query(False, alias="unread"),
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
    current_user: UserModel = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get notifications for current user"""
    query = select(Notification).where(Notification.user_id == current_user.id)

    if unread_only:
        query = query.where(~Notification.is_read)

    query = query.order_by(Notification.created_at.desc()).limit(limit).offset(skip)

    result = await db.execute(query)
    notifications = result.scalars().all()

    return notifications


@router.get("/unread-count", response_model=dict)
async def get_unread_count(
    current_user: UserModel = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get count of unread notifications"""
    result = await db.execute(
        select(func.count(Notification.id)).where(
            and_(Notification.user_id == current_user.id, ~Notification.is_read)
        )
    )
    count = result.scalar() or 0

    return {"count": count}


@router.post("/mark-all-read", status_code=status.HTTP_200_OK)
async def mark_all_read(
    current_user: UserModel = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all notifications as read"""
    result = await db.execute(
        select(Notification).where(
            and_(Notification.user_id == current_user.id, ~Notification.is_read)
        )
    )
    notifications = result.scalars().all()

    now = datetime.now(timezone.utc)
    for notification in notifications:
        notification.is_read = True
        notification.read_at = now

    await db.commit()

    return {"marked": len(notifications)}


@router.get("/preferences", response_model=NotificationPreferencesResponse)
async def get_notification_preferences(
    current_user: UserModel = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get notification preferences for current user"""
    result = await db.execute(
        select(NotificationPreferences).where(
            NotificationPreferences.user_id == current_user.id
        )
    )
    preferences = result.scalar_one_or_none()

    if not preferences:
        # Create default preferences if they don't exist
        preferences = NotificationPreferences(
            user_id=current_user.id,
            ticket_assigned=True,
            ticket_created_unassigned=True,
            artifact_created=True,
            artifact_status_changed=True,
            user_created=True,
            backup_completed=True,
            ai_error=True,
            email_notifications=False,
            push_notifications=True,
        )
        db.add(preferences)
        await db.commit()
        await db.refresh(preferences)

    return preferences


@router.put("/preferences", response_model=NotificationPreferencesResponse)
async def update_notification_preferences(
    preferences_data: NotificationPreferencesBase,
    current_user: UserModel = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update notification preferences for current user"""
    result = await db.execute(
        select(NotificationPreferences).where(
            NotificationPreferences.user_id == current_user.id
        )
    )
    preferences = result.scalar_one_or_none()

    if not preferences:
        preferences = NotificationPreferences(user_id=current_user.id)
        db.add(preferences)

    # Update all preference fields
    for field, value in preferences_data.model_dump().items():
        setattr(preferences, field, value)

    await db.commit()
    await db.refresh(preferences)

    return preferences


@router.put("/{notification_id}", response_model=NotificationResponse)
async def update_notification(
    notification_id: str,
    notification_data: NotificationUpdate,
    current_user: UserModel = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update notification (mark as read/unread)"""
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == current_user.id,
            )
        )
    )
    notification = result.scalar_one_or_none()

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    if notification_data.is_read is not None:
        notification.is_read = notification_data.is_read
        if notification_data.is_read:
            notification.read_at = datetime.now(timezone.utc)
        else:
            notification.read_at = None

    await db.commit()
    await db.refresh(notification)

    return notification


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: str,
    current_user: UserModel = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a notification"""
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == current_user.id,
            )
        )
    )
    notification = result.scalar_one_or_none()

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    await db.delete(notification)
    await db.commit()

    return None
