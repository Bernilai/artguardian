import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { getNavigationForRole } from "../../../types/navigation";
import './Sidebar.css';

const Sidebar: React.FC = () => {
    const location = useLocation();
    const { user } = useAuth();
    
    // Get navigation items filtered by user role
    const userRole = (user?.role || 'viewer') as 'admin' | 'curator' | 'restorer' | 'viewer';
    const menuItems = getNavigationForRole(userRole);

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