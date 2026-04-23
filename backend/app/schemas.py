import re
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# Схемы пользователя
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str = "viewer"

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        pattern = r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"
        if not re.match(pattern, v):
            raise ValueError("Некорректный формат email адреса")
        return v.lower()

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Имя не может быть пустым")

        pattern = r"^[А-Яа-яЁё \-\']+$"
        if not re.match(pattern, v):
            raise ValueError(
                "Имя должно содержать только русские буквы, пробелы дефисы и апострофы"
            )
        return v.strip()


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=32)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8 or len(v) > 32:
            raise ValueError("Пароль должен содержать от 8 до 32 символов")

        if " " in v:
            raise ValueError("Пароль не должен содержать пробелы")

        pattern = r'^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};:\'",.<>?/\\|`~]+$'
        if not re.match(pattern, v):
            raise ValueError(
                "Пароль должен содержать только латинские буквы, цифры "
                "и специальные символы"
            )

        return v


class UserResponse(UserBase):
    id: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=32)


class AdminPasswordChange(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=32)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8 or len(v) > 32:
            raise ValueError("Пароль должен содержать от 8 до 32 символов")

        if " " in v:
            raise ValueError("Пароль не должен содержать пробелы")

        pattern = r'^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};:\'",.<>?/\\|`~]+$'
        if not re.match(pattern, v):
            raise ValueError(
                "Пароль должен содержать только латинские буквы, цифры "
                "и специальные символы"
            )

        return v


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
        pattern = r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"
        if not re.match(pattern, v):
            raise ValueError("Некорректный формат email адреса")
        return v.lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8 or len(v) > 32:
            raise ValueError("Пароль должен содержать от 8 до 32 символов")

        if " " in v:
            raise ValueError("Пароль не должен содержать пробелы")

        pattern = r'^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};:\'",.<>?/\\|`~]+$'
        if not re.match(pattern, v):
            raise ValueError(
                "Пароль должен содержать только латинские буквы, цифры "
                "и специальные символы"
            )

        return v


class LocationInfo(BaseModel):
    bounding_box: List[int]  # [x1, y1, x2, y2]
    area_pixels: int
    area_percent: float
    perimeter: Optional[float] = None


class DefectInfo(BaseModel):
    type: str
    description: str
    severity: str  # low, medium, high
    confidence: float
    is_critical: bool
    location: LocationInfo
    detection_time: datetime


class DetectionCreate(BaseModel):
    artifact_id: str
    detection_type: str
    severity: str
    confidence: float
    location_bbox: List[int]
    area_pixels: int
    area_percent: float
    is_critical: bool = False


class DetectionResponse(BaseModel):
    id: str
    artifact_id: str
    detection_type: str
    severity: str
    confidence: float
    location_bbox: str
    area_pixels: int
    area_percent: float
    is_critical: bool
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ArtifactBase(BaseModel):
    title: str
    description: Optional[str] = None
    inventory_number: str
    collection: str
    current_location: Optional[str] = None
    dimensions: Optional[str] = None
    materials: Optional[str] = None


class ArtifactCreate(ArtifactBase):
    image_path: Optional[str] = None  # MinIO object path
    status: Optional[str] = (
        None  # Status: no_defects, has_defects, requires_attention, under_restoration
    )
    creation_date: Optional[str] = (
        None  # Дата создания артефакта (может быть приблизительной "XVIII век")
    )


class ArtifactResponse(ArtifactBase):
    id: str
    status: str
    last_inspection: Optional[datetime] = None
    image_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AnalysisResult(BaseModel):
    status: str
    artifact_id: str
    defects_count: int
    critical_found: bool
    defects: List[DefectInfo]
    image_path: str
    visualization_path: Optional[str] = None
    processing_time_ms: Optional[float] = None


# Схемы тикетов
class TicketBase(BaseModel):
    artifact_id: str
    title: str
    description: Optional[str] = None
    priority: str = "medium"  # low, medium, high, urgent
    notes: Optional[str] = None


class TicketCreate(TicketBase):
    assigned_to_id: Optional[str] = None


class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None  # open, in_progress, completed
    priority: Optional[str] = None
    assigned_to_id: Optional[str] = None
    notes: Optional[str] = None


class TicketResponse(TicketBase):
    id: str
    status: str
    assigned_to_id: Optional[str] = None
    created_by_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Related data
    artifact_title: Optional[str] = None
    assigned_to_name: Optional[str] = None
    created_by_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# Pagination schemas (used by list endpoints)
class PaginationInfo(BaseModel):
    currentPage: int
    totalPages: int
    totalItems: int
    itemsPerPage: int


class PaginatedArtifactsResponse(BaseModel):
    artifacts: List[dict]
    pagination: PaginationInfo


class PaginatedTicketsResponse(BaseModel):
    tickets: List[TicketResponse]
    pagination: PaginationInfo


class PaginatedUsersResponse(BaseModel):
    users: List[UserResponse]
    pagination: PaginationInfo


class BackupListItem(BaseModel):
    filename: str
    size: int
    size_formatted: str
    created_at: str


class PaginatedBackupsResponse(BaseModel):
    backups: List[BackupListItem]
    pagination: PaginationInfo


# Notification schemas
class NotificationBase(BaseModel):
    type: str
    title: str
    message: str
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[str] = None
    priority: str = "medium"


class NotificationCreate(NotificationBase):
    user_id: str


class NotificationResponse(NotificationBase):
    id: str
    user_id: str
    is_read: bool
    metadata_json: Optional[str] = None
    created_at: datetime
    read_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class NotificationUpdate(BaseModel):
    is_read: Optional[bool] = None


class NotificationPreferencesBase(BaseModel):
    ticket_assigned: bool = True
    ticket_created_unassigned: bool = True
    artifact_created: bool = True
    artifact_status_changed: bool = True
    user_created: bool = True
    backup_completed: bool = True
    ai_error: bool = True
    email_notifications: bool = False
    push_notifications: bool = True


class NotificationPreferencesResponse(NotificationPreferencesBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AIPreferencesBase(BaseModel):
    auto_create_tickets: bool = False
    min_confidence: float = 0.9
    enabled: bool = True

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "auto_create_tickets": False,
                "min_confidence": 0.9,
                "enabled": True,
            }
        }
    )


class AIPreferencesResponse(AIPreferencesBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# External museum reference (Met Museum API mirror for UI)
class MuseumReferenceObject(BaseModel):
    object_id: int
    title: str
    artist_display: Optional[str] = None
    object_date: Optional[str] = None
    primary_image_small: str
    object_url: Optional[str] = None


class MuseumInspirationResponse(BaseModel):
    """Always HTTP 200; use `available` for UI graceful degradation.

    Echo `seed` from a previous response to page within the same shuffled deck.
    """

    available: bool
    source: str = "The Metropolitan Museum of Art — Collection API"
    departments_count: Optional[int] = None
    items: List[MuseumReferenceObject] = []
    error_message: Optional[str] = None
    seed: Optional[str] = None
    pagination: Optional[PaginationInfo] = None
