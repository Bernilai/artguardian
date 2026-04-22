export type { AppRoute, NavigationItem } from './navigation';

export type {
    Artifact,
    Defect,
    DefectType,
    DefectSeverity,
    MaterialType,
    ArtifactStatus,
    HistoricalPeriod,
    RestorationRecord,
    ArtifactFilters,
    ArtifactsResponse,
    ArtifactFormData,
    CollectionStats,
    ImageAnalysisResult,
} from './artifacts';
export type { PaginationInfo } from './artifacts';

export type {
    User,
    LoginCredentials,
    RegisterData,
    AuthResponse
} from './auth';

export type {
    Ticket,
    TicketStatus,
    TicketPriority,
    CreateTicketRequest,
    UpdateTicketRequest,
    TicketsResponse
} from './tickets';

export type {
    Notification,
    NotificationPreferences,
    NotificationPreferencesUpdate,
    UnreadCountResponse
} from './notifications';