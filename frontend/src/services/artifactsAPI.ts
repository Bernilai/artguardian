import { apiService } from './api';
import { Artifact, ArtifactStatus, ArtifactsResponse } from '../types';

// Type for creating artifact (matches backend schema)
export interface CreateArtifactRequest {
    title: string;
    description?: string;
    inventory_number: string;
    collection: string;
    current_location?: string;
    dimensions?: string; // JSON string
    materials?: string; // JSON string
    image_path?: string; // MinIO object path
    status?: string; // Status: no_defects, has_defects, requires_attention, under_restoration
    creation_date?: string; // Дата создания артефакта (может быть приблизительной "XVIII век")
}

export const artifactsAPI = {
    async fetchArtifacts(
        params?: {
            q?: string;
            status?: ArtifactStatus | 'all';
            collection?: string;
            page?: number;
            pageSize?: number;
            sortBy?: 'created_at' | 'title' | 'status';
            sortDir?: 'asc' | 'desc';
        },
        token?: string,
        signal?: AbortSignal
    ): Promise<ArtifactsResponse> {
        const queryParams: Record<string, any> = {};

        if (params?.q) queryParams.q = params.q;
        if (params?.status && params.status !== 'all') queryParams.status = params.status;
        if (params?.collection) queryParams.collection = params.collection;

        if (params?.page !== undefined) queryParams.page = params.page;
        if (params?.pageSize !== undefined) queryParams.pageSize = params.pageSize;
        if (params?.sortBy) queryParams.sortBy = params.sortBy;
        if (params?.sortDir) queryParams.sortDir = params.sortDir;

        // Trailing slash avoids Starlette 307 redirect to /artifacts/ (doubles requests in DevTools).
        return apiService.getWithParams<ArtifactsResponse>('/artifacts/', queryParams, token, signal);
    },

    async fetchArtifactById(id: string, token?: string): Promise<Artifact> {
        return apiService.get<Artifact>(`/artifacts/${id}`, token);
    },

    async createArtifact(artifact: CreateArtifactRequest, token?: string): Promise<Artifact> {
        return apiService.post<Artifact>('/artifacts', artifact, token);
    },

    async updateArtifact(id: string, artifact: CreateArtifactRequest, token?: string): Promise<Artifact> {
        return apiService.put<Artifact>(`/artifacts/${id}`, artifact, token);
    },

    async deleteArtifact(id: string, token?: string): Promise<void> {
        return apiService.delete(`/artifacts/${id}`, token);
    },

    async inspectArtifact(id: string, token?: string): Promise<Artifact> {
        return apiService.post<Artifact>(`/artifacts/${id}/inspect`, {}, token);
    },
};