import { apiService } from './api';

export interface AIPreferences {
    id: string;
    user_id: string;
    auto_create_tickets: boolean;
    min_confidence: number;
    enabled: boolean;
    created_at: string;
    updated_at?: string;
}

export interface AIPreferencesUpdate {
    auto_create_tickets: boolean;
    min_confidence: number;
    enabled: boolean;
}

/**
 * API service for AI preferences management.
 */
export const aiPreferencesAPI = {
    /**
     * Get AI preferences for current user.
     */
    async getPreferences(token?: string): Promise<AIPreferences> {
        return apiService.get<AIPreferences>(
            '/ai/preferences',
            token
        );
    },

    /**
     * Update AI preferences for current user.
     */
    async updatePreferences(
        preferences: AIPreferencesUpdate,
        token?: string
    ): Promise<AIPreferences> {
        return apiService.put<AIPreferences>(
            '/ai/preferences',
            preferences,
            token
        );
    },
};

