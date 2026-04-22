import { API_BASE_URL } from './config';

export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'ApiError';
    }
}

export interface RefreshTokenCallback {
    (): Promise<string>;
}

class ApiService {
    private baseURL: string;
    private refreshPromise: Promise<string> | null = null;
    private refreshCallback: RefreshTokenCallback | null = null;

    constructor(baseURL: string) {
        this.baseURL = baseURL;
    }

    setRefreshCallback(callback: RefreshTokenCallback) {
        this.refreshCallback = callback;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${this.baseURL}${endpoint}`;

        // Создаем безопасный объект headers
        const headers = new Headers();
        headers.set('Content-Type', 'application/json');

        // Добавляем переданные заголовки
        if (options.headers) {
            const incomingHeaders = new Headers(options.headers);
            incomingHeaders.forEach((value, key) => {
                headers.set(key, value);
            });
        }

        const config: RequestInit = {
            ...options,
            credentials: 'include',
            headers,
        };

        try {
            const response = await fetch(url, config);

            // Проверяем наличие заголовка X-Retry
            const hasRetryHeader = headers.get('X-Retry') === 'true';

            if (response.status === 401 && !hasRetryHeader) {
                return this.retryRequest<T>(endpoint, options);
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new ApiError(response.status, errorText);
            }

            if (response.status === 204) {
                return {} as T;
            }

            return response.json();
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            // Let callers cancel in-flight requests without treating as a hard failure.
            if (error instanceof Error && error.name === 'AbortError') {
                throw error;
            }
            throw new ApiError(0, `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async retryRequest<T>(
        endpoint: string,
        options: RequestInit
    ): Promise<T> {
        if (!this.refreshCallback) {
            throw new ApiError(401, 'No refresh callback available');
        }

        if (!this.refreshPromise) {
            this.refreshPromise = this.refreshCallback();
        }

        try {
            const newToken = await this.refreshPromise;

            const headers = new Headers(options.headers);
            headers.set('Authorization', `Bearer ${newToken}`);
            headers.set('X-Retry', 'true');

            const retryConfig: RequestInit = {
                ...options,
                headers,
            };

            return this.request<T>(endpoint, retryConfig);
        } catch (error) {
            throw error;
        } finally {
            this.refreshPromise = null;
        }
    }

    async get<T>(
        endpoint: string,
        token?: string,
        signal?: AbortSignal,
        init?: Pick<RequestInit, 'cache'>
    ): Promise<T> {
        const headers = new Headers();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        return this.request<T>(endpoint, {
            method: 'GET',
            headers,
            signal,
            cache: init?.cache ?? 'default',
        });
    }

    async post<T>(endpoint: string, data?: any, token?: string): Promise<T> {
        const headers = new Headers();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        return this.request<T>(endpoint, {
            method: 'POST',
            headers,
            body: data ? JSON.stringify(data) : undefined,
        });
    }

    async put<T>(endpoint: string, data?: any, token?: string): Promise<T> {
        const headers = new Headers();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        return this.request<T>(endpoint, {
            method: 'PUT',
            headers,
            body: data ? JSON.stringify(data) : undefined,
        });
    }

    async patch<T>(endpoint: string, data?: any, token?: string): Promise<T> {
        const headers = new Headers();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        return this.request<T>(endpoint, {
            method: 'PATCH',
            headers,
            body: data ? JSON.stringify(data) : undefined,
        });
    }

    async delete<T>(endpoint: string, token?: string, data?: any): Promise<T> {
        const headers = new Headers();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        const config: RequestInit = {
            method: 'DELETE',
            headers,
        };

        if (data) {
            config.body = JSON.stringify(data);
        }

        return this.request<T>(endpoint, config);
    }

    async getWithParams<T>(
        endpoint: string,
        params: Record<string, any>,
        token?: string,
        signal?: AbortSignal
    ): Promise<T> {
        const queryString = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                if (Array.isArray(value)) {
                    value.forEach(item => queryString.append(key, item.toString()));
                } else {
                    queryString.append(key, value.toString());
                }
            }
        });

        const url = queryString.toString() ? `${endpoint}?${queryString}` : endpoint;
        return this.get<T>(url, token, signal);
    }

    async uploadFile<T>(
        endpoint: string,
        file: File,
        token?: string,
        additionalData: Record<string, any> = {}
    ): Promise<T> {
        const formData = new FormData();
        formData.append('file', file);

        Object.entries(additionalData).forEach(([key, value]) => {
            formData.append(key, value.toString());
        });

        const headers = new Headers();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        return this.request<T>(endpoint, {
            method: 'POST',
            headers,
            body: formData,
        });
    }
}

export const apiService = new ApiService(API_BASE_URL);