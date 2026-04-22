import { apiService } from './api';
import { Ticket, CreateTicketRequest, UpdateTicketRequest, TicketsResponse } from '../types/tickets';

export const ticketsAPI = {
    async fetchTickets(
        params?: {
            status?: string;
            priority?: string;
            assigned_to?: string;
            artifact_id?: string;
            artifact_q?: string;
            page?: number;
            pageSize?: number;
            sortBy?: 'created_at' | 'priority' | 'status';
            sortDir?: 'asc' | 'desc';
        },
        token?: string
    ): Promise<TicketsResponse> {
        const queryParams: Record<string, any> = {};
        if (!params) params = {};

        if (params.status) queryParams.status = params.status;
        if (params.priority) queryParams.priority = params.priority;
        if (params.assigned_to) queryParams.assigned_to = params.assigned_to;
        if (params.artifact_id) queryParams.artifact_id = params.artifact_id;
        if (params.artifact_q) queryParams.artifact_q = params.artifact_q;

        if (params.page !== undefined) queryParams.page = params.page;
        if (params.pageSize !== undefined) queryParams.pageSize = params.pageSize;
        if (params.sortBy) queryParams.sortBy = params.sortBy;
        if (params.sortDir) queryParams.sortDir = params.sortDir;

        return apiService.getWithParams<TicketsResponse>('/tickets', queryParams, token);
    },

    async fetchTicketById(id: string, token?: string): Promise<Ticket> {
        return apiService.get<Ticket>(`/tickets/${id}`, token);
    },

    async createTicket(ticket: CreateTicketRequest, token?: string): Promise<Ticket> {
        return apiService.post<Ticket>('/tickets', ticket, token);
    },

    async updateTicket(id: string, ticket: UpdateTicketRequest, token?: string): Promise<Ticket> {
        return apiService.put<Ticket>(`/tickets/${id}`, ticket, token);
    },

    async deleteTicket(id: string, token?: string): Promise<void> {
        return apiService.delete(`/tickets/${id}`, token);
    },
};

