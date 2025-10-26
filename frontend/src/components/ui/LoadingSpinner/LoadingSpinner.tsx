import React from 'react';
import './LoadingSpinner.css';

export interface LoadingSpinnerProps {
    size?: 'small' | 'medium' | 'large';
    color?: 'primary' | 'white' | 'muted';
    text?: string;
    overlay?: boolean;
    fullScreen?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
                                                           size = 'medium',
                                                           color = 'primary',
                                                           text,
                                                           overlay = false,
                                                           fullScreen = false
                                                       }) => {
    const spinner = (
        <div className={`loading-spinner-container ${fullScreen ? 'loading-spinner-container--fullscreen' : ''}`}>
            <div className={`loading-spinner loading-spinner--${size} loading-spinner--${color}`}>
                <div className="loading-spinner__dot"></div>
                <div className="loading-spinner__dot"></div>
                <div className="loading-spinner__dot"></div>
            </div>
            {text && <div className="loading-spinner__text">{text}</div>}
        </div>
    );

    if (overlay) {
        return (
            <div className="loading-spinner-overlay">
                {spinner}
            </div>
        );
    }

    return spinner;
};

export default LoadingSpinner;