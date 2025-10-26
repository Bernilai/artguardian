import React from 'react';
import './ActionButton.css';

export interface ActionButtonProps {
    icon: string;
    label: string;
    badge?: number;
    onClick?: () => void;
    disabled?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({
                                                       icon,
                                                       label,
                                                       badge,
                                                       onClick,
                                                       disabled = false
                                                   }) => {
    return (
        <button
            className={`action-button ${disabled ? 'action-button--disabled' : ''}`}
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
        >
            <span className="action-button__icon">{icon}</span>
            {badge !== undefined && badge > 0 && (
                <span className="action-button__badge">
          {badge > 99 ? '99+' : badge}
        </span>
            )}
        </button>
    );
};

export default ActionButton;