// src/components/ui/MetricCard/MetricCard.tsx
import React from 'react';
import './MetricCard.css';

export interface MetricCardProps {
    title: string;
    value: string | number;
    trend?: string;
    type?: 'default' | 'warning' | 'critical' | 'success';
    icon?: string;
    onClick?: () => void;
}

const MetricCard: React.FC<MetricCardProps> = ({
                                                   title,
                                                   value,
                                                   trend,
                                                   type = 'default',
                                                   icon,
                                                   onClick
                                               }) => {
    return (
        <div
            className={`metric-card metric-card--${type}`}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
        >
            <div className="metric-card__content">
                <div className="metric-card__header">
                    <span className="metric-card__title">{title}</span>
                    {icon && <span className="metric-card__icon">{icon}</span>}
                </div>

                <div className="metric-card__value">{value}</div>

                {trend && (
                    <div className="metric-card__trend">
                        {trend}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MetricCard;