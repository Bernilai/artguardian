import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Breadcrumb, QuickActions, ActionButton, UserMenu } from "../";
import NotificationPanel from '../NotificationPanel';
import { useAuth } from '../../../contexts';
import { notificationsAPI } from '../../../services';

const Header: React.FC = () => {
    const { user, accessToken } = useAuth();
    const navigate = useNavigate();
    const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (accessToken) {
            loadUnreadCount();
            // Refresh unread count every 30 seconds
            const interval = setInterval(loadUnreadCount, 30000);
            return () => clearInterval(interval);
        }
    }, [accessToken]);

    const loadUnreadCount = async () => {
        if (!accessToken) return;

        try {
            const response = await notificationsAPI.getUnreadCount(accessToken);
            setUnreadCount(response.count);
        } catch (err) {
            console.error('Error loading unread count:', err);
        }
    };

    const handleNotifications = () => {
        setNotificationPanelOpen(!notificationPanelOpen);
        // Refresh count when opening panel
        if (!notificationPanelOpen && accessToken) {
            loadUnreadCount();
        }
    };

    const handleProfileClick = () => {
        navigate('/profile');
    };

    const handleNotificationPanelClose = () => {
        setNotificationPanelOpen(false);
        // Refresh count when closing panel
        if (accessToken) {
            loadUnreadCount();
        }
    };

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