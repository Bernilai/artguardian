// src/services/authAPI.ts
import { apiService } from './api';
import { AuthResponse, User, LoginCredentials, RegisterData } from '../types';

let refreshCallback: (() => Promise<string>) | null = null;

export const setRefreshCallback = (callback: () => Promise<string>) => {
    refreshCallback = callback;
    apiService.setRefreshCallback(callback);
};

const authRequest = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
    const url = `${process.env.REACT_APP_API_URL || 'http://localhost:8000/api'}${endpoint}`;

    console.log("🌐 Making auth request:", {
        url,
        method: options.method,
        credentials: 'include',
        hasBody: !!options.body
    });

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

        console.log("📨 Auth response:", {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            ok: response.ok
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ Auth request failed:", errorText);
            throw new Error(errorText);
        }

        if (response.status === 204) {
            return {} as T;
        }

        const data = await response.json();
        console.log("✅ Auth request success:", data);
        return data;
    } catch (error) {
        console.error("💥 Auth request error:", error);
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
};