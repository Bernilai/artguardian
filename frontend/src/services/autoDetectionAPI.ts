import { apiService } from './api';

export interface AutoDetectionStatus {
    available: boolean;
    message: string;
}

export interface AutoDetectionResult {
    success: boolean;
    detected: boolean;
    damage_count: number;
    damage_percentage: number;
    detections_created: number;
    ticket_created: boolean;
    detection_ids: string[];
}

/**
 * API service for automatic damage detection using ArtDet model.
 * This is an optional feature - manual detection remains the primary method.
 */
export const autoDetectionAPI = {
    /**
     * Check if automatic detection service is available.
     */
    async getStatus(token?: string): Promise<AutoDetectionStatus> {
        return apiService.get<AutoDetectionStatus>(
            '/auto-detection/status',
            token
        );
    },

    /**
     * Automatically detect damage in an artifact image.
     * 
     * @param artifactId - ID of the artifact to analyze
     * @param createTickets - If true, automatically create tickets for detected damage (default: false)
     * @param minConfidence - Minimum confidence threshold 0.0-1.0 (default: 0.9)
     * @param token - Authentication token
     * @returns Detection results with damage information
     */
    async detectDamage(
        artifactId: string,
        createTickets: boolean = false,
        minConfidence: number = 0.9,
        token?: string
    ): Promise<AutoDetectionResult> {
        const params = new URLSearchParams({
            create_tickets: createTickets.toString(),
            min_confidence: minConfidence.toString(),
        });

        return apiService.post<AutoDetectionResult>(
            `/auto-detection/artifact/${artifactId}/auto-detect?${params.toString()}`,
            {},
            token
        );
    },
};

