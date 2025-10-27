// contexts/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { authAPI, setRefreshCallback } from '../services/authAPI';
import { User, AuthResponse } from '../types'; // Добавьте AuthResponse в импорт

interface AuthContextType {
    user: User | null;
    accessToken: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshTokens: () => Promise<string>;
    isLoading: boolean;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // 🔥 Исправляем типы - теперь храним Promise<AuthResponse>
    const refreshPromiseRef = useRef<Promise<AuthResponse> | null>(null);
    const initializedRef = useRef(false);

    const refreshTokens = async (): Promise<string> => {
        // 🔥 Если запрос уже выполняется, возвращаем существующий Promise
        if (refreshPromiseRef.current) {
            console.log("🔄 Using existing refresh promise");
            const response = await refreshPromiseRef.current;
            return response.access_token;
        }

        try {
            console.log("🔄 Attempting to refresh tokens...");
            refreshPromiseRef.current = authAPI.refresh();
            const response = await refreshPromiseRef.current;

            console.log("✅ Token refresh response:", response);
            setAccessToken(response.access_token);
            console.log("✅ Tokens refreshed successfully");
            return response.access_token;
        } catch (error) {
            console.error("❌ Token refresh failed:", error);
            throw error;
        } finally {
            // 🔥 Сбрасываем Promise после завершения
            refreshPromiseRef.current = null;
        }
    };

    // 🔥 Регистрируем callback в API service
    useEffect(() => {
        console.log("🔧 Registering refresh callback in API service");
        setRefreshCallback(refreshTokens);
    }, []);

    // Инициализация при загрузке приложения
    useEffect(() => {
        // 🔥 Защита от двойного вызова в StrictMode
        if (initializedRef.current) return;
        initializedRef.current = true;

        console.log("🚀 Initializing auth...");
        initializeAuth();
    }, []);

    const initializeAuth = async () => {
        try {
            console.log("🔐 Starting auth initialization...");
            const token = await refreshTokens();
            console.log("✅ Refresh successful, token:", token ? "received" : "none");

            if (token) {
                console.log("👤 Fetching user data...");
                const userData = await authAPI.getCurrentUser(token);
                console.log("✅ User data received:", userData);
                setUser(userData);
                setAccessToken(token);
            }
        } catch (error) {
            console.log("ℹ️ User not authenticated (normal for first visit):", error);
            // 🔥 Не сбрасываем состояние, если пользователь не авторизован
        } finally {
            console.log("🏁 Auth initialization complete");
            setIsLoading(false);
        }
    };

    const login = async (email: string, password: string) => {
        try {
            console.log("🔐 Attempting login...");
            const response = await authAPI.login({ email, password });
            console.log("✅ Login response:", response);

            setAccessToken(response.access_token);
            setUser(response.user);

            console.log("✅ Login successful");
        } catch (error) {
            console.error("❌ Login failed:", error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            console.log("🚪 Logging out...");
            await authAPI.logout();
        } catch (error) {
            console.error("Logout error:", error);
        } finally {
            setUser(null);
            setAccessToken(null);
            console.log("✅ Logout complete");
        }
    };

    const value: AuthContextType = {
        user,
        accessToken,
        login,
        logout,
        refreshTokens,
        isLoading,
        isAuthenticated: !!user && !!accessToken,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};