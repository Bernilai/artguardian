import React from 'react';
import './Button.css';

export interface ButtonProps {
    children: React.ReactNode;
    variant?: 'primary' | 'secondary' | 'outline';
    size?: 'small' | 'medium' | 'large';
    icon?: string;
    onClick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    fullWidth?: boolean;
    loading?: boolean;
}

const Button: React.FC<ButtonProps> = ({
                                           children,
                                           variant = 'primary',
                                           size = 'medium',
                                           icon,
                                           onClick,
                                           disabled = false,
                                           type = 'button',
                                           fullWidth = false,
                                           loading = false
                                       }) => {
    const className = [
        'btn',
        `btn--${variant}`,
        `btn--${size}`,
        fullWidth ? 'btn--full-width' : '',
        loading ? 'btn--loading' : ''
    ].filter(Boolean).join(' ');

    return (
        <button
            type={type}
            className={className}
            onClick={onClick}
            disabled={disabled || loading}
        >
            {icon && <span className="btn__icon">{icon}</span>}
            {children}
        </button>
    );
};

export default Button;