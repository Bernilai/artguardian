import { apiService } from './api';

export interface AnalyticsOverview {
    artifacts: {
        total: number;
        by_status: {
            no_defects: number;
            has_defects: number;
            requires_attention: number;
            under_restoration: number;
            exhibited: number;
        };
        by_collection: Array<{ name: string; count: number }>;
    };
    tickets: {
        total: number;
        open: number;
        completed: number;
        by_status: {
            open: number;
            in_progress: number;
            completed: number;
        };
        by_priority: Record<string, number>;
    };
    detections: {
        total: number;
        critical: number;
        by_type: Array<{ type: string; count: number }>;
    };
}

export interface AnalyticsTrends {
    period_days: number;
    artifacts_created: Array<{ date: string; count: number }>;
    tickets_created: Array<{ date: string; count: number }>;
    tickets_completed: Array<{ date: string; count: number }>;
    detections_created: Array<{ date: string; count: number }>;
}

export interface RestorationAnalytics {
    tickets_by_restorer: Array<{ restorer: string; count: number }>;
    average_completion_days: number | null;
    priority_completion: Array<{
        priority: string;
        total: number;
        completed: number;
        completion_rate: number;
    }>;
    recent_completions_30d: number;
}

export const analyticsAPI = {
    async getOverview(token?: string): Promise<AnalyticsOverview> {
        return apiService.get<AnalyticsOverview>('/analytics/overview', token);
    },

    async getTrends(days: number = 30, token?: string): Promise<AnalyticsTrends> {
        return apiService.getWithParams<AnalyticsTrends>('/analytics/trends', { days }, token);
    },

    async getRestoration(token?: string): Promise<RestorationAnalytics> {
        return apiService.get<RestorationAnalytics>('/analytics/restoration', token);
    },
};

