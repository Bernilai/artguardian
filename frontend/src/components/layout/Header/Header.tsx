import React from 'react';
import { Breadcrumb, QuickActions, ActionButton, UserMenu } from "../";
import { useAuth } from '../../../contexts';

const Header: React.FC = () => {
    const { user } = useAuth();

    const handleSearch = () => {
        console.log('Search clicked');
    };

    const handleNotifications = () => {
        console.log('Notifications clicked');
    };

    const handleHelp = () => {
        console.log('Help clicked');
    };

    const handleProfileClick = () => {
        console.log('Profile clicked');
    };

    return (
        <header className="header">
            <div className="header-left">
                <Breadcrumb />
            </div>

            <div className="header-right">
                <QuickActions>
                    <ActionButton
                        icon="🔍"
                        label="Поиск"
                        onClick={handleSearch}
                    />
                    <ActionButton
                        icon="🔔"
                        label="Уведомления"
                        badge={3}
                        onClick={handleNotifications}
                    />
                    <ActionButton
                        icon="❓"
                        label="Помощь"
                        onClick={handleHelp}
                    />
                </QuickActions>

                {user && (
                    <UserMenu onProfileClick={handleProfileClick} />
                )}
            </div>
        </header>
    );
};

export default Header;