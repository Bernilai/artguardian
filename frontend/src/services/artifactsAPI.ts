import { apiService } from './api';
import { Artifact } from '../types';

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
    async fetchArtifacts(searchQuery?: string, token?: string): Promise<Artifact[]> {
        const params = searchQuery ? { q: searchQuery } : {};
        return apiService.getWithParams<Artifact[]>('/artifacts', params, token);
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