import React, { useState } from 'react';
import {ArtifactList, LoadingSpinner} from "../../components";
import './Collection.css';
import {useApi} from "../../hooks";

const Collection: React.FC = () => {
    const { artifacts, loading, error } = useApi();
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');

    const handleArtifactClick = (artifact: any) => {
        console.log('Clicked artifact:', artifact);
        // Навигация к деталям артефакта
    };

    const handleEditArtifact = (artifact: any) => {
        console.log('Edit artifact:', artifact);
        // Открытие формы редактирования
    };

    const handleInspectArtifact = (artifact: any) => {
        console.log('Inspect artifact:', artifact);
        // Открытие инструментов осмотра
    };

    if (loading) {
        return (
            <div className="collection-page">
                <LoadingSpinner size="large" text="Загрузка коллекции..." />
            </div>
        );
    }

    if (error) {
        return (
            <div className="collection-page">
                <div className="error-message">
                    <h2>Ошибка загрузки</h2>
                    <p>{error}</p>
                    <button onClick={() => window.location.reload()}>
                        Попробовать снова
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="collection-page">
            <div className="page-header">
                <h1>Коллекция артефактов</h1>
                <div className="page-actions">
                    <button className="btn btn-primary">
                        ➕ Добавить артефакт
                    </button>
                </div>
            </div>

            {/* Способы отображения списка */}
            <div className="view-controls">
                <div className="view-toggle">
                    <button
                        className={viewMode === 'grid' ? 'active' : ''}
                        onClick={() => setViewMode('grid')}
                    >
                        ⏹️ Сетка
                    </button>
                    <button
                        className={viewMode === 'list' ? 'active' : ''}
                        onClick={() => setViewMode('list')}
                    >
                        📋 Список
                    </button>
                    <button
                        className={viewMode === 'compact' ? 'active' : ''}
                        onClick={() => setViewMode('compact')}
                    >
                        📱 Компактно
                    </button>
                </div>

                <div className="results-info">
                    Найдено артефактов: {artifacts.length}
                </div>
            </div>

            <ArtifactList
                artifacts={artifacts}
                viewMode={viewMode}
                onArtifactClick={handleArtifactClick}
                onEditArtifact={handleEditArtifact}
                onInspectArtifact={handleInspectArtifact}
            />
        </div>
    );
};

export default Collection;