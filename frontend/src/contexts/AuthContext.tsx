import React, { createContext, useState, useContext, useEffect, useRef, useCallback, useMemo } from 'react';
import { authAPI, setRefreshCallback } from '../services/authAPI';
import { User, AuthResponse } from '../types';

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

    const refreshPromiseRef = useRef<Promise<AuthResponse> | null>(null);
    const initializedRef = useRef(false);

    const refreshTokens = useCallback(async (): Promise<string> => {
        if (refreshPromiseRef.current) {
            const response = await refreshPromiseRef.current;
            return response.access_token;
        }

        try {
            refreshPromiseRef.current = authAPI.refresh();
            const response = await refreshPromiseRef.current;

            setAccessToken(response.access_token);
            return response.access_token;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes('Refresh token missing')) {
                console.error("Token refresh failed:", error);
            }
            throw error;
        } finally {
            refreshPromiseRef.current = null;
        }
    }, []);

    useEffect(() => {
        setRefreshCallback(refreshTokens);
    }, [refreshTokens]);

    const initializeAuth = useCallback(async () => {
        try {
            const token = await refreshTokens();

            if (token) {
                const userData = await authAPI.getCurrentUser(token);
                setUser(userData);
                setAccessToken(token);
            }
        } catch (error) {
        } finally {
            setIsLoading(false);
        }
    }, [refreshTokens]);

    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        void initializeAuth();
    }, [initializeAuth]);

    const login = useCallback(async (email: string, password: string) => {
        try {
            const response = await authAPI.login({ email, password });

            setAccessToken(response.access_token);
            setUser(response.user);
        } catch (error) {
            console.error("Login failed:", error);
            throw error;
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            await authAPI.logout();
        } catch (error) {
            console.error("Logout error:", error);
        } finally {
            setUser(null);
            setAccessToken(null);
        }
    }, []);

    const value: AuthContextType = useMemo(
        () => ({
            user,
            accessToken,
            login,
            logout,
            refreshTokens,
            isLoading,
            isAuthenticated: !!user && !!accessToken,
        }),
        [user, accessToken, login, logout, refreshTokens, isLoading]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};