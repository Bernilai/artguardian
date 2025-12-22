import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authAPI, notificationsAPI, systemAPI, autoDetectionAPI, aiPreferencesAPI } from '../../services';
import { User, NotificationPreferences } from '../../types';
import { LoadingSpinner, Button } from '../../components';
import type { SystemInfo, PerformanceStats, Backup } from '../../services/systemAPI';
import './Settings.css';

const Settings: React.FC = () => {
    const { accessToken, user: currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState('general');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    
    // Users tab state
    const [users, setUsers] = useState<User[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [showUserForm, setShowUserForm] = useState(false);
    const [includeInactive, setIncludeInactive] = useState(false);
    const [changingPasswordFor, setChangingPasswordFor] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordChanging, setPasswordChanging] = useState(false);
    
    // Notifications tab state
    const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | null>(null);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    const [notificationsSaving, setNotificationsSaving] = useState(false);
    
    // System tab state
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
    const [backups, setBackups] = useState<Backup[]>([]);
    const [systemLoading, setSystemLoading] = useState(false);
    const [backupCreating, setBackupCreating] = useState(false);
    
    // AI tab state
    const [aiPreferences, setAiPreferences] = useState<{
        auto_create_tickets: boolean;
        min_confidence: number;
        enabled: boolean;
    } | null>(null);
    const [aiStatus, setAiStatus] = useState<{ available: boolean; message: string } | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiSaving, setAiSaving] = useState(false);
    
    // General settings state
    const [generalSettings, setGeneralSettings] = useState({
        systemName: 'ArtGuardian',
        language: 'ru',
        timezone: 'Europe/Moscow',
        dateFormat: 'DD.MM.YYYY'
    });

    const tabs = [
        { id: 'general', label: 'Основные', icon: '⚙️' },
        { id: 'users', label: 'Пользователи', icon: '👥' },
        { id: 'ai', label: 'AI Анализ', icon: '🤖' },
        { id: 'notifications', label: 'Уведомления', icon: '🔔' },
        { id: 'system', label: 'Система', icon: '💻' },
    ];

    useEffect(() => {
        if (activeTab === 'users' && accessToken) {
            loadUsers();
        } else if (activeTab === 'notifications' && accessToken) {
            loadNotificationPreferences();
        } else if (activeTab === 'system' && accessToken && currentUser?.role === 'admin') {
            loadSystemData();
        } else if (activeTab === 'ai' && accessToken) {
            loadAIPreferences();
        }
    }, [activeTab, accessToken, includeInactive, currentUser?.role]);

    const loadNotificationPreferences = async () => {
        if (!accessToken) return;
        
        try {
            setNotificationsLoading(true);
            setError(null);
            const preferences = await notificationsAPI.getPreferences(accessToken);
            setNotificationPreferences(preferences);
        } catch (err: any) {
            console.error('Error loading notification preferences:', err);
            setError('Не удалось загрузить настройки уведомлений');
        } finally {
            setNotificationsLoading(false);
        }
    };

    const saveNotificationPreferences = async () => {
        if (!accessToken || !notificationPreferences) return;
        
        try {
            setNotificationsSaving(true);
            setError(null);
            const updated = await notificationsAPI.updatePreferences(
                {
                    ticket_assigned: notificationPreferences.ticket_assigned,
                    ticket_created_unassigned: notificationPreferences.ticket_created_unassigned,
                    artifact_created: notificationPreferences.artifact_created,
                    artifact_status_changed: notificationPreferences.artifact_status_changed,
                    user_created: notificationPreferences.user_created,
                    backup_completed: notificationPreferences.backup_completed,
                    ai_error: notificationPreferences.ai_error,
                    email_notifications: notificationPreferences.email_notifications,
                    push_notifications: notificationPreferences.push_notifications,
                },
                accessToken
            );
            setNotificationPreferences(updated);
            setSuccess('Настройки уведомлений сохранены');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            console.error('Error saving notification preferences:', err);
            setError('Не удалось сохранить настройки уведомлений');
        } finally {
            setNotificationsSaving(false);
        }
    };

    const loadUsers = async () => {
        if (!accessToken) return;
        
        try {
            setUsersLoading(true);
            setError(null);
            const usersList = await authAPI.getUsers(undefined, includeInactive, accessToken);
            setUsers(usersList);
        } catch (err) {
            console.error('Failed to load users:', err);
            setError('Не удалось загрузить пользователей');
        } finally {
            setUsersLoading(false);
        }
    };

    const handleUpdateUser = async (userId: string, updates: { name?: string; role?: string; is_active?: boolean }) => {
        if (!accessToken) return;
        
        try {
            setError(null);
            setSuccess(null);
            const updatedUser = await authAPI.updateUser(userId, updates, accessToken);
            setUsers(users.map(u => u.id === userId ? updatedUser : u));
            setEditingUser(null);
            setSuccess('Пользователь успешно обновлен');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            console.error('Failed to update user:', err);
            const errorMessage = err?.message || (typeof err === 'string' ? err : 'Не удалось обновить пользователя');
            setError(errorMessage);
            setTimeout(() => setError(null), 5000);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!accessToken) return;
        
        if (!window.confirm('Вы уверены, что хотите деактивировать этого пользователя?')) {
            return;
        }
        
        try {
            setError(null);
            setSuccess(null);
            await authAPI.deleteUser(userId, accessToken);
            await loadUsers();
            setSuccess('Пользователь успешно деактивирован');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            console.error('Failed to delete user:', err);
            const errorMessage = err?.message || (typeof err === 'string' ? err : 'Не удалось деактивировать пользователя');
            setError(errorMessage);
            setTimeout(() => setError(null), 5000);
        }
    };

    const handleChangePasswordClick = (userId: string) => {
        setChangingPasswordFor(userId);
        setNewPassword('');
        setConfirmPassword('');
    };

    const handleCancelPasswordChange = () => {
        setChangingPasswordFor(null);
        setNewPassword('');
        setConfirmPassword('');
    };

    const handleSavePasswordChange = async () => {
        if (!accessToken || !changingPasswordFor) return;

        // Validation
        if (!newPassword || !confirmPassword) {
            setError('Все поля обязательны для заполнения');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Пароли не совпадают');
            return;
        }

        if (newPassword.length < 8 || newPassword.length > 32) {
            setError('Пароль должен содержать от 8 до 32 символов');
            return;
        }

        if (newPassword.includes(' ')) {
            setError('Пароль не должен содержать пробелы');
            return;
        }

        const passwordPattern = /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]+$/;
        if (!passwordPattern.test(newPassword)) {
            setError('Пароль должен содержать только латинские буквы, цифры и специальные символы');
            return;
        }

        setPasswordChanging(true);
        setError(null);
        setSuccess(null);

        try {
            const result = await authAPI.adminChangeUserPassword(changingPasswordFor, newPassword, accessToken);
            setSuccess(result.message || 'Пароль успешно изменен');
            setTimeout(() => setSuccess(null), 3000);
            handleCancelPasswordChange();
        } catch (err: any) {
            let errorMessage = 'Не удалось изменить пароль';
            if (err.message) {
                try {
                    const errorData = JSON.parse(err.message);
                    if (errorData.detail) {
                        if (Array.isArray(errorData.detail)) {
                            const firstError = errorData.detail[0];
                            errorMessage = firstError.msg || firstError.message || errorMessage;
                        } else if (typeof errorData.detail === 'string') {
                            errorMessage = errorData.detail;
                        }
                    } else {
                        errorMessage = err.message;
                    }
                } catch {
                    errorMessage = err.message;
                }
            }
            setError(errorMessage);
            setTimeout(() => setError(null), 5000);
        } finally {
            setPasswordChanging(false);
        }
    };

    const loadSystemData = async () => {
        if (!accessToken) return;
        
        try {
            setSystemLoading(true);
            setError(null);
            const [info, stats, backupsList] = await Promise.all([
                systemAPI.getSystemInfo(accessToken),
                systemAPI.getPerformanceStats(accessToken),
                systemAPI.listBackups(accessToken)
            ]);
            setSystemInfo(info);
            setPerformanceStats(stats);
            setBackups(backupsList);
        } catch (err: any) {
            console.error('Error loading system data:', err);
            setError('Не удалось загрузить системную информацию');
        } finally {
            setSystemLoading(false);
        }
    };

    const handleCreateBackup = async () => {
        if (!accessToken) return;
        
        if (!window.confirm('Создать резервную копию базы данных? Это может занять некоторое время.')) {
            return;
        }
        
        try {
            setBackupCreating(true);
            setError(null);
            setSuccess(null);
            const backup = await systemAPI.createBackup(accessToken);
            setSuccess(`Резервная копия создана: ${backup.filename} (${backup.size_formatted})`);
            setTimeout(() => setSuccess(null), 5000);
            // Reload backups list
            const backupsList = await systemAPI.listBackups(accessToken);
            setBackups(backupsList);
        } catch (err: any) {
            console.error('Error creating backup:', err);
            const errorMessage = err?.message || (typeof err === 'string' ? err : 'Не удалось создать резервную копию');
            setError(errorMessage);
            setTimeout(() => setError(null), 5000);
        } finally {
            setBackupCreating(false);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString('ru-RU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const loadAIPreferences = async () => {
        if (!accessToken) return;
        
        try {
            setAiLoading(true);
            setError(null);
            const [preferences, status] = await Promise.all([
                aiPreferencesAPI.getPreferences(accessToken),
                autoDetectionAPI.getStatus(accessToken).catch(() => ({ available: false, message: 'Сервис недоступен' }))
            ]);
            setAiPreferences(preferences);
            setAiStatus(status);
        } catch (err: any) {
            console.error('Error loading AI preferences:', err);
            setError('Не удалось загрузить настройки AI');
        } finally {
            setAiLoading(false);
        }
    };

    const saveAIPreferences = async () => {
        if (!accessToken || !aiPreferences) return;
        
        try {
            setAiSaving(true);
            setError(null);
            setSuccess(null);
            const updated = await aiPreferencesAPI.updatePreferences(
                {
                    auto_create_tickets: aiPreferences.auto_create_tickets,
                    min_confidence: aiPreferences.min_confidence,
                    enabled: aiPreferences.enabled
                },
                accessToken
            );
            setAiPreferences(updated);
            setSuccess('Настройки AI сохранены');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            console.error('Error saving AI preferences:', err);
            setError('Не удалось сохранить настройки AI');
        } finally {
            setAiSaving(false);
        }
    };

    const handleSaveGeneralSettings = async () => {
        // For now, just show success message
        // In the future, this could save to backend
        setSuccess('Настройки сохранены');
        setTimeout(() => setSuccess(null), 3000);
    };

    const getRoleLabel = (role: string): string => {
        const labels: Record<string, string> = {
            'admin': 'Администратор',
            'curator': 'Куратор',
            'restorer': 'Реставратор',
            'viewer': 'Наблюдатель'
        };
        return labels[role] || role;
    };

    return (
        <div className="settings-page">
            <div className="page-header">
                <h1>Настройки системы</h1>
                <p className="page-description">
                    Управление параметрами системы и пользователями
                </p>
            </div>

            {(error || success) && (
                <div className={`settings-message ${error ? 'error' : 'success'}`}>
                    {error || success}
                </div>
            )}

            <div className="settings-content">
                <div className="settings-sidebar">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <span className="tab-icon">{tab.icon}</span>
                            <span className="tab-label">{tab.label}</span>
                        </button>
                    ))}
                </div>

                <div className="settings-main">
                    <div className="settings-panel">
                        {activeTab === 'general' && (
                            <div className="settings-section">
                                <h2>Основные настройки</h2>
                                <p>Настройки общего доступа и базовых параметров системы</p>
                                
                                <div className="settings-form">
                                    <div className="form-group">
                                        <label>Название системы</label>
                                        <input
                                            type="text"
                                            value={generalSettings.systemName}
                                            onChange={(e) => setGeneralSettings({...generalSettings, systemName: e.target.value})}
                                            placeholder="ArtGuardian"
                                        />
                                    </div>
                                    
                                    <div className="form-group">
                                        <label>Язык интерфейса</label>
                                        <select
                                            value={generalSettings.language}
                                            onChange={(e) => setGeneralSettings({...generalSettings, language: e.target.value})}
                                        >
                                            <option value="ru">Русский</option>
                                            <option value="en">English</option>
                                        </select>
                                    </div>
                                    
                                    <div className="form-group">
                                        <label>Часовой пояс</label>
                                        <select
                                            value={generalSettings.timezone}
                                            onChange={(e) => setGeneralSettings({...generalSettings, timezone: e.target.value})}
                                        >
                                            <option value="Europe/Moscow">Москва (UTC+3)</option>
                                            <option value="Europe/Kiev">Киев (UTC+2)</option>
                                            <option value="UTC">UTC</option>
                                        </select>
                                    </div>
                                    
                                    <div className="form-group">
                                        <label>Формат даты</label>
                                        <select
                                            value={generalSettings.dateFormat}
                                            onChange={(e) => setGeneralSettings({...generalSettings, dateFormat: e.target.value})}
                                        >
                                            <option value="DD.MM.YYYY">DD.MM.YYYY</option>
                                            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                                            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                                        </select>
                                    </div>
                                    
                                    <div className="form-actions">
                                        <Button onClick={handleSaveGeneralSettings}>
                                            Сохранить изменения
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'users' && (
                            <div className="settings-section">
                                <div className="settings-section-header">
                                    <div>
                                        <h2>Управление пользователями</h2>
                                        <p>Добавление и настройка прав доступа для сотрудников</p>
                                    </div>
                                    <div className="users-controls">
                                        <label className="checkbox-label">
                                            <input
                                                type="checkbox"
                                                checked={includeInactive}
                                                onChange={(e) => setIncludeInactive(e.target.checked)}
                                            />
                                            Показать неактивных
                                        </label>
                                    </div>
                                </div>
                                
                                {usersLoading ? (
                                    <LoadingSpinner text="Загрузка пользователей..." />
                                ) : (
                                    <div className="users-table-container">
                                        <table className="users-table">
                                            <thead>
                                                <tr>
                                                    <th>Имя</th>
                                                    <th>Email</th>
                                                    <th>Роль</th>
                                                    <th>Статус</th>
                                                    <th>Дата создания</th>
                                                    <th>Действия</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {users.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} className="no-data">
                                                            Нет пользователей
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    users.map(user => (
                                                        <tr key={user.id} className={!user.is_active ? 'inactive' : ''}>
                                                            <td>{user.name}</td>
                                                            <td>{user.email}</td>
                                                            <td>
                                                                {editingUser?.id === user.id ? (
                                                                    <select
                                                                        value={editingUser.role}
                                                                        onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                                                                        className="role-select"
                                                                    >
                                                                        <option value="admin">Администратор</option>
                                                                        <option value="curator">Куратор</option>
                                                                        <option value="restorer">Реставратор</option>
                                                                        <option value="viewer">Наблюдатель</option>
                                                                    </select>
                                                                ) : (
                                                                    getRoleLabel(user.role)
                                                                )}
                                                            </td>
                                                            <td>
                                                                {editingUser?.id === user.id ? (
                                                                    <select
                                                                        value={editingUser.is_active ? 'true' : 'false'}
                                                                        onChange={(e) => setEditingUser({...editingUser, is_active: e.target.value === 'true'})}
                                                                        className="status-select"
                                                                    >
                                                                        <option value="true">Активен</option>
                                                                        <option value="false">Неактивен</option>
                                                                    </select>
                                                                ) : (
                                                                    <span className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}>
                                                                        {user.is_active ? 'Активен' : 'Неактивен'}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td>
                                                                {user.created_at 
                                                                    ? new Date(user.created_at).toLocaleDateString('ru-RU')
                                                                    : 'Не указана'}
                                                            </td>
                                                            <td>
                                                                <div className="user-actions">
                                                                    {changingPasswordFor === user.id ? (
                                                                        <div className="password-change-form">
                                                                            <input
                                                                                type="password"
                                                                                placeholder="Новый пароль"
                                                                                value={newPassword}
                                                                                onChange={(e) => setNewPassword(e.target.value)}
                                                                                disabled={passwordChanging}
                                                                                className="password-input"
                                                                            />
                                                                            <input
                                                                                type="password"
                                                                                placeholder="Подтвердите пароль"
                                                                                value={confirmPassword}
                                                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                                                disabled={passwordChanging}
                                                                                className="password-input"
                                                                            />
                                                                            <button
                                                                                className="btn-icon btn-save"
                                                                                onClick={handleSavePasswordChange}
                                                                                disabled={passwordChanging}
                                                                                title="Сохранить"
                                                                            >
                                                                                ✓
                                                                            </button>
                                                                            <button
                                                                                className="btn-icon btn-cancel"
                                                                                onClick={handleCancelPasswordChange}
                                                                                disabled={passwordChanging}
                                                                                title="Отмена"
                                                                            >
                                                                                ×
                                                                            </button>
                                                                        </div>
                                                                    ) : editingUser?.id === user.id ? (
                                                                        <>
                                                                            <button
                                                                                className="btn-icon btn-save"
                                                                                onClick={() => {
                                                                                    if (editingUser) {
                                                                                        handleUpdateUser(editingUser.id, {
                                                                                            role: editingUser.role,
                                                                                            is_active: editingUser.is_active
                                                                                        });
                                                                                    }
                                                                                }}
                                                                                title="Сохранить"
                                                                            >
                                                                                ✓
                                                                            </button>
                                                                            <button
                                                                                className="btn-icon btn-cancel"
                                                                                onClick={() => setEditingUser(null)}
                                                                                title="Отмена"
                                                                            >
                                                                                ×
                                                                            </button>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <button
                                                                                className="btn-icon btn-edit"
                                                                                onClick={() => setEditingUser(user)}
                                                                                title="Редактировать"
                                                                                disabled={user.id === currentUser?.id}
                                                                            >
                                                                                ✎
                                                                            </button>
                                                                            <button
                                                                                className="btn-icon btn-password"
                                                                                onClick={() => handleChangePasswordClick(user.id)}
                                                                                title="Изменить пароль"
                                                                            >
                                                                                🔑
                                                                            </button>
                                                                            {user.id !== currentUser?.id && (
                                                                                <button
                                                                                    className="btn-icon btn-delete"
                                                                                    onClick={() => handleDeleteUser(user.id)}
                                                                                    title="Деактивировать"
                                                                                    disabled={!user.is_active}
                                                                                >
                                                                                    🗑
                                                                                </button>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'ai' && (
                            <div className="settings-section">
                                <div className="settings-section-header">
                                    <div>
                                        <h2>Настройки AI анализа</h2>
                                        <p>Конфигурация автоматического обнаружения повреждений</p>
                                    </div>
                                    <Button 
                                        onClick={saveAIPreferences}
                                        disabled={aiSaving || !aiPreferences}
                                    >
                                        {aiSaving ? 'Сохранение...' : 'Сохранить'}
                                    </Button>
                                </div>
                                
                                {aiLoading ? (
                                    <LoadingSpinner text="Загрузка настроек..." />
                                ) : aiPreferences ? (
                                    <div className="ai-preferences">
                                        {/* Service Status */}
                                        <div className="ai-status-group">
                                            <h3>Статус сервиса</h3>
                                            <div className={`ai-status-indicator ${aiStatus?.available ? 'available' : 'unavailable'}`}>
                                                <span className="status-icon">
                                                    {aiStatus?.available ? '✓' : '✗'}
                                                </span>
                                                <span className="status-text">
                                                    {aiStatus?.available 
                                                        ? 'AI анализ доступен' 
                                                        : 'AI анализ недоступен'}
                                                </span>
                                            </div>
                                            {aiStatus && (
                                                <p className="status-description">
                                                    {aiStatus.message}
                                                </p>
                                            )}
                                        </div>

                                        {/* General Settings */}
                                        <div className="preferences-group">
                                            <h3>Общие настройки</h3>
                                            <div className="preference-item">
                                                <label className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={aiPreferences.enabled}
                                                        onChange={(e) => setAiPreferences({
                                                            ...aiPreferences,
                                                            enabled: e.target.checked
                                                        })}
                                                    />
                                                    <span>Включить AI анализ</span>
                                                </label>
                                                <p className="preference-description">
                                                    Разрешить использование автоматического обнаружения повреждений
                                                </p>
                                            </div>
                                        </div>

                                        {/* Detection Settings */}
                                        <div className="preferences-group">
                                            <h3>Настройки обнаружения</h3>
                                            <div className="preference-item">
                                                <label className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={aiPreferences.auto_create_tickets}
                                                        onChange={(e) => setAiPreferences({
                                                            ...aiPreferences,
                                                            auto_create_tickets: e.target.checked
                                                        })}
                                                        disabled={!aiPreferences.enabled}
                                                    />
                                                    <span>Автоматически создавать тикеты</span>
                                                </label>
                                                <p className="preference-description">
                                                    При обнаружении повреждений автоматически создавать тикеты на реставрацию
                                                    (только для повреждений более 5% площади изображения)
                                                </p>
                                            </div>
                                            
                                            <div className="preference-item">
                                                <label htmlFor="min-confidence">
                                                    Минимальный порог уверенности: <strong>{aiPreferences.min_confidence.toFixed(2)}</strong>
                                                </label>
                                                <input
                                                    id="min-confidence"
                                                    type="range"
                                                    min="0.5"
                                                    max="1.0"
                                                    step="0.05"
                                                    value={aiPreferences.min_confidence}
                                                    onChange={(e) => setAiPreferences({
                                                        ...aiPreferences,
                                                        min_confidence: parseFloat(e.target.value)
                                                    })}
                                                    disabled={!aiPreferences.enabled}
                                                    className="confidence-slider"
                                                />
                                                <div className="slider-labels">
                                                    <span>0.5 (больше обнаружений)</span>
                                                    <span>1.0 (только высокоуверенные)</span>
                                                </div>
                                                <p className="preference-description">
                                                    Порог уверенности модели для регистрации повреждения. 
                                                    Более высокие значения уменьшают ложные срабатывания, 
                                                    но могут пропустить некоторые повреждения.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Info Box */}
                                        <div className="ai-info-box">
                                            <h4>ℹ️ Важная информация</h4>
                                            <ul>
                                                <li>AI анализ является <strong>дополнительным инструментом</strong>. Ручное обнаружение остается основным методом.</li>
                                                <li>Результаты AI анализа всегда требуют проверки специалистом.</li>
                                                <li>Автоматическое создание тикетов работает только для значительных повреждений (&gt;5% площади).</li>
                                                <li>Для оптимальных результатов рекомендуется использовать порог уверенности 0.85-0.9.</li>
                                            </ul>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="error-message">Не удалось загрузить настройки AI</div>
                                )}
                                {error && <div className="error-message">{error}</div>}
                                {success && <div className="success-message">{success}</div>}
                            </div>
                        )}

                        {activeTab === 'notifications' && (
                            <div className="settings-section">
                                <div className="settings-section-header">
                                    <div>
                                        <h2>Уведомления</h2>
                                        <p>Настройка оповещений о событиях в системе</p>
                                    </div>
                                    <Button 
                                        onClick={saveNotificationPreferences}
                                        disabled={notificationsSaving || !notificationPreferences}
                                    >
                                        {notificationsSaving ? 'Сохранение...' : 'Сохранить'}
                                    </Button>
                                </div>
                                
                                {notificationsLoading ? (
                                    <LoadingSpinner text="Загрузка настроек..." />
                                ) : notificationPreferences ? (
                                    <div className="notification-preferences">
                                        <div className="preferences-group">
                                            <h3>Уведомления о тикетах</h3>
                                            <div className="preference-item">
                                                <label className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={notificationPreferences.ticket_assigned}
                                                        onChange={(e) => setNotificationPreferences({
                                                            ...notificationPreferences,
                                                            ticket_assigned: e.target.checked
                                                        })}
                                                    />
                                                    <span>Назначен тикет</span>
                                                </label>
                                                <p className="preference-description">
                                                    Уведомлять, когда вам назначают тикет на реставрацию
                                                </p>
                                            </div>
                                            <div className="preference-item">
                                                <label className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={notificationPreferences.ticket_created_unassigned}
                                                        onChange={(e) => setNotificationPreferences({
                                                            ...notificationPreferences,
                                                            ticket_created_unassigned: e.target.checked
                                                        })}
                                                    />
                                                    <span>Создан тикет без назначения</span>
                                                </label>
                                                <p className="preference-description">
                                                    Уведомлять о новых тикетах, которые еще не назначены никому
                                                </p>
                                            </div>
                                        </div>

                                        <div className="preferences-group">
                                            <h3>Уведомления об артефактах</h3>
                                            <div className="preference-item">
                                                <label className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={notificationPreferences.artifact_created}
                                                        onChange={(e) => setNotificationPreferences({
                                                            ...notificationPreferences,
                                                            artifact_created: e.target.checked
                                                        })}
                                                    />
                                                    <span>Добавлен новый артефакт</span>
                                                </label>
                                                <p className="preference-description">
                                                    Уведомлять о добавлении новых артефактов в коллекцию
                                                </p>
                                            </div>
                                            <div className="preference-item">
                                                <label className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={notificationPreferences.artifact_status_changed}
                                                        onChange={(e) => setNotificationPreferences({
                                                            ...notificationPreferences,
                                                            artifact_status_changed: e.target.checked
                                                        })}
                                                    />
                                                    <span>Изменен статус артефакта</span>
                                                </label>
                                                <p className="preference-description">
                                                    Уведомлять об изменении статуса артефактов
                                                </p>
                                            </div>
                                        </div>

                                        {(currentUser?.role === 'admin') && (
                                            <div className="preferences-group">
                                                <h3>Административные уведомления</h3>
                                                <div className="preference-item">
                                                    <label className="checkbox-label">
                                                        <input
                                                            type="checkbox"
                                                            checked={notificationPreferences.user_created}
                                                            onChange={(e) => setNotificationPreferences({
                                                                ...notificationPreferences,
                                                                user_created: e.target.checked
                                                            })}
                                                        />
                                                        <span>Создан новый пользователь</span>
                                                    </label>
                                                    <p className="preference-description">
                                                        Уведомлять о регистрации новых пользователей
                                                    </p>
                                                </div>
                                                <div className="preference-item">
                                                    <label className="checkbox-label">
                                                        <input
                                                            type="checkbox"
                                                            checked={notificationPreferences.password_changed}
                                                            onChange={(e) => setNotificationPreferences({
                                                                ...notificationPreferences,
                                                                password_changed: e.target.checked
                                                            })}
                                                        />
                                                        <span>Изменен пароль пользователя</span>
                                                    </label>
                                                    <p className="preference-description">
                                                        Уведомлять когда пользователи изменяют свои пароли или администратор изменяет пароль пользователя
                                                    </p>
                                                </div>
                                                <div className="preference-item">
                                                    <label className="checkbox-label">
                                                        <input
                                                            type="checkbox"
                                                            checked={notificationPreferences.backup_completed}
                                                            onChange={(e) => setNotificationPreferences({
                                                                ...notificationPreferences,
                                                                backup_completed: e.target.checked
                                                            })}
                                                        />
                                                        <span>Завершено резервное копирование</span>
                                                    </label>
                                                    <p className="preference-description">
                                                        Уведомлять о завершении резервного копирования данных
                                                    </p>
                                                </div>
                                                <div className="preference-item">
                                                    <label className="checkbox-label">
                                                        <input
                                                            type="checkbox"
                                                            checked={notificationPreferences.ai_error}
                                                            onChange={(e) => setNotificationPreferences({
                                                                ...notificationPreferences,
                                                                ai_error: e.target.checked
                                                            })}
                                                        />
                                                        <span>Ошибки AI анализа</span>
                                                    </label>
                                                    <p className="preference-description">
                                                        Уведомлять о проблемах с AI анализом изображений (будет добавлено позже)
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        <div className="preferences-group">
                                            <h3>Способы доставки</h3>
                                            <div className="preference-item">
                                                <label className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={notificationPreferences.push_notifications}
                                                        onChange={(e) => setNotificationPreferences({
                                                            ...notificationPreferences,
                                                            push_notifications: e.target.checked
                                                        })}
                                                    />
                                                    <span>Уведомления в приложении</span>
                                                </label>
                                                <p className="preference-description">
                                                    Показывать уведомления в интерфейсе приложения
                                                </p>
                                            </div>
                                            <div className="preference-item">
                                                <label className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={notificationPreferences.email_notifications}
                                                        onChange={(e) => setNotificationPreferences({
                                                            ...notificationPreferences,
                                                            email_notifications: e.target.checked
                                                        })}
                                                    />
                                                    <span>Email уведомления</span>
                                                </label>
                                                <p className="preference-description">
                                                    Отправлять уведомления на email (будет добавлено позже)
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="error-message">Не удалось загрузить настройки уведомлений</div>
                                )}
                                {error && <div className="error-message">{error}</div>}
                                {success && <div className="success-message">{success}</div>}
                            </div>
                        )}

                        {activeTab === 'system' && (
                            <div className="settings-section">
                                <div className="settings-section-header">
                                    <div>
                                        <h2>Системные настройки</h2>
                                        <p>Параметры производительности и резервного копирования</p>
                                    </div>
                                </div>
                                
                                {systemLoading ? (
                                    <LoadingSpinner text="Загрузка системной информации..." />
                                ) : (
                                    <>
                                        {/* System Information */}
                                        <div className="system-info-group">
                                            <h3>Информация о системе</h3>
                                            {systemInfo && (
                                                <div className="system-info-grid">
                                                    <div className="system-info-item">
                                                        <label>Название приложения</label>
                                                        <div>{systemInfo.app_name}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>Окружение</label>
                                                        <div>{systemInfo.environment}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>База данных</label>
                                                        <div>{systemInfo.database.type}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>Версия БД</label>
                                                        <div className="system-info-value-small">{systemInfo.database.version}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>Размер БД</label>
                                                        <div>{systemInfo.database.size}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>Активных подключений</label>
                                                        <div>{systemInfo.database.active_connections}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>MinIO Endpoint</label>
                                                        <div>{systemInfo.minio.endpoint}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>MinIO Bucket</label>
                                                        <div>{systemInfo.minio.bucket}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Statistics */}
                                        <div className="system-info-group">
                                            <h3>Статистика</h3>
                                            {systemInfo && (
                                                <div className="system-info-grid">
                                                    <div className="system-info-item">
                                                        <label>Артефактов</label>
                                                        <div className="system-info-value-large">{systemInfo.counts.artifacts}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>Тикетов</label>
                                                        <div className="system-info-value-large">{systemInfo.counts.tickets}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>Обнаружений</label>
                                                        <div className="system-info-value-large">{systemInfo.counts.detections}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>Пользователей</label>
                                                        <div className="system-info-value-large">{systemInfo.counts.users}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Performance Statistics */}
                                        <div className="system-info-group">
                                            <h3>Производительность</h3>
                                            {performanceStats && (
                                                <div className="system-info-grid">
                                                    <div className="system-info-item">
                                                        <label>Размер пула соединений</label>
                                                        <div>{performanceStats.connection_pool.size}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>Активных соединений</label>
                                                        <div>{performanceStats.connection_pool.checked_out}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>Свободных соединений</label>
                                                        <div>{performanceStats.connection_pool.checked_in}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>Переполнение пула</label>
                                                        <div>{performanceStats.connection_pool.overflow}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>Артефактов за 24ч</label>
                                                        <div>{performanceStats.recent_activity.artifacts_created_24h}</div>
                                                    </div>
                                                    <div className="system-info-item">
                                                        <label>Тикетов за 24ч</label>
                                                        <div>{performanceStats.recent_activity.tickets_created_24h}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Backup Management */}
                                        <div className="system-info-group">
                                            <div className="system-info-group-header">
                                                <h3>Резервное копирование</h3>
                                                <Button
                                                    onClick={handleCreateBackup}
                                                    disabled={backupCreating}
                                                >
                                                    {backupCreating ? 'Создание...' : 'Создать резервную копию'}
                                                </Button>
                                            </div>
                                            <p className="system-info-description">
                                                Резервные копии сохраняются в директории <code>backend/backups</code>
                                            </p>
                                            
                                            {backups.length === 0 ? (
                                                <div className="system-info-empty">
                                                    <p>Резервные копии не найдены</p>
                                                </div>
                                            ) : (
                                                <div className="backups-table-container">
                                                    <table className="backups-table">
                                                        <thead>
                                                            <tr>
                                                                <th>Имя файла</th>
                                                                <th>Размер</th>
                                                                <th>Дата создания</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {backups.map((backup) => (
                                                                <tr key={backup.filename}>
                                                                    <td>
                                                                        <code>{backup.filename}</code>
                                                                    </td>
                                                                    <td>{backup.size_formatted}</td>
                                                                    <td>{formatDate(backup.created_at)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                                {error && <div className="error-message">{error}</div>}
                                {success && <div className="success-message">{success}</div>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
