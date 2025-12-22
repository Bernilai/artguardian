import React from 'react';
import './StatusBadge.css';

export type StatusType =
    | 'good'               // Хорошее
    | 'requires_attention' // Требует внимания
    | 'critical'           // Критическое
    | 'under_restoration'  // На реставрации
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
    // Map backend status values to frontend status types
    const statusMap: Record<string, StatusType> = {
        'no_defects': 'good',
        'has_defects': 'critical',
        'requires_attention': 'requires_attention',
        'under_restoration': 'under_restoration',
        'exhibited': 'exhibited',
        'good': 'good',
        'critical': 'critical',
        // Ticket statuses
        'open': 'open',
        'in_progress': 'in_progress',
        'completed': 'completed'
    };

    // Normalize status to a known StatusType
    const normalizedStatus = statusMap[status] || status as StatusType;
    const config = statusConfig[normalizedStatus];

    if (!config) {
        // Fallback if config is still undefined
        console.warn(`Unknown status: ${status}, using default`);
        return (
            <span className={`status-badge status-badge--${size} ${className}`}>
                <span className="status-badge__label">{status}</span>
            </span>
        );
    }

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