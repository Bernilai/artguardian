import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { analyticsAPI } from '../../services';
import { LoadingSpinner, Seo } from '../../components';
import './Analytics.css';

interface AnalyticsData {
    overview: any;
    trends: any;
    restoration: any;
}

const Analytics: React.FC = () => {
    const { accessToken } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [trendDays, setTrendDays] = useState(30);

    const loadAnalytics = useCallback(async () => {
        if (!accessToken) return;
        
        try {
            setLoading(true);
            setError(null);
            
            const [overview, trends, restoration] = await Promise.all([
                analyticsAPI.getOverview(accessToken),
                analyticsAPI.getTrends(trendDays, accessToken),
                analyticsAPI.getRestoration(accessToken)
            ]);
            
            setData({ overview, trends, restoration });
        } catch (err) {
            console.error('Failed to load analytics:', err);
            setError('Не удалось загрузить аналитику');
        } finally {
            setLoading(false);
        }
    }, [accessToken, trendDays]);

    useEffect(() => {
        void loadAnalytics();
    }, [loadAnalytics]);

    const getStatusLabel = (status: string): string => {
        const labels: Record<string, string> = {
            'no_defects': 'Без дефектов',
            'has_defects': 'С дефектами',
            'requires_attention': 'Требует внимания',
            'under_restoration': 'На реставрации',
            'exhibited': 'Экспонируется',
            // Ticket statuses
            'open': 'Открыт',
            'in_progress': 'В работе',
            'completed': 'Завершен'
        };
        return labels[status] || status;
    };

    const getPriorityLabel = (priority: string): string => {
        const labels: Record<string, string> = {
            'low': 'Низкий',
            'medium': 'Средний',
            'high': 'Высокий',
            'urgent': 'Срочный'
        };
        return labels[priority] || priority;
    };

    const renderBarChart = (items: Array<{ name?: string; type?: string; restorer?: string; count: number }>, maxValue: number) => {
        return (
            <div className="bar-chart">
                {items.map((item, index) => {
                    const label = item.name || item.type || item.restorer || 'Неизвестно';
                    const percentage = maxValue > 0 ? (item.count / maxValue) * 100 : 0;
                    return (
                        <div key={index} className="bar-chart-item">
                            <div className="bar-chart-label">{label}</div>
                            <div className="bar-chart-bar-container">
                                <div 
                                    className="bar-chart-bar" 
                                    style={{ width: `${percentage}%` }}
                                >
                                    <span className="bar-chart-value">{item.count}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderPieChart = (data: Record<string, number>, colors: Record<string, string>) => {
        const total = Object.values(data).reduce((sum, val) => sum + val, 0);
        if (total === 0) return <div className="no-data">Нет данных</div>;
        
        // Build conic gradient for pie chart
        const entries = Object.entries(data).filter(([_, value]) => value > 0);
        let currentPercent = 0;
        const gradientStops: string[] = [];
        
        entries.forEach(([key, value]) => {
            const percentage = (value / total) * 100;
            const color = colors[key] || '#ccc';
            gradientStops.push(`${color} ${currentPercent}% ${currentPercent + percentage}%`);
            currentPercent += percentage;
        });
        
        return (
            <div className="pie-chart">
                <div 
                    className="pie-chart-inner"
                    style={{
                        background: `conic-gradient(${gradientStops.join(', ')})`
                    }}
                >
                    <div className="pie-chart-center">
                        <div className="pie-chart-total">{total}</div>
                        <div className="pie-chart-label">Всего</div>
                    </div>
                </div>
                <div className="pie-chart-legend">
                    {entries.map(([key, value]) => (
                        <div key={key} className="legend-item">
                            <span 
                                className="legend-color" 
                                style={{ backgroundColor: colors[key] || '#ccc' }}
                            />
                            <span className="legend-label">{getStatusLabel(key)}</span>
                            <span className="legend-value">{value} ({Math.round((value / total) * 100)}%)</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="analytics-page">
                <Seo
                    title="Аналитика"
                    description="Аналитика коллекции и реставрации: тренды, обзор и отчёты ArtGuardian."
                    canonicalPath="/analytics"
                />
                <div className="page-header">
                    <h1>Аналитика</h1>
                </div>
                <LoadingSpinner text="Загрузка аналитики..." />
            </div>
        );
    }

    if (error) {
        return (
            <div className="analytics-page">
                <Seo
                    title="Аналитика"
                    description="Аналитика коллекции и реставрации: тренды, обзор и отчёты ArtGuardian."
                    canonicalPath="/analytics"
                />
                <div className="page-header">
                    <h1>Аналитика</h1>
                </div>
                <div className="error-message">{error}</div>
            </div>
        );
    }

    if (!data) {
        return null;
    }

    const { overview, trends, restoration } = data;

    return (
        <div className="analytics-page">
            <Seo
                title="Аналитика"
                description="Аналитика коллекции и реставрации: тренды, обзор и отчёты ArtGuardian."
                canonicalPath="/analytics"
            />
            <div className="page-header">
                <h1>Аналитика</h1>
                <div className="page-controls">
                    <label>
                        Период трендов:
                        <select 
                            value={trendDays} 
                            onChange={(e) => setTrendDays(Number(e.target.value))}
                        >
                            <option value={7}>7 дней</option>
                            <option value={30}>30 дней</option>
                            <option value={90}>90 дней</option>
                            <option value={180}>180 дней</option>
                        </select>
                    </label>
                </div>
            </div>

            {/* Overview Statistics */}
            <div className="analytics-section">
                <h2>Общая статистика</h2>
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-value">{overview.artifacts.total}</div>
                        <div className="stat-label">Всего артефактов</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{overview.tickets.total}</div>
                        <div className="stat-label">Всего тикетов</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{overview.tickets.completed}</div>
                        <div className="stat-label">Завершено тикетов</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{overview.detections.total}</div>
                        <div className="stat-label">Всего обнаружений</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{overview.detections.critical}</div>
                        <div className="stat-label">Критических обнаружений</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">
                            {overview.tickets.total > 0 
                                ? Math.round((overview.tickets.completed / overview.tickets.total) * 100)
                                : 0}%
                        </div>
                        <div className="stat-label">Процент завершения</div>
                    </div>
                </div>
            </div>

            {/* Artifacts by Status */}
            <div className="analytics-section">
                <h2>Распределение артефактов по статусам</h2>
                <div className="chart-container">
                    {renderPieChart(overview.artifacts.by_status, {
                        'no_defects': '#4caf50',
                        'has_defects': '#f44336',
                        'requires_attention': '#ff9800',
                        'under_restoration': '#2196f3',
                        'exhibited': '#9c27b0'
                    })}
                </div>
            </div>

            {/* Artifacts by Collection */}
            {overview.artifacts.by_collection.length > 0 && (
                <div className="analytics-section">
                    <h2>Артефакты по коллекциям</h2>
                    <div className="chart-container">
                        {renderBarChart(
                            overview.artifacts.by_collection,
                            Math.max(...overview.artifacts.by_collection.map((c: { name: string; count: number }) => c.count))
                        )}
                    </div>
                </div>
            )}

            {/* Tickets by Status */}
            <div className="analytics-section">
                <h2>Распределение тикетов по статусам</h2>
                <div className="chart-container">
                    {renderPieChart(overview.tickets.by_status, {
                        'open': '#2196f3',
                        'in_progress': '#ff9800',
                        'completed': '#4caf50'
                    })}
                </div>
            </div>

            {/* Tickets by Priority */}
            {Object.keys(overview.tickets.by_priority).length > 0 && (
                <div className="analytics-section">
                    <h2>Тикеты по приоритетам</h2>
                    <div className="chart-container">
                        {renderBarChart(
                            Object.entries(overview.tickets.by_priority).map(([priority, count]) => ({
                                name: getPriorityLabel(priority),
                                count: count as number
                            })),
                            Math.max(...Object.values(overview.tickets.by_priority) as number[])
                        )}
                    </div>
                </div>
            )}

            {/* Detections by Type */}
            {overview.detections.by_type.length > 0 && (
                <div className="analytics-section">
                    <h2>Обнаружения по типам</h2>
                    <div className="chart-container">
                        {renderBarChart(
                            overview.detections.by_type,
                            Math.max(...overview.detections.by_type.map((d: { type: string; count: number }) => d.count))
                        )}
                    </div>
                </div>
            )}

            {/* Restoration Analytics */}
            <div className="analytics-section">
                <h2>Аналитика реставрации</h2>
                <div className="restoration-stats">
                    <div className="restoration-stat-item">
                        <div className="restoration-stat-label">Среднее время завершения</div>
                        <div className="restoration-stat-value">
                            {restoration.average_completion_days 
                                ? `${restoration.average_completion_days} дней`
                                : 'Нет данных'}
                        </div>
                    </div>
                    <div className="restoration-stat-item">
                        <div className="restoration-stat-label">Завершено за 30 дней</div>
                        <div className="restoration-stat-value">{restoration.recent_completions_30d}</div>
                    </div>
                </div>

                {restoration.tickets_by_restorer.length > 0 && (
                    <div className="chart-container">
                        <h3>Завершенные тикеты по реставраторам</h3>
                        {renderBarChart(
                            restoration.tickets_by_restorer,
                            Math.max(...restoration.tickets_by_restorer.map((r: { restorer: string; count: number }) => r.count))
                        )}
                    </div>
                )}

                {restoration.priority_completion.length > 0 && (
                    <div className="chart-container">
                        <h3>Процент завершения по приоритетам</h3>
                        <div className="completion-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Приоритет</th>
                                        <th>Всего</th>
                                        <th>Завершено</th>
                                        <th>Процент</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {restoration.priority_completion.map((item: { priority: string; total: number; completed: number; completion_rate: number }, index: number) => (
                                        <tr key={index}>
                                            <td>{getPriorityLabel(item.priority)}</td>
                                            <td>{item.total}</td>
                                            <td>{item.completed}</td>
                                            <td>
                                                <div className="completion-bar-container">
                                                    <div 
                                                        className="completion-bar"
                                                        style={{ width: `${item.completion_rate}%` }}
                                                    >
                                                        {item.completion_rate}%
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Trends */}
            <div className="analytics-section">
                <h2>Тренды за {trendDays} дней</h2>
                <div className="trends-grid">
                    <div className="trend-card">
                        <h3>Создано артефактов</h3>
                        <div className="trend-value">
                            {trends.artifacts_created.reduce((sum: number, item: any) => sum + item.count, 0)}
                        </div>
                    </div>
                    <div className="trend-card">
                        <h3>Создано тикетов</h3>
                        <div className="trend-value">
                            {trends.tickets_created.reduce((sum: number, item: any) => sum + item.count, 0)}
                        </div>
                    </div>
                    <div className="trend-card">
                        <h3>Завершено тикетов</h3>
                        <div className="trend-value">
                            {trends.tickets_completed.reduce((sum: number, item: any) => sum + item.count, 0)}
                        </div>
                    </div>
                    <div className="trend-card">
                        <h3>Обнаружений</h3>
                        <div className="trend-value">
                            {trends.detections_created.reduce((sum: number, item: any) => sum + item.count, 0)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
