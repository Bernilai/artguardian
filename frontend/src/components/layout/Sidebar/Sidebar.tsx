import React from "react";
import { Link, useLocation } from "react-router-dom";
import './Sidebar.css';

const menuItems = [
    { path: '/dashboard', label: 'Дашборд', icon: '📊' },
    { path: '/collection', label: 'Коллекция', icon: '🖼️' },
    { path: '/tickets', label: 'Тикеты', icon: '⚠️' },
    { path: '/analytics', label: 'Аналитика', icon: '📈' },
    { path: '/settings', label: 'Настройки', icon: '⚙️' },
];

const Sidebar: React.FC = () => {
    const location = useLocation();

    return (
        <nav className="sidebar">
            <div className="sidebar-header">
                <h2>ArtGuardian</h2>
            </div>
            <ul className="sidebar-menu">
                {menuItems.map(item => (
                    <li key={item.path}>
                        <Link
                            to={item.path}
                            className={location.pathname === item.path ? 'active' : ''}
                        >
                            <span className="icon">{item.icon}</span>
                            <span className="label">{item.label}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
};
export default Sidebar;