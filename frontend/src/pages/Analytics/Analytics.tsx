import React from 'react';
import './Analytics.css';

const Analytics: React.FC = () => {
    return (
        <div className="analytics-page">
            <div className="page-header">
                <h1>Аналитика</h1>
                <p className="page-description">
                    Статистика и аналитические отчеты по состоянию коллекции
                </p>
            </div>

            <div className="analytics-content">
                <div className="analytics-placeholder">
                    <div className="placeholder-icon">📈</div>
                    <h2>Раздел в разработке</h2>
                    <p>Здесь будут отображаться графики и отчеты по:</p>
                    <ul>
                        <li>Динамике состояния артефактов</li>
                        <li>Статистике реставрационных работ</li>
                        <li>Анализу эффективности консервации</li>
                        <li>Отчетам по затратам на реставрацию</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default Analytics;