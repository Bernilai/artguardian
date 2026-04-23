import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


def generate_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, default="viewer")  # admin, curator, restorer, viewer
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Связь с refresh токенами
    refresh_tokens = relationship(
        "RefreshToken", back_populates="user", cascade="all, delete-orphan"
    )
    # Связь с уведомлениями
    notifications = relationship(
        "Notification",
        foreign_keys="Notification.user_id",
        cascade="all, delete-orphan",
    )
    notification_preferences = relationship(
        "NotificationPreferences",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    ai_preferences = relationship(
        "AIPreferences",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String, unique=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked = Column(Boolean, default=False)
    device_info = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Связь с пользователем
    user = relationship("User", back_populates="refresh_tokens")


class Artifact(Base):
    __tablename__ = "artifacts"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    inventory_number = Column(String, unique=True, nullable=False, index=True)
    collection = Column(String, nullable=False)

    # Статусы: no_defects, has_defects, requires_attention, under_restoration, exhibited
    status = Column(String, default="no_defects")

    current_location = Column(String, nullable=True)
    last_inspection = Column(DateTime(timezone=True), nullable=True)
    last_inspector_id = Column(String, ForeignKey("users.id"), nullable=True)
    image_path = Column(String, nullable=True)
    creation_date = Column(
        String, nullable=True
    )  # Дата создания артефакта (может быть приблизительной "XVIII век")

    # Метаданные
    dimensions = Column(String, nullable=True)  # JSON строка
    materials = Column(String, nullable=True)  # JSON строка

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Связи
    detections = relationship(
        "Detection", back_populates="artifact", cascade="all, delete-orphan"
    )
    tickets = relationship("Ticket", cascade="all, delete-orphan")
    last_inspector = relationship("User", foreign_keys=[last_inspector_id])


class Detection(Base):
    __tablename__ = "detections"

    id = Column(String, primary_key=True, default=generate_uuid)
    artifact_id = Column(
        String,
        ForeignKey("artifacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ARTeFACT типы дефектов (15 классов)
    detection_type = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # Серьёзность: low, medium, high
    severity = Column(String, nullable=False)

    # Модель уверенности (0-1)
    confidence = Column(Float, nullable=False)

    # Локация (JSON строка: [x1, y1, x2, y2])
    location_bbox = Column(String, nullable=False)
    area_pixels = Column(Integer, nullable=False)
    area_percent = Column(Float, nullable=False)

    # Дополнительные метаданные
    is_critical = Column(Boolean, default=False)
    perimeter = Column(Float, nullable=True)

    # Отслеживание
    detected_by_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    image_path = Column(String, nullable=True)
    visualization_path = Column(String, nullable=True)

    # Статусы: pending, reviewed, resolved, under_restoration
    status = Column(String, default="pending")
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Связи
    artifact = relationship("Artifact", back_populates="detections")
    user = relationship("User")


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(String, primary_key=True, default=generate_uuid)
    artifact_id = Column(
        String,
        ForeignKey("artifacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # Статусы: open, in_progress, completed
    status = Column(String, default="open", nullable=False)

    # Приоритет: low, medium, high, urgent
    priority = Column(String, default="medium", nullable=False)

    # Назначенный реставратор
    assigned_to_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)

    # Кто создал тикет
    created_by_id = Column(String, ForeignKey("users.id"), nullable=False)

    # Дополнительные заметки
    notes = Column(Text, nullable=True)

    # Даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Связи
    artifact = relationship("Artifact", back_populates="tickets")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])
    created_by = relationship("User", foreign_keys=[created_by_id])


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Тип уведомления: ticket_assigned, ticket_created, artifact_created,
    # artifact_status_changed, user_created, backup_completed, ai_error
    type = Column(String, nullable=False, index=True)

    # Заголовок и сообщение
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)

    # Связанные сущности (опционально)
    related_entity_type = Column(String, nullable=True)  # ticket, artifact, user, etc.
    related_entity_id = Column(String, nullable=True, index=True)

    # Статус: unread, read
    is_read = Column(Boolean, default=False, nullable=False, index=True)

    # Приоритет: low, medium, high, urgent
    priority = Column(String, default="medium", nullable=False)

    # Метаданные (JSON строка для дополнительной информации)
    # Note: 'metadata_json' not 'metadata' — reserved in SQLAlchemy
    metadata_json = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)

    # Связи
    user = relationship("User", foreign_keys=[user_id], overlaps="notifications")


class NotificationPreferences(Base):
    __tablename__ = "notification_preferences"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # Уведомления о тикетах
    ticket_assigned = Column(Boolean, default=True, nullable=False)  # Назначен тикет
    ticket_created_unassigned = Column(
        Boolean, default=True, nullable=False
    )  # Создан тикет без назначения

    # Уведомления об артефактах
    artifact_created = Column(Boolean, default=True, nullable=False)  # Создан артефакт
    artifact_status_changed = Column(
        Boolean, default=True, nullable=False
    )  # Изменен статус артефакта

    # Уведомления для админа
    user_created = Column(
        Boolean, default=True, nullable=False
    )  # Создан новый пользователь
    password_changed = Column(
        Boolean, default=True, nullable=False
    )  # Изменен пароль пользователя
    backup_completed = Column(
        Boolean, default=True, nullable=False
    )  # Завершено резервное копирование
    ai_error = Column(
        Boolean, default=True, nullable=False
    )  # Ошибка AI (будет добавлено позже)

    # Общие настройки
    email_notifications = Column(
        Boolean, default=False, nullable=False
    )  # Email уведомления (для будущего)
    push_notifications = Column(
        Boolean, default=True, nullable=False
    )  # Push уведомления в приложении

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Связи
    user = relationship("User", back_populates="notification_preferences")


class AIPreferences(Base):
    __tablename__ = "ai_preferences"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # AI Detection Settings
    auto_create_tickets = Column(
        Boolean, default=False, nullable=False
    )  # Автоматически создавать тикеты
    min_confidence = Column(
        Float, default=0.9, nullable=False
    )  # Минимальный порог уверенности (0.0-1.0)
    enabled = Column(Boolean, default=True, nullable=False)  # Включить AI анализ

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Связи
    user = relationship("User", back_populates="ai_preferences")
