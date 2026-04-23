import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { notificationsAPI } from '../../../services';
import { Notification } from '../../../types';
import { LoadingSpinner } from '../../ui';
import './NotificationPanel.css';

interface NotificationPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ isOpen, onClose }) => {
    const { accessToken } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const loadNotifications = useCallback(async () => {
        if (!accessToken) return;

        try {
            setLoading(true);
            setError(null);
            const data = await notificationsAPI.getNotifications(false, 20, 0, accessToken);
            setNotifications(data);
        } catch (err: any) {
            console.error('Error loading notifications:', err);
            setError('Не удалось загрузить уведомления');
        } finally {
            setLoading(false);
        }
    }, [accessToken]);

    useEffect(() => {
        if (isOpen && accessToken) {
            void loadNotifications();
        }
    }, [isOpen, accessToken, loadNotifications]);

    // Close panel when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [isOpen, onClose]);

    const handleMarkAsRead = async (notificationId: string) => {
        if (!accessToken) return;

        try {
            await notificationsAPI.updateNotification(notificationId, true, accessToken);
            setNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
            );
        } catch (err) {
            console.error('Error marking notification as read:', err);
        }
    };

    const handleMarkAllRead = async () => {
        if (!accessToken) return;

        try {
            await notificationsAPI.markAllRead(accessToken);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch (err) {
            console.error('Error marking all as read:', err);
        }
    };

    const handleDelete = async (notificationId: string) => {
        if (!accessToken) return;

        try {
            await notificationsAPI.deleteNotification(notificationId, accessToken);
            setNotifications(prev => prev.filter(n => n.id !== notificationId));
        } catch (err) {
            console.error('Error deleting notification:', err);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Только что';
        if (diffMins < 60) return `${diffMins} мин. назад`;
        if (diffHours < 24) return `${diffHours} ч. назад`;
        if (diffDays < 7) return `${diffDays} дн. назад`;
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    };

    const getPriorityClass = (priority: string) => {
        switch (priority) {
            case 'urgent': return 'priority-urgent';
            case 'high': return 'priority-high';
            case 'medium': return 'priority-medium';
            case 'low': return 'priority-low';
            default: return '';
        }
    };

    if (!isOpen) return null;

    const unreadCount = notifications.filter(n => !n.is_read).length;

    return (
        <div className="notification-panel-overlay" onClick={onClose}>
            <div className="notification-panel" ref={panelRef} onClick={(e) => e.stopPropagation()}>
                <div className="notification-panel-header">
                    <h3>Уведомления</h3>
                    {unreadCount > 0 && (
                        <button
                            className="notification-panel-mark-all"
                            onClick={handleMarkAllRead}
                        >
                            Отметить все как прочитанные
                        </button>
                    )}
                </div>

                <div className="notification-panel-content">
                    {loading ? (
                        <div className="notification-panel-loading">
                            <LoadingSpinner text="Загрузка..." />
                        </div>
                    ) : error ? (
                        <div className="notification-panel-error">{error}</div>
                    ) : notifications.length === 0 ? (
                        <div className="notification-panel-empty">
                            <p>Нет уведомлений</p>
                        </div>
                    ) : (
                        <div className="notification-list">
                            {notifications.map(notification => (
                                <div
                                    key={notification.id}
                                    className={`notification-item ${!notification.is_read ? 'unread' : ''} ${getPriorityClass(notification.priority)}`}
                                    onClick={() => !notification.is_read && handleMarkAsRead(notification.id)}
                                >
                                    <div className="notification-item-content">
                                        <div className="notification-item-header">
                                            <h4>{notification.title}</h4>
                                            <span className="notification-item-time">
                                                {formatDate(notification.created_at)}
                                            </span>
                                        </div>
                                        <p className="notification-item-message">{notification.message}</p>
                                    </div>
                                    <div className="notification-item-actions">
                                        {!notification.is_read && (
                                            <span className="notification-item-unread-indicator" />
                                        )}
                                        <button
                                            className="notification-item-delete"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(notification.id);
                                            }}
                                            title="Удалить"
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotificationPanel;

