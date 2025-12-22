import React, { useEffect } from 'react';
import './Toast.css';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
    message: string;
    type: ToastType;
    onClose: () => void;
    duration?: number;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose, duration = 5000 }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    return (
        <div className={`toast toast--${type}`}>
            <div className="toast__content">
                <span className="toast__icon">
                    {type === 'success' && '✓'}
                    {type === 'error' && '✕'}
                    {type === 'info' && 'ℹ'}
                </span>
                <span className="toast__message">{message}</span>
            </div>
            <button className="toast__close" onClick={onClose} aria-label="Закрыть">
                ×
            </button>
        </div>
    );
};

export default Toast;

