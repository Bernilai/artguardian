import { API_BASE_URL } from './config';
import { apiService } from './api';
import { AuthResponse, User, LoginCredentials, RegisterData, PaginationInfo } from '../types';

export interface PaginatedUsersResponse {
    users: User[];
    pagination: PaginationInfo;
}

let refreshCallback: (() => Promise<string>) | null = null;

export const setRefreshCallback = (callback: () => Promise<string>) => {
    refreshCallback = callback;
    apiService.setRefreshCallback(callback);
};

const authRequest = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
    const url = `${API_BASE_URL}${endpoint}`;

    const config: RequestInit = {
        ...options,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    };

    try {
        const response = await fetch(url, config);

        if (!response.ok) {
            const errorText = await response.text();
            // Don't log 401 errors for refresh endpoint (expected on first visit)
            if (response.status !== 401 || !endpoint.includes('/refresh')) {
                console.error("Auth request failed:", errorText);
            }
            throw new Error(errorText);
        }

        if (response.status === 204) {
            return {} as T;
        }

        return await response.json();
    } catch (error) {
        // Don't log 401 errors for refresh endpoint (expected on first visit)
        if (!(error instanceof Error && error.message.includes('Refresh token missing'))) {
            console.error("Auth request error:", error);
        }
        throw error;
    }
};

export const authAPI = {
    async login(credentials: LoginCredentials): Promise<AuthResponse> {
        return authRequest<AuthResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials),
        });
    },

    async register(userData: RegisterData): Promise<User> {
        return authRequest<User>('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData),
        });
    },

    async refresh(): Promise<AuthResponse> {
        return authRequest<AuthResponse>('/auth/refresh', {
            method: 'POST',
        });
    },

    async logout(): Promise<void> {
        return authRequest<void>('/auth/logout', {
            method: 'POST',
        });
    },

    async getCurrentUser(token?: string): Promise<User> {
        const headers: HeadersInit = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return authRequest<User>('/auth/me', {
            method: 'GET',
            headers,
        });
    },

    async getUsers(
        role?: string,
        includeInactive?: boolean,
        token?: string,
        opts?: { page?: number; pageSize?: number }
    ): Promise<PaginatedUsersResponse> {
        const headers: HeadersInit = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const params = new URLSearchParams();
        if (role) params.append('role', role);
        if (includeInactive) params.append('include_inactive', 'true');
        if (opts?.page != null) params.append('page', String(opts.page));
        if (opts?.pageSize != null) params.append('pageSize', String(opts.pageSize));

        const url = params.toString() ? `/auth/users?${params}` : '/auth/users';
        return authRequest<PaginatedUsersResponse>(url, {
            method: 'GET',
            headers,
        });
    },

    async updateUser(userId: string, userData: { name?: string; role?: string; is_active?: boolean }, token?: string): Promise<User> {
        const headers: HeadersInit = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return authRequest<User>(`/auth/users/${userId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(userData),
        });
    },

    async deleteUser(userId: string, token?: string): Promise<void> {
        const headers: HeadersInit = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return authRequest<void>(`/auth/users/${userId}`, {
            method: 'DELETE',
            headers,
        });
    },

    async changePassword(currentPassword: string, newPassword: string, token?: string): Promise<{ message: string }> {
        const headers: HeadersInit = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return authRequest<{ message: string }>('/auth/change-password', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword,
            }),
        });
    },

    async adminChangeUserPassword(userId: string, newPassword: string, token?: string): Promise<{ message: string }> {
        const headers: HeadersInit = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return authRequest<{ message: string }>(`/auth/users/${userId}/change-password`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                new_password: newPassword,
            }),
        });
    },
};