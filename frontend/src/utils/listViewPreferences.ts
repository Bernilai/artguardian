import type { ArtifactStatus } from '../types';
import type { TicketPriority, TicketStatus } from '../types';

const COLLECTION_KEY = 'artguardian_collection_list_prefs';
const TICKETS_KEY = 'artguardian_tickets_list_prefs';
const LEGACY_COLLECTION_SEARCH_KEY = 'collection_search_query';

export type CollectionViewPrefs = {
    searchQuery: string;
    statusFilter: ArtifactStatus | 'all';
    collectionFilter: string;
    sortBy: 'created_at' | 'title' | 'status';
    sortDir: 'asc' | 'desc';
    page: number;
    pageSize: number;
    viewMode: 'grid' | 'list' | 'compact';
};

export type TicketsViewPrefs = {
    statusFilter: TicketStatus | 'all';
    priorityFilter: TicketPriority | 'all';
    assignedFilter: string;
    artifactQuery: string;
    sortBy: 'created_at' | 'priority';
    sortDir: 'asc' | 'desc';
    page: number;
    pageSize: number;
};

function isArtifactSortBy(v: unknown): v is CollectionViewPrefs['sortBy'] {
    return v === 'created_at' || v === 'title' || v === 'status';
}

function isTicketSortBy(v: unknown): v is TicketsViewPrefs['sortBy'] {
    return v === 'created_at' || v === 'priority';
}

const collectionDefaults: CollectionViewPrefs = {
    searchQuery: '',
    statusFilter: 'all',
    collectionFilter: '',
    sortBy: 'created_at',
    sortDir: 'desc',
    page: 1,
    pageSize: 12,
    viewMode: 'grid',
};

const ticketsDefaults: TicketsViewPrefs = {
    statusFilter: 'all',
    priorityFilter: 'all',
    assignedFilter: '',
    artifactQuery: '',
    sortBy: 'created_at',
    sortDir: 'desc',
    page: 1,
    pageSize: 12,
};

function safeParse(raw: string | null): unknown {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function clampPage(p: unknown): number {
    const n = typeof p === 'number' ? p : parseInt(String(p), 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
}

function clampPageSize(p: unknown, fallback: number, max = 500): number {
    const n = typeof p === 'number' ? p : parseInt(String(p), 10);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.min(n, max);
}

export function loadCollectionViewPrefs(): CollectionViewPrefs {
    const parsed = safeParse(localStorage.getItem(COLLECTION_KEY)) as Partial<CollectionViewPrefs> | null;
    let searchQuery = typeof parsed?.searchQuery === 'string' ? parsed.searchQuery : '';

    if (!parsed && !searchQuery) {
        const legacy = localStorage.getItem(LEGACY_COLLECTION_SEARCH_KEY);
        if (legacy) searchQuery = legacy;
    }

    const rawArtSortBy = parsed?.sortBy;
    const sortBy = isArtifactSortBy(rawArtSortBy) ? rawArtSortBy : collectionDefaults.sortBy;
    const sortDir = parsed?.sortDir === 'asc' || parsed?.sortDir === 'desc' ? parsed.sortDir : collectionDefaults.sortDir;
    const viewMode =
        parsed?.viewMode === 'grid' || parsed?.viewMode === 'list' || parsed?.viewMode === 'compact'
            ? parsed.viewMode
            : collectionDefaults.viewMode;
    const statusFilter = (parsed?.statusFilter ?? collectionDefaults.statusFilter) as CollectionViewPrefs['statusFilter'];
    const collectionFilter = typeof parsed?.collectionFilter === 'string' ? parsed.collectionFilter : '';

    return {
        ...collectionDefaults,
        searchQuery,
        statusFilter: statusFilter || 'all',
        collectionFilter,
        sortBy,
        sortDir,
        page: clampPage(parsed?.page),
        pageSize: clampPageSize(parsed?.pageSize, collectionDefaults.pageSize),
        viewMode,
    };
}

export function saveCollectionViewPrefs(prefs: CollectionViewPrefs): void {
    try {
        localStorage.setItem(COLLECTION_KEY, JSON.stringify(prefs));
        if (prefs.searchQuery) {
            localStorage.setItem(LEGACY_COLLECTION_SEARCH_KEY, prefs.searchQuery);
        } else {
            localStorage.removeItem(LEGACY_COLLECTION_SEARCH_KEY);
        }
    } catch {
        /* ignore quota / private mode */
    }
}

export function loadTicketsViewPrefs(): TicketsViewPrefs {
    const parsed = safeParse(localStorage.getItem(TICKETS_KEY)) as Partial<TicketsViewPrefs> | null;
    const rawTicketSortBy = parsed?.sortBy;
    const sortBy = isTicketSortBy(rawTicketSortBy) ? rawTicketSortBy : ticketsDefaults.sortBy;
    const sortDir = parsed?.sortDir === 'asc' || parsed?.sortDir === 'desc' ? parsed.sortDir : ticketsDefaults.sortDir;

    return {
        ...ticketsDefaults,
        statusFilter: (parsed?.statusFilter ?? ticketsDefaults.statusFilter) as TicketsViewPrefs['statusFilter'],
        priorityFilter: (parsed?.priorityFilter ?? ticketsDefaults.priorityFilter) as TicketsViewPrefs['priorityFilter'],
        assignedFilter: typeof parsed?.assignedFilter === 'string' ? parsed.assignedFilter : '',
        artifactQuery: typeof parsed?.artifactQuery === 'string' ? parsed.artifactQuery : '',
        sortBy,
        sortDir,
        page: clampPage(parsed?.page),
        pageSize: clampPageSize(parsed?.pageSize, ticketsDefaults.pageSize),
    };
}

export function saveTicketsViewPrefs(prefs: TicketsViewPrefs): void {
    try {
        localStorage.setItem(TICKETS_KEY, JSON.stringify(prefs));
    } catch {
        /* ignore */
    }
}
