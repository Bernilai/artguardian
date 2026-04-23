"""
Helper functions for creating notifications
"""

import json
import logging
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, NotificationPreferences, User

logger = logging.getLogger(__name__)


async def should_send_notification(
    db: AsyncSession, user_id: str, notification_type: str
) -> bool:
    """Check if user should receive notification based on preferences"""
    result = await db.execute(
        select(NotificationPreferences).where(
            NotificationPreferences.user_id == user_id
        )
    )
    preferences = result.scalar_one_or_none()

    if not preferences:
        # Default to True if preferences don't exist
        return True

    # Map notification types to preference fields
    type_mapping = {
        "ticket_assigned": preferences.ticket_assigned,
        "ticket_created": preferences.ticket_created_unassigned,
        "artifact_created": preferences.artifact_created,
        "artifact_status_changed": preferences.artifact_status_changed,
        "user_created": preferences.user_created,
        "password_changed": preferences.password_changed,
        "backup_completed": preferences.backup_completed,
        "ai_error": preferences.ai_error,
    }

    return type_mapping.get(notification_type, True)


async def create_notification(
    db: AsyncSession,
    user_id: str,
    notification_type: str,
    title: str,
    message: str,
    related_entity_type: Optional[str] = None,
    related_entity_id: Optional[str] = None,
    priority: str = "medium",
    metadata: Optional[dict] = None,
) -> Optional[Notification]:
    """Create a notification for a user if they have preferences enabled"""
    try:
        # Check if user should receive this notification
        if not await should_send_notification(db, user_id, notification_type):
            logger.debug(
                f"Skipping notification {notification_type} for user {user_id} "
                f"(preferences disabled)"
            )
            return None

        notification = Notification(
            user_id=user_id,
            type=notification_type,
            title=title,
            message=message,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            priority=priority,
            metadata_json=json.dumps(metadata) if metadata else None,
        )

        db.add(notification)
        await db.flush()  # Flush to get the ID without committing

        logger.info(
            f"Created notification {notification.id} of type {notification_type} "
            f"for user {user_id}"
        )
        return notification
    except Exception as e:
        logger.error(f"Error creating notification: {e}", exc_info=True)
        return None


async def notify_ticket_assigned(
    db: AsyncSession,
    ticket_id: str,
    ticket_title: str,
    assigned_to_id: str,
    artifact_title: Optional[str] = None,
):
    """Notify restorer about ticket assignment"""
    title = "Новый тикет назначен"
    message = f"Вам назначен тикет: {ticket_title}"
    if artifact_title:
        message += f" (артефакт: {artifact_title})"

    await create_notification(
        db=db,
        user_id=assigned_to_id,
        notification_type="ticket_assigned",
        title=title,
        message=message,
        related_entity_type="ticket",
        related_entity_id=ticket_id,
        priority="high",
    )


async def notify_ticket_created_unassigned(
    db: AsyncSession,
    ticket_id: str,
    ticket_title: str,
    artifact_title: Optional[str] = None,
):
    """Notify all restorers about new unassigned ticket"""
    # Get all active restorers
    result = await db.execute(
        select(User).where(User.role == "restorer", User.is_active)
    )
    restorers = result.scalars().all()

    title = "Создан новый тикет без назначения"
    message = f"Создан новый тикет: {ticket_title}"
    if artifact_title:
        message += f" (артефакт: {artifact_title})"

    for restorer in restorers:
        await create_notification(
            db=db,
            user_id=restorer.id,
            notification_type="ticket_created",
            title=title,
            message=message,
            related_entity_type="ticket",
            related_entity_id=ticket_id,
            priority="medium",
        )


async def notify_artifact_created(
    db: AsyncSession, artifact_id: str, artifact_title: str
):
    """Notify curators and viewers about new artifact"""
    # Get all active curators and viewers
    result = await db.execute(
        select(User).where(
            or_(User.role == "curator", User.role == "viewer"), User.is_active
        )
    )
    users = result.scalars().all()

    title = "Добавлен новый артефакт"
    message = f"В коллекцию добавлен артефакт: {artifact_title}"

    for user in users:
        await create_notification(
            db=db,
            user_id=user.id,
            notification_type="artifact_created",
            title=title,
            message=message,
            related_entity_type="artifact",
            related_entity_id=artifact_id,
            priority="medium",
        )


async def notify_artifact_status_changed(
    db: AsyncSession,
    artifact_id: str,
    artifact_title: str,
    old_status: str,
    new_status: str,
):
    """Notify curators about artifact status change"""
    # Get all active curators
    result = await db.execute(
        select(User).where(User.role == "curator", User.is_active)
    )
    curators = result.scalars().all()

    status_names = {
        "no_defects": "Без дефектов",
        "has_defects": "С дефектами",
        "requires_attention": "Требует внимания",
        "under_restoration": "На реставрации",
        "exhibited": "Экспонируется",
    }

    old_status_name = status_names.get(old_status, old_status)
    new_status_name = status_names.get(new_status, new_status)

    title = "Изменен статус артефакта"
    message = (
        f"Статус артефакта '{artifact_title}' изменен: "
        f"{old_status_name} → {new_status_name}"
    )

    for curator in curators:
        await create_notification(
            db=db,
            user_id=curator.id,
            notification_type="artifact_status_changed",
            title=title,
            message=message,
            related_entity_type="artifact",
            related_entity_id=artifact_id,
            priority="medium",
        )


async def notify_user_created(
    db: AsyncSession, new_user_id: str, new_user_name: str, new_user_role: str
):
    """Notify admins about new user"""
    # Get all active admins
    result = await db.execute(
        select(User).where(User.role == "admin", User.is_active)
    )
    admins = result.scalars().all()

    title = "Создан новый пользователь"
    message = (
        f"Зарегистрирован новый пользователь: {new_user_name} (роль: {new_user_role})"
    )

    for admin in admins:
        await create_notification(
            db=db,
            user_id=admin.id,
            notification_type="user_created",
            title=title,
            message=message,
            related_entity_type="user",
            related_entity_id=new_user_id,
            priority="low",
        )


async def notify_password_changed(
    db: AsyncSession,
    user_id: str,
    user_name: str,
    changed_by_admin: bool = False,
    admin_name: Optional[str] = None,
):
    """Notify admins when a user changes their password"""
    # Get all active admins
    result = await db.execute(
        select(User).where(User.role == "admin", User.is_active)
    )
    admins = result.scalars().all()

    if changed_by_admin and admin_name:
        title = "Пароль пользователя изменен администратором"
        message = f"Администратор {admin_name} изменил пароль пользователя: {user_name}"
    else:
        title = "Пользователь изменил пароль"
        message = f"Пользователь {user_name} изменил свой пароль"

    for admin in admins:
        await create_notification(
            db=db,
            user_id=admin.id,
            notification_type="password_changed",
            title=title,
            message=message,
            related_entity_type="user",
            related_entity_id=user_id,
            priority="medium",
        )
