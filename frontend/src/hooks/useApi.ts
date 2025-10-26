import { useState, useEffect } from 'react';
import { Artifact } from '../types/artifacts';
import { apiService } from '../services/api';

export const useApi = () => {
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchArtifacts = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await apiService.fetchArtifacts();
            setArtifacts(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error occurred');
            console.error('Failed to fetch artifacts:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchArtifactById = async (id: string): Promise<Artifact | null> => {
        try {
            return await apiService.fetchArtifactById(id);
        } catch (err) {
            console.error(`Failed to fetch artifact ${id}:`, err);
            return null;
        }
    };

    useEffect(() => {
        fetchArtifacts();
    }, []);

    return {
        artifacts,
        loading,
        error,
        refetch: fetchArtifacts,
        fetchArtifactById
    };
};