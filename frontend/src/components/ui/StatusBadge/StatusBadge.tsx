import React from 'react';
import './StatusBadge.css';

export type StatusType =
    | 'excellent'          // Отличное
    | 'good'               // Хорошее
    | 'requires_attention' // Требует внимания
    | 'critical'           // Критическое
    | 'under_restoration'  // На реставрации
    | 'storage'            // В хранилище
    | 'exhibited'          // Экспонируется
    | 'open'               // Открыт (для тикетов)
    | 'in_progress'        // В работе (для тикетов)
    | 'completed';         // Завершен (для тикетов)

export interface StatusBadgeProps {
    status: StatusType;
    size?: 'small' | 'medium' | 'large';
    showIcon?: boolean;
    className?: string;
}

const statusConfig = {
    excellent: {
        label: 'Отличное',
        className: 'status--excellent',
        icon: '✅'
    },
    good: {
        label: 'Хорошее',
        className: 'status--good',
        icon: '👍'
    },
    requires_attention: {
        label: 'Требует внимания',
        className: 'status--warning',
        icon: '⚠️'
    },
    critical: {
        label: 'Критическое',
        className: 'status--critical',
        icon: '🚨'
    },
    under_restoration: {
        label: 'На реставрации',
        className: 'status--restoration',
        icon: '🔧'
    },
    storage: {
        label: 'В хранилище',
        className: 'status--storage',
        icon: '📦'
    },
    exhibited: {
        label: 'Экспонируется',
        className: 'status--exhibited',
        icon: '🎨'
    },
    open: {
        label: 'Открыт',
        className: 'status--open',
        icon: '📝'
    },
    in_progress: {
        label: 'В работе',
        className: 'status--in-progress',
        icon: '⚙️'
    },
    completed: {
        label: 'Завершен',
        className: 'status--completed',
        icon: '✅'
    }
};

const StatusBadge: React.FC<StatusBadgeProps> = ({
                                                     status,
                                                     size = 'medium',
                                                     showIcon = true,
                                                     className = ''
                                                 }) => {
    const config = statusConfig[status];

    return (
        <span
            className={`status-badge ${config.className} status-badge--${size} ${className}`}
            title={config.label}
        >
      {showIcon && <span className="status-badge__icon">{config.icon}</span>}
            <span className="status-badge__label">{config.label}</span>
    </span>
    );
};

export default StatusBadge;