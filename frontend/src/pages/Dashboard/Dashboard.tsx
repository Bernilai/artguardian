import React, { useState, useEffect } from 'react';
import { MetricCard, LoadingSpinner } from '../../components';
import { useAuth } from '../../contexts/AuthContext';
import { dashboardAPI } from '../../services';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    const { accessToken } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [metricsData, setMetricsData] = useState({
        total: { value: '0', trend: 'Загрузка...' },
        attention: { value: '0', trend: 'Загрузка...', type: 'warning' as const },
        critical: { value: '0', trend: 'Загрузка...', type: 'critical' as const },
        tickets: { value: '0', trend: 'Загрузка...' }
    });

    useEffect(() => {
        const loadDashboardData = async () => {
            if (!accessToken) return;
            
            try {
                setLoading(true);
                setError(null);
                
                const stats = await dashboardAPI.getStats(accessToken);
                
                setMetricsData({
                    total: {
                        value: stats.total_artifacts.value,
                        trend: stats.total_artifacts.trend
                    },
                    attention: {
                        value: stats.attention_artifacts.value,
                        trend: stats.attention_artifacts.trend,
                        type: 'warning' as const
                    },
                    critical: {
                        value: stats.critical_artifacts.value,
                        trend: stats.critical_artifacts.trend,
                        type: 'critical' as const
                    },
                    tickets: {
                        value: stats.open_tickets.value,
                        trend: stats.open_tickets.trend
                    }
                });
            } catch (err) {
                console.error('Failed to load dashboard data:', err);
                setError('Не удалось загрузить данные дашборда');
            } finally {
                setLoading(false);
            }
        };

        loadDashboardData();
    }, [accessToken]);

    if (loading) {
        return (
            <div className="dashboard">
                <h1 className="dashboard__title">Дашборд</h1>
                <LoadingSpinner text="Загрузка данных..." />
            </div>
        );
    }

    if (error) {
        return (
            <div className="dashboard">
                <h1 className="dashboard__title">Дашборд</h1>
                <div className="error-message">{error}</div>
            </div>
        );
    }

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
                    onClick={() => {
                        // TODO: Навигация к артефактам, требующим внимания
                    }}
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