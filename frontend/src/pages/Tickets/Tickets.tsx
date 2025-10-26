import React from 'react';
import './Tickets.css';

const Tickets: React.FC = () => {
    return (
        <div className="tickets-page">
            <div className="page-header">
                <h1>Реставрационные тикеты</h1>
                <button className="btn btn-primary">
                    🎫 Создать тикет
                </button>
            </div>

            <div className="tickets-content">
                <div className="tickets-placeholder">
                    <div className="placeholder-icon">⚠️</div>
                    <h2>Система тикетов в разработке</h2>
                    <p>Этот раздел будет содержать:</p>
                    <div className="features-grid">
                        <div className="feature-card">
                            <h3>Создание тикетов</h3>
                            <p>Автоматическое создание тикетов при обнаружении дефектов</p>
                        </div>
                        <div className="feature-card">
                            <h3>Назначение реставраторов</h3>
                            <p>Распределение задач между специалистами</p>
                        </div>
                        <div className="feature-card">
                            <h3>Отслеживание прогресса</h3>
                            <p>Мониторинг статуса реставрационных работ</p>
                        </div>
                        <div className="feature-card">
                            <h3>История работ</h3>
                            <p>Полный архив выполненных реставраций</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Tickets;