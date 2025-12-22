import { apiService } from './api';
import { Notification, NotificationPreferences, NotificationPreferencesUpdate, UnreadCountResponse } from '../types';

export const notificationsAPI = {
    /**
     * Get notifications for current user
     */
    async getNotifications(
        unreadOnly: boolean = false,
        limit: number = 50,
        skip: number = 0,
        token?: string
    ): Promise<Notification[]> {
        const endpoint = `/notifications?unread=${unreadOnly}&limit=${limit}&skip=${skip}`;
        return apiService.get<Notification[]>(endpoint, token);
    },

    /**
     * Get count of unread notifications
     */
    async getUnreadCount(token?: string): Promise<UnreadCountResponse> {
        return apiService.get<UnreadCountResponse>('/notifications/unread-count', token);
    },

    /**
     * Update notification (mark as read/unread)
     */
    async updateNotification(
        notificationId: string,
        isRead: boolean,
        token?: string
    ): Promise<Notification> {
        return apiService.put<Notification>(`/notifications/${notificationId}`, { is_read: isRead }, token);
    },

    /**
     * Delete a notification
     */
    async deleteNotification(notificationId: string, token?: string): Promise<void> {
        return apiService.delete(`/notifications/${notificationId}`, token);
    },

    /**
     * Mark all notifications as read
     */
    async markAllRead(token?: string): Promise<{ marked: number }> {
        return apiService.post<{ marked: number }>('/notifications/mark-all-read', {}, token);
    },

    /**
     * Get notification preferences for current user
     */
    async getPreferences(token?: string): Promise<NotificationPreferences> {
        return apiService.get<NotificationPreferences>('/notifications/preferences', token);
    },

    /**
     * Update notification preferences
     */
    async updatePreferences(
        preferences: NotificationPreferencesUpdate,
        token?: string
    ): Promise<NotificationPreferences> {
        return apiService.put<NotificationPreferences>('/notifications/preferences', preferences, token);
    },
};

