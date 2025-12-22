import { apiService } from './api';

export interface SystemInfo {
    database: {
        type: string;
        version: string;
        size: string;
        active_connections: number;
    };
    minio: {
        endpoint: string;
        bucket: string;
        secure: boolean;
    };
    counts: {
        artifacts: number;
        tickets: number;
        detections: number;
        users: number;
    };
    app_name: string;
    environment: string;
}

export interface PerformanceStats {
    connection_pool: {
        size: number;
        checked_in: number;
        checked_out: number;
        overflow: number;
    };
    recent_activity: {
        artifacts_created_24h: number;
        tickets_created_24h: number;
    };
}

export interface Backup {
    filename: string;
    size: number;
    size_formatted: string;
    created_at: string;
}

export interface BackupCreateResponse {
    success: boolean;
    filename: string;
    path: string;
    size: number;
    size_formatted: string;
    created_at: string;
}

export const systemAPI = {
    /**
     * Get system information
     */
    async getSystemInfo(token?: string): Promise<SystemInfo> {
        return apiService.get<SystemInfo>('/system/info', token);
    },

    /**
     * Get performance statistics
     */
    async getPerformanceStats(token?: string): Promise<PerformanceStats> {
        return apiService.get<PerformanceStats>('/system/performance', token);
    },

    /**
     * Create a database backup
     */
    async createBackup(token?: string): Promise<BackupCreateResponse> {
        return apiService.post<BackupCreateResponse>('/system/backup/create', {}, token);
    },

    /**
     * List available backups
     */
    async listBackups(token?: string): Promise<Backup[]> {
        return apiService.get<Backup[]>('/system/backup/list', token);
    },
};

