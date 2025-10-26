import React from 'react';
import { MetricCard } from '../../components';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    const metricsData = {
        total: { value: '247', trend: '+5 за месяц' },
        attention: { value: '18', trend: '3 новых', type: 'warning' as const },
        critical: { value: '5', trend: '+1 за неделю', type: 'critical' as const },
        tickets: { value: '23', trend: '12 в работе' }
    };

    return (
        <div className="dashboard">
            <h1 className="dashboard__title">Дашборд</h1>

            <div className="metrics-grid">
                <MetricCard
                    title="Всего артефактов"
                    value={metricsData.total.value}
                    trend={metricsData.total.trend}
                    icon="🖼️"
                />

                <MetricCard
                    title="Требуют внимания"
                    value={metricsData.attention.value}
                    trend={metricsData.attention.trend}
                    type={metricsData.attention.type}
                    icon="⚠️"
                    onClick={() => console.log('Navigate to attention needed')}
                />

                <MetricCard
                    title="Критические"
                    value={metricsData.critical.value}
                    trend={metricsData.critical.trend}
                    type={metricsData.critical.type}
                    icon="🚨"
                />

                <MetricCard
                    title="Открытые тикеты"
                    value={metricsData.tickets.value}
                    trend={metricsData.tickets.trend}
                    icon="🎫"
                />
            </div>
        </div>
    );
};

export default Dashboard;