// src/hooks/useApi.ts
import { useState, useEffect } from 'react';
import { Artifact } from '../types';
import { artifactsAPI } from '../services';
import { useAuth } from '../contexts';

export const useApi = () => {
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { accessToken } = useAuth();

    const fetchArtifacts = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await artifactsAPI.fetchArtifacts(accessToken || undefined);
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
            return await artifactsAPI.fetchArtifactById(id, accessToken || undefined);
        } catch (err) {
            console.error(`Failed to fetch artifact ${id}:`, err);
            return null;
        }
    };

    useEffect(() => {
        if (accessToken) {
            fetchArtifacts();
        }
    }, [accessToken]);

    return {
        artifacts,
        loading,
        error,
        refetch: fetchArtifacts,
        fetchArtifactById
    };
};