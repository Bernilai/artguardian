import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts';
import { LoadingSpinner } from '../ui';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRole?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
                                                                  children,
                                                                  requiredRole
                                                              }) => {
    const { isAuthenticated, user, isLoading } = useAuth();
    const location = useLocation();

    console.log("🛡️ ProtectedRoute check:", {
        isLoading,
        isAuthenticated,
        user: user?.email
    });

    if (isLoading) {
        console.log("⏳ ProtectedRoute: Still loading...");
        return <LoadingSpinner fullScreen text="Проверка авторизации..." />;
    }

    if (!isAuthenticated) {
        console.log("🚫 ProtectedRoute: Not authenticated, redirecting to login");
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (requiredRole && user?.role !== requiredRole && user?.role !== 'admin') {
        console.log("🚫 ProtectedRoute: Insufficient permissions");
        return <Navigate to="/unauthorized" replace />;
    }

    console.log("✅ ProtectedRoute: Access granted");
    return <>{children}</>;
};