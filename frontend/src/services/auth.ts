import { User, LoginCredentials, RegisterData, AuthResponse } from '../types';
import { mockAuthAPI } from './mockAuth';
import { USE_MOCK_API, API_BASE_URL } from './config';

class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

// Реальная реализация API
const realAuthAPI = {
    async login(credentials: LoginCredentials): Promise<AuthResponse> {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(credentials),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Login failed' }));
            throw new ApiError(response.status, errorData.message || 'Login failed');
        }

        return response.json(); // Теперь формат совпадает
    },

    // async login(credentials: LoginCredentials): Promise<AuthResponse> {
    //     const response = await fetch(`${API_BASE_URL}/auth/login`, {
    //         method: 'POST',
    //         headers: {
    //             'Content-Type': 'application/json',
    //         },
    //         body: JSON.stringify(credentials),
    //     });
    //
    //     if (!response.ok) {
    //         const errorData = await response.json().catch(() => ({ message: 'Login failed' }));
    //         throw new ApiError(response.status, errorData.message || 'Login failed');
    //     }
    //
    //     const data = await response.json();
    //     console.log("🔍 Raw login response:", data); // Добавим логирование
    //
    //     return data;
    // },

    async verifyToken(token: string): Promise<User> {
        const response = await fetch(`${API_BASE_URL}/auth/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            throw new ApiError(response.status, 'Token verification failed');
        }

        return response.json();
    },

    async register(userData: RegisterData): Promise<AuthResponse> {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Registration failed' }));
            throw new ApiError(response.status, errorData.message || 'Registration failed');
        }

        return response.json();
    },
};

// Экспортируем моковый или реальный API в зависимости от флага
export const authAPI = USE_MOCK_API ? mockAuthAPI : realAuthAPI;