import { apiService } from './api';
import { Ticket, CreateTicketRequest, UpdateTicketRequest } from '../types/tickets';

export const ticketsAPI = {
    async fetchTickets(
        filters?: {
            status?: string;
            assigned_to?: string;
            artifact_id?: string;
        },
        token?: string
    ): Promise<Ticket[]> {
        return apiService.getWithParams<Ticket[]>('/tickets', filters || {}, token);
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

