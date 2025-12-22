export interface User {
    id: string;
    email: string;
    role: string;
    name: string;
    is_active?: boolean;
    created_at?: string;
}

export interface LoginCredentials {
    email: string;
    password: string;
}

export interface RegisterData {
    email: string;
    password: string;
    name: string;
    role?: string;
}

export interface AuthResponse {
    access_token: string;
    refresh_token: string;
    token_type: string
    user: User;
}