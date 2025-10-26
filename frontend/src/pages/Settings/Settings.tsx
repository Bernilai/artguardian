import React, { useState } from 'react';
import './Settings.css';

const Settings: React.FC = () => {
    const [activeTab, setActiveTab] = useState('general');

    const tabs = [
        { id: 'general', label: 'Основные', icon: '⚙️' },
        { id: 'users', label: 'Пользователи', icon: '👥' },
        { id: 'ai', label: 'AI Анализ', icon: '🤖' },
        { id: 'notifications', label: 'Уведомления', icon: '🔔' },
        { id: 'system', label: 'Система', icon: '💻' },
    ];

    return (
        <div className="settings-page">
            <div className="page-header">
                <h1>Настройки системы</h1>
                <p className="page-description">
                    Управление параметрами системы и пользователями
                </p>
            </div>

            <div className="settings-content">
                <div className="settings-sidebar">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <span className="tab-icon">{tab.icon}</span>
                            <span className="tab-label">{tab.label}</span>
                        </button>
                    ))}
                </div>

                <div className="settings-main">
                    <div className="settings-panel">
                        {activeTab === 'general' && (
                            <div className="settings-section">
                                <h2>Основные настройки</h2>
                                <p>Настройки общего доступа и базовых параметров системы</p>
                                <div className="coming-soon">Раздел в разработке</div>
                            </div>
                        )}

                        {activeTab === 'users' && (
                            <div className="settings-section">
                                <h2>Управление пользователями</h2>
                                <p>Добавление и настройка прав доступа для сотрудников</p>
                                <div className="coming-soon">Раздел в разработке</div>
                            </div>
                        )}

                        {activeTab === 'ai' && (
                            <div className="settings-section">
                                <h2>Настройки AI анализа</h2>
                                <p>Конфигурация алгоритмов компьютерного зрения</p>
                                <div className="coming-soon">Раздел в разработке</div>
                            </div>
                        )}

                        {activeTab === 'notifications' && (
                            <div className="settings-section">
                                <h2>Уведомления</h2>
                                <p>Настройка оповещений о состоянии артефактов</p>
                                <div className="coming-soon">Раздел в разработке</div>
                            </div>
                        )}

                        {activeTab === 'system' && (
                            <div className="settings-section">
                                <h2>Системные настройки</h2>
                                <p>Параметры производительности и резервного копирования</p>
                                <div className="coming-soon">Раздел в разработке</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;