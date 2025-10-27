import { apiService } from './api';
import { Artifact } from '../types';

export const artifactsAPI = {
    async fetchArtifacts(token?: string): Promise<Artifact[]> {
        return apiService.get<Artifact[]>('/artifacts', token);
    },

    async fetchArtifactById(id: string, token?: string): Promise<Artifact> {
        return apiService.get<Artifact>(`/artifacts/${id}`, token);
    },

    async createArtifact(artifact: Partial<Artifact>, token?: string): Promise<Artifact> {
        return apiService.post<Artifact>('/artifacts', artifact, token);
    },

    async updateArtifact(id: string, artifact: Partial<Artifact>, token?: string): Promise<Artifact> {
        return apiService.put<Artifact>(`/artifacts/${id}`, artifact, token);
    },

    async deleteArtifact(id: string, token?: string): Promise<void> {
        return apiService.delete(`/artifacts/${id}`, token);
    },

    async searchArtifacts(query: string, token?: string): Promise<Artifact[]> {
        return apiService.getWithParams<Artifact[]>('/artifacts/search', { q: query }, token);
    },
};