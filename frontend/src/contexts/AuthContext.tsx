import React, { createContext, useState, useContext, useEffect } from 'react';
import { authAPI } from '../services';
import { User } from '../types';
import { LoadingSpinner } from "../components";

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
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
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        initializeAuth();
    }, []);

    const initializeAuth = async () => {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
            try {
                const userData = await authAPI.verifyToken(storedToken);
                setUser(userData);
                setToken(storedToken);
            } catch (error) {
                localStorage.removeItem('token');
                setToken(null);
            }
        }
        setIsLoading(false);
    };

    const login = async (email: string, password: string) => {
        try {
            const response = await authAPI.login({ email, password });

            // Используем новые названия полей
            const { access_token: accessToken, refresh_token: refreshToken, user: userData } = response;

            setToken(accessToken);
            setUser(userData);
            localStorage.setItem('token', accessToken);
            localStorage.setItem('refreshToken', refreshToken); // ← Сохраняем refresh token

        } catch (error) {
            throw error;
        }
    };

    // const login = async (email: string, password: string) => {
    //     try {
    //         console.log("📡 Calling authAPI.login...");
    //         const response = await authAPI.login({ email, password });
    //         console.log("📦 AuthAPI response:", response);
    //
    //         const { access_token: newToken, refresh_token: refreshToken, user: userData } = response;
    //
    //         console.log("🔑 Token received:", newToken ? "YES" : "NO");
    //         console.log("👤 User data received:", userData);
    //
    //         setToken(newToken);
    //         setUser(userData);
    //         localStorage.setItem('token', newToken);
    //
    //         console.log("✅ AuthContext state updated");
    //
    //     } catch (error) {
    //         console.error("❌ AuthContext login error:", error);
    //         throw error;
    //     }
    // };

    const logout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
    };

    const value: AuthContextType = {
        user,
        token,
        login,
        logout,
        isLoading,
        isAuthenticated: !!user && !!token,
    };

    if (isLoading) {
        return <LoadingSpinner fullScreen text="Загрузка..." />;
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};