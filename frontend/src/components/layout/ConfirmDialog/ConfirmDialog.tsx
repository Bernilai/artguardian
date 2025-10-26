import React from 'react';
import { Button } from '../../ui';
import './ConfirmDialog.css';

export interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    type?: 'warning' | 'danger' | 'info';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
                                                                isOpen,
                                                                title,
                                                                message,
                                                                confirmText = 'Подтвердить',
                                                                cancelText = 'Отмена',
                                                                onConfirm,
                                                                onCancel,
                                                                type = 'warning'
                                                            }) => {
    if (!isOpen) return null;

    const getConfirmVariant = (): 'primary' | 'secondary' | 'outline' => {
        switch (type) {
            case 'danger':
            case 'warning':
            default:
                return 'primary';
        }
    };

    const getConfirmIcon = () => {
        switch (type) {
            case 'danger': return '🚨';
            case 'warning': return '⚠️';
            default: return 'ℹ️';
        }
    };

    return (
        <div className="confirm-dialog-overlay">
            <div className="confirm-dialog">
                <div className="confirm-dialog__header">
                    <h3 className="confirm-dialog__title">{title}</h3>
                    <span className="confirm-dialog__icon">{getConfirmIcon()}</span>
                </div>

                <div className="confirm-dialog__content">
                    <p className="confirm-dialog__message">{message}</p>
                </div>

                <div className="confirm-dialog__actions">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        size="medium"
                        fullWidth
                    >
                        {cancelText}
                    </Button>
                    <Button
                        variant={getConfirmVariant()}
                        onClick={onConfirm}
                        size="medium"
                        fullWidth
                        icon={getConfirmIcon()}
                    >
                        {confirmText}
                    </Button>
                </div>
            </div>
        </div>
    );
};