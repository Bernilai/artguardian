import { apiService } from './api';

export interface DashboardStats {
    total_artifacts: {
        value: string;
        trend: string;
    };
    attention_artifacts: {
        value: string;
        trend: string;
    };
    critical_artifacts: {
        value: string;
        trend: string;
    };
    open_tickets: {
        value: string;
        trend: string;
    };
}

export const dashboardAPI = {
    async getStats(token?: string): Promise<DashboardStats> {
        return apiService.get<DashboardStats>('/dashboard/stats', token);
    },
};

