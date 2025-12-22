export interface Notification {
    id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    related_entity_type?: string;
    related_entity_id?: string;
    priority: string;
    is_read: boolean;
    metadata_json?: string;
    created_at: string;
    read_at?: string;
}

export interface NotificationPreferences {
    id: string;
    user_id: string;
    ticket_assigned: boolean;
    ticket_created_unassigned: boolean;
    artifact_created: boolean;
    artifact_status_changed: boolean;
    user_created: boolean;
    password_changed: boolean;
    backup_completed: boolean;
    ai_error: boolean;
    email_notifications: boolean;
    push_notifications: boolean;
    created_at: string;
    updated_at?: string;
}

export interface NotificationPreferencesUpdate {
    ticket_assigned?: boolean;
    ticket_created_unassigned?: boolean;
    artifact_created?: boolean;
    artifact_status_changed?: boolean;
    user_created?: boolean;
    password_changed?: boolean;
    backup_completed?: boolean;
    ai_error?: boolean;
    email_notifications?: boolean;
    push_notifications?: boolean;
}

export interface UnreadCountResponse {
    count: number;
}

