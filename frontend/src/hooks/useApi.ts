import { useState, useCallback, useRef } from 'react';
import { Artifact, ArtifactStatus, PaginationInfo } from '../types';
import { artifactsAPI } from '../services';
import { useAuth } from '../contexts';

export const useApi = () => {
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [pagination, setPagination] = useState<PaginationInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { accessToken } = useAuth();

    const abortRef = useRef<AbortController | null>(null);
    const requestSeqRef = useRef(0);

    const fetchArtifacts = useCallback(
        async (params?: {
            q?: string;
            status?: ArtifactStatus | 'all';
            collection?: string;
            page?: number;
            pageSize?: number;
            sortBy?: 'created_at' | 'title' | 'status';
            sortDir?: 'asc' | 'desc';
        }) => {
            const seq = ++requestSeqRef.current;
            abortRef.current?.abort();
            const ac = new AbortController();
            abortRef.current = ac;

            try {
                setLoading(true);
                setError(null);

                const data = await artifactsAPI.fetchArtifacts(
                    params,
                    accessToken || undefined,
                    ac.signal
                );

                if (seq !== requestSeqRef.current) return;

                setArtifacts(data.artifacts);
                setPagination(data.pagination);
            } catch (err) {
                if (seq !== requestSeqRef.current) return;
                if (err instanceof Error && err.name === 'AbortError') return;

                setError(err instanceof Error ? err.message : 'Unknown error occurred');
                console.error('Failed to fetch artifacts:', err);
            } finally {
                if (seq === requestSeqRef.current) {
                    setLoading(false);
                }
            }
        },
        [accessToken]
    );

    const fetchArtifactById = useCallback(
        async (id: string): Promise<Artifact | null> => {
            try {
                return await artifactsAPI.fetchArtifactById(id, accessToken || undefined);
            } catch (err) {
                console.error(`Failed to fetch artifact ${id}:`, err);
                return null;
            }
        },
        [accessToken]
    );

    return {
        artifacts,
        pagination,
        loading,
        error,
        refetch: fetchArtifacts,
        fetchArtifactById
    };
};
