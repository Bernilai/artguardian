import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authAPI } from '../../services';
import { LoadingSpinner, Button } from '../../components';
import './Profile.css';

const Profile: React.FC = () => {
    const { user, accessToken } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        // Validation
        if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
            setError('Все поля обязательны для заполнения');
            return;
        }

        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setError('Новые пароли не совпадают');
            return;
        }

        if (passwordForm.newPassword.length < 8 || passwordForm.newPassword.length > 32) {
            setError('Пароль должен содержать от 8 до 32 символов');
            return;
        }

        // Check for spaces
        if (passwordForm.newPassword.includes(' ')) {
            setError('Пароль не должен содержать пробелы');
            return;
        }

        // Check for only Latin letters, numbers, and special characters
        const passwordPattern = /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]+$/;
        if (!passwordPattern.test(passwordForm.newPassword)) {
            setError('Пароль должен содержать только латинские буквы, цифры и специальные символы');
            return;
        }

        if (!accessToken) {
            setError('Требуется авторизация');
            return;
        }

        setLoading(true);
        try {
            await authAPI.changePassword(
                passwordForm.currentPassword,
                passwordForm.newPassword,
                accessToken
            );
            setSuccess('Пароль успешно изменен');
            setPasswordForm({
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
            });
        } catch (err: any) {
            let errorMessage = 'Не удалось изменить пароль';
            
            // Try to extract error from response
            if (err.message) {
                try {
                    // Try parsing as JSON first
                    const errorData = JSON.parse(err.message);
                    if (errorData.detail) {
                        // Handle validation errors array
                        if (Array.isArray(errorData.detail)) {
                            const firstError = errorData.detail[0];
                            errorMessage = firstError.msg || firstError.message || errorMessage;
                        } else if (typeof errorData.detail === 'string') {
                            errorMessage = errorData.detail;
                        } else {
                            errorMessage = JSON.stringify(errorData.detail);
                        }
                    } else {
                        errorMessage = err.message;
                    }
                } catch {
                    // If not JSON, use the message as-is
                    errorMessage = err.message;
                }
            }
            
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'Не указано';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('ru-RU', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        } catch {
            return 'Не указано';
        }
    };

    const getRoleLabel = (role: string) => {
        const roleLabels: Record<string, string> = {
            admin: 'Администратор',
            curator: 'Куратор',
            restorer: 'Реставратор',
            viewer: 'Наблюдатель',
        };
        return roleLabels[role] || role;
    };

    if (!user) {
        return (
            <div className="profile-page">
                <div className="error-message">
                    <p>Пользователь не найден</p>
                </div>
            </div>
        );
    }

    return (
        <div className="profile-page">
            <div className="profile-header">
                <h1>Мой профиль</h1>
            </div>

            <div className="profile-content">
                <div className="profile-section">
                    <h2>Информация об аккаунте</h2>
                    <div className="profile-info">
                        <div className="info-row">
                            <span className="info-label">Имя:</span>
                            <span className="info-value">{user.name}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Email:</span>
                            <span className="info-value">{user.email}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Роль:</span>
                            <span className="info-value">{getRoleLabel(user.role)}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Дата регистрации:</span>
                            <span className="info-value">{formatDate(user.created_at)}</span>
                        </div>
                    </div>
                </div>

                <div className="profile-section">
                    <h2>Изменение пароля</h2>
                    <form onSubmit={handlePasswordChange} className="password-form">
                        {error && (
                            <div className="error-message">
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className="success-message">
                                {success}
                            </div>
                        )}
                        
                        <div className="form-group">
                            <label htmlFor="currentPassword">Текущий пароль</label>
                            <input
                                type="password"
                                id="currentPassword"
                                value={passwordForm.currentPassword}
                                onChange={(e) =>
                                    setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                                }
                                disabled={loading}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="newPassword">Новый пароль</label>
                            <input
                                type="password"
                                id="newPassword"
                                value={passwordForm.newPassword}
                                onChange={(e) =>
                                    setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                                }
                                disabled={loading}
                                required
                                minLength={8}
                                maxLength={32}
                            />
                            <small>От 8 до 32 символов</small>
                        </div>

                        <div className="form-group">
                            <label htmlFor="confirmPassword">Подтвердите новый пароль</label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={passwordForm.confirmPassword}
                                onChange={(e) =>
                                    setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                                }
                                disabled={loading}
                                required
                            />
                        </div>

                        <div className="submit-button-wrapper">
                            <Button
                                type="submit"
                                disabled={loading}
                            >
                                {loading ? <LoadingSpinner size="small" /> : 'Изменить пароль'}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Profile;

