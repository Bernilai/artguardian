import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Breadcrumb, QuickActions, ActionButton, UserMenu } from "../";
import NotificationPanel from '../NotificationPanel';
import { useAuth } from '../../../contexts';
import { notificationsAPI } from '../../../services';

const UNREAD_POLL_MS = 30000;

const Header: React.FC = () => {
    const { user, accessToken } = useAuth();
    const navigate = useNavigate();
    const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const unreadFetchInFlightRef = useRef(false);

    const loadUnreadCount = useCallback(async () => {
        if (!accessToken || unreadFetchInFlightRef.current) return;

        unreadFetchInFlightRef.current = true;
        try {
            const response = await notificationsAPI.getUnreadCount(accessToken);
            setUnreadCount(response.count);
        } catch (err) {
            console.error('Error loading unread count:', err);
        } finally {
            unreadFetchInFlightRef.current = false;
        }
    }, [accessToken]);

    useEffect(() => {
        if (!accessToken) return;

        void loadUnreadCount();
        const interval = window.setInterval(() => {
            void loadUnreadCount();
        }, UNREAD_POLL_MS);

        return () => window.clearInterval(interval);
    }, [accessToken, loadUnreadCount]);

    const handleNotifications = useCallback(() => {
        setNotificationPanelOpen((open) => {
            const next = !open;
            if (!open && accessToken) {
                void loadUnreadCount();
            }
            return next;
        });
    }, [accessToken, loadUnreadCount]);

    const handleProfileClick = useCallback(() => {
        navigate('/profile');
    }, [navigate]);

    const handleNotificationPanelClose = useCallback(() => {
        setNotificationPanelOpen(false);
        if (accessToken) {
            void loadUnreadCount();
        }
    }, [accessToken, loadUnreadCount]);

    return (
        <>
            <header className="header">
                <div className="header-left">
                    <Breadcrumb />
                </div>

                <div className="header-right">
                    <QuickActions>
                        <ActionButton
                            icon="🔔"
                            label="Уведомления"
                            badge={unreadCount > 0 ? unreadCount : undefined}
                            onClick={handleNotifications}
                        />
                    </QuickActions>

                    {user && (
                        <UserMenu onProfileClick={handleProfileClick} />
                    )}
                </div>
            </header>

            <NotificationPanel
                isOpen={notificationPanelOpen}
                onClose={handleNotificationPanelClose}
            />
        </>
    );
};

export default Header;