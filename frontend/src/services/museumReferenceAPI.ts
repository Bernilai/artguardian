import { apiService } from './api';
import type { PaginationInfo } from '../types';

export interface MuseumReferenceObject {
    object_id: number;
    title: string;
    artist_display: string | null;
    object_date: string | null;
    primary_image_small: string;
    object_url: string | null;
}

export interface MuseumInspirationResponse {
    available: boolean;
    source: string;
    departments_count: number | null;
    items: MuseumReferenceObject[];
    error_message: string | null;
    seed: string | null;
    pagination: PaginationInfo | null;
}

function normalizePagination(raw: unknown): PaginationInfo | null {
    if (!raw || typeof raw !== 'object') return null;
    const p = raw as Record<string, unknown>;
    const currentPage = Number(p.currentPage ?? p.current_page);
    const totalPages = Number(p.totalPages ?? p.total_pages);
    const totalItems = Number(p.totalItems ?? p.total_items);
    const itemsPerPage = Number(p.itemsPerPage ?? p.items_per_page);
    if ([currentPage, totalPages, totalItems, itemsPerPage].some((n) => Number.isNaN(n))) {
        return null;
    }
    return { currentPage, totalPages, totalItems, itemsPerPage };
}

export const museumReferenceAPI = {
    async getInspiration(
        token: string,
        params?: { page?: number; pageSize?: number; seed?: string; bustCache?: boolean }
    ): Promise<MuseumInspirationResponse> {
        const q = new URLSearchParams();
        if (params?.page != null) q.set('page', String(params.page));
        if (params?.pageSize != null) q.set('pageSize', String(params.pageSize));
        if (params?.seed) q.set('seed', params.seed);
        if (params?.bustCache) q.set('_', String(Date.now()));
        const suffix = q.toString() ? `?${q}` : '';
        const raw = await apiService.get<MuseumInspirationResponse>(
            `/museum/inspiration${suffix}`,
            token,
            undefined,
            { cache: 'no-store' }
        );
        return {
            ...raw,
            pagination: normalizePagination(raw.pagination),
        };
    },
};
