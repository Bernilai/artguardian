import { Artifact } from '../types';
import { mockApiService } from './mockApi';
import { USE_MOCK_API, API_BASE_URL } from './config';

// Реальная реализация API
const realApiService = {
    async fetchArtifacts(): Promise<Artifact[]> {
        const response = await fetch(`${API_BASE_URL}/artifacts`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.json();
    },

    async fetchArtifactById(id: string): Promise<Artifact> {
        const response = await fetch(`${API_BASE_URL}/artifacts/${id}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.json();
    },
};

// Экспортируем моковый или реальный API в зависимости от флага
export const apiService = USE_MOCK_API ? mockApiService : realApiService;