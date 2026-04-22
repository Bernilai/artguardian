import type { PaginationInfo } from './artifacts';

export type TicketStatus = 'open' | 'in_progress' | 'completed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Ticket {
    id: string;
    artifact_id: string;
    title: string;
    description?: string;
    status: TicketStatus;
    priority: TicketPriority;
    assigned_to_id?: string;
    created_by_id: string;
    notes?: string;
    created_at: string;
    updated_at?: string;
    completed_at?: string;
    
    // Related data (populated by backend)
    artifact_title?: string;
    assigned_to_name?: string;
    created_by_name?: string;
}

export interface CreateTicketRequest {
    artifact_id: string;
    title: string;
    description?: string;
    priority?: TicketPriority;
    assigned_to_id?: string;
    notes?: string;
}

export interface UpdateTicketRequest {
    title?: string;
    description?: string;
    status?: TicketStatus;
    priority?: TicketPriority;
    assigned_to_id?: string;
    notes?: string;
}

export interface TicketsResponse {
    tickets: Ticket[];
    pagination: PaginationInfo;
}

