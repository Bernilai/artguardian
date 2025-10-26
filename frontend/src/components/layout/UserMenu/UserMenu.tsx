import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../../contexts';
import { ConfirmDialog } from '../ConfirmDialog';
import './UserMenu.css';

export interface UserMenuProps {
    onProfileClick?: () => void;
}

const UserMenu: React.FC<UserMenuProps> = ({ onProfileClick }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const { user, logout } = useAuth();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(part => part.charAt(0))
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const handleLogoutClick = () => {
        setIsOpen(false);
        setShowLogoutConfirm(true);
    };

    const handleConfirmLogout = () => {
        logout();
        setShowLogoutConfirm(false);
    };

    const handleCancelLogout = () => {
        setShowLogoutConfirm(false);
    };

    if (!user) return null;

    return (
        <>
            <div className="user-menu" ref={menuRef}>
                <button
                    className="user-menu__trigger"
                    onClick={() => setIsOpen(!isOpen)}
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                >
                    <div className="user-avatar">
                        <span>{getInitials(user.name)}</span>
                    </div>
                    <div className="user-info">
                        <span className="user-name">{user.name}</span>
                        <span className="user-role">{user.role}</span>
                    </div>
                </button>

                {isOpen && (
                    <div className="user-menu__dropdown">
                        <button
                            className="user-menu__item"
                            onClick={() => {
                                onProfileClick?.();
                                setIsOpen(false);
                            }}
                        >
                            👤 Мой профиль
                        </button>

                        <div className="user-menu__divider"></div>

                        <button
                            className="user-menu__item user-menu__item--logout"
                            onClick={handleLogoutClick}
                        >
                            🔗 Выйти
                        </button>
                    </div>
                )}
            </div>

            <ConfirmDialog
                isOpen={showLogoutConfirm}
                title="Подтверждение выхода"
                message="Вы уверены, что хотите выйти из системы?"
                confirmText="Выйти"
                cancelText="Отмена"
                type="warning"
                onConfirm={handleConfirmLogout}
                onCancel={handleCancelLogout}
            />
        </>
    );
};

export default UserMenu;