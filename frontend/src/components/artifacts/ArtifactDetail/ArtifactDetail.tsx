import React from 'react';
import {Artifact, Defect} from "../../../types";
import {StatusBadge, LoadingSpinner} from "../../ui";
import './ArtifactDetail.css';

export interface ArtifactDetailProps {
    artifact: Artifact | null;
    loading?: boolean;
    onEdit?: (artifact: Artifact) => void;
    onClose?: () => void;
    onDefectClick?: (defect: Defect) => void;
}

const ArtifactDetail: React.FC<ArtifactDetailProps> = ({
                                                           artifact,
                                                           loading = false,
                                                           onEdit,
                                                           onClose,
                                                           onDefectClick
                                                       }) => {
    if (loading) {
        return (
            <div className="artifact-detail artifact-detail--loading">
                <LoadingSpinner size="large" text="Загрузка артефакта..." />
            </div>
        );
    }

    if (!artifact) {
        return (
            <div className="artifact-detail artifact-detail--empty">
                <div className="artifact-detail__empty">
                    <div className="empty-icon">🖼️</div>
                    <h3>Артефакт не найден</h3>
                    <p>Выберите артефакт из коллекции для просмотра деталей</p>
                </div>
            </div>
        );
    }

    const mainImage = artifact.images[0] || '/images/placeholder-artifact.jpg';

    return (
        <div className="artifact-detail">
            {/* Заголовок и действия */}
            <div className="artifact-detail__header">
                <div className="artifact-detail__title-section">
                    <h1 className="artifact-detail__title">{artifact.title}</h1>
                    <StatusBadge status={artifact.status} size="large" />
                </div>

                <div className="artifact-detail__actions">
                    <button
                        className="btn btn-outline"
                        onClick={onClose}
                    >
                        ✕ Закрыть
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={() => onEdit?.(artifact)}
                    >
                        ✏️ Редактировать
                    </button>
                </div>
            </div>

            <div className="artifact-detail__content">
                {/* Основное изображение и галерея */}
                <div className="artifact-detail__gallery">
                    <div className="artifact-detail__main-image">
                        <img
                            src={mainImage}
                            alt={artifact.title}
                            onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = '/images/placeholder-artifact.jpg';
                            }}
                        />
                    </div>

                    {artifact.images.length > 1 && (
                        <div className="artifact-detail__thumbnails">
                            {artifact.images.slice(1).map((image, index) => (
                                <div key={index} className="artifact-detail__thumbnail">
                                    <img src={image} alt={`${artifact.title} ${index + 2}`} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Основная информация */}
                <div className="artifact-detail__info">
                    <section className="artifact-detail__section">
                        <h2>Основная информация</h2>
                        <div className="info-grid">
                            <div className="info-item">
                                <label>Инвентарный номер:</label>
                                <span>{artifact.inventoryNumber}</span>
                            </div>
                            <div className="info-item">
                                <label>Коллекция:</label>
                                <span>{artifact.collection}</span>
                            </div>
                            <div className="info-item">
                                <label>Дата создания:</label>
                                <span>{artifact.creationDate}</span>
                            </div>
                            <div className="info-item">
                                <label>Местоположение:</label>
                                <span>{artifact.currentLocation}</span>
                            </div>
                            <div className="info-item">
                                <label>Последняя проверка:</label>
                                <span>{new Date(artifact.lastInspection).toLocaleDateString('ru-RU')}</span>
                            </div>
                        </div>
                    </section>

                    {/* Физические характеристики */}
                    <section className="artifact-detail__section">
                        <h2>Физические характеристики</h2>
                        <div className="info-grid">
                            <div className="info-item">
                                <label>Размеры:</label>
                                <span>
                  {artifact.dimensions.width} × {artifact.dimensions.height}
                                    {artifact.dimensions.depth && ` × ${artifact.dimensions.depth}`}
                                    {artifact.dimensions.unit}
                </span>
                            </div>
                            <div className="info-item">
                                <label>Материалы:</label>
                                <span>{artifact.materials.map(getMaterialLabel).join(', ')}</span>
                            </div>
                            {artifact.weight && (
                                <div className="info-item">
                                    <label>Вес:</label>
                                    <span>{artifact.weight} кг</span>
                                </div>
                            )}
                            {artifact.technique && (
                                <div className="info-item">
                                    <label>Техника:</label>
                                    <span>{artifact.technique}</span>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Описание */}
                    <section className="artifact-detail__section">
                        <h2>Описание</h2>
                        <p className="artifact-detail__description">{artifact.description}</p>
                    </section>

                    {/* Дефекты */}
                    {artifact.defects.length > 0 && (
                        <section className="artifact-detail__section">
                            <h2>Выявленные дефекты ({artifact.defects.length})</h2>
                            <div className="defects-list">
                                {artifact.defects.map(defect => (
                                    <div
                                        key={defect.id}
                                        className={`defect-item defect-item--${defect.severity}`}
                                        onClick={() => onDefectClick?.(defect)}
                                    >
                                        <div className="defect-item__header">
                                            <span className="defect-item__type">{getDefectLabel(defect.type)}</span>
                                            <StatusBadge
                                                status={defect.severity === 'critical' ? 'critical' :
                                                    defect.severity === 'high' ? 'requires_attention' : 'good'}
                                                size="small"
                                            />
                                        </div>
                                        <div className="defect-item__location">
                                            📍 {defect.location}
                                        </div>
                                        {defect.description && (
                                            <p className="defect-item__description">{defect.description}</p>
                                        )}
                                        <div className="defect-item__meta">
                                            <span>Обнаружен: {new Date(defect.detectedDate).toLocaleDateString('ru-RU')}</span>
                                            <span>Прогресс: {defect.progress}%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Теги */}
                    {artifact.tags.length > 0 && (
                        <section className="artifact-detail__section">
                            <h2>Теги</h2>
                            <div className="tags-list">
                                {artifact.tags.map(tag => (
                                    <span key={tag} className="tag">{tag}</span>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* История реставрации */}
                    {artifact.restorationHistory.length > 0 && (
                        <section className="artifact-detail__section">
                            <h2>История реставрации</h2>
                            <div className="restoration-history">
                                {artifact.restorationHistory.map(record => (
                                    <div key={record.id} className="restoration-record">
                                        <div className="restoration-record__header">
                      <span className="restoration-record__date">
                        {new Date(record.date).toLocaleDateString('ru-RU')}
                      </span>
                                            <span className="restoration-record__restorer">
                        {record.restorer}
                      </span>
                                        </div>
                                        <p className="restoration-record__description">{record.description}</p>
                                        <p className="restoration-record__work">{record.workPerformed}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
};

// Вспомогательные функции для локализации
const getMaterialLabel = (material: string): string => {
    const materials: Record<string, string> = {
        'oil_paint': 'Масляная краска',
        'watercolor': 'Акварель',
        'acrylic': 'Акрил',
        'tempera': 'Темпера',
        'canvas': 'Холст',
        'wood': 'Дерево',
        'metal': 'Металл',
        'stone': 'Камень',
        'ceramic': 'Керамика',
        'paper': 'Бумага',
        'textile': 'Текстиль',
        'mixed': 'Смешанная техника',
        'other': 'Другое'
    };
    return materials[material] || material;
};

const getDefectLabel = (defectType: string): string => {
    const defects: Record<string, string> = {
        'crack': 'Трещина',
        'stain': 'Пятно',
        'discoloration': 'Изменение цвета',
        'peeling': 'Отслоение',
        'deformation': 'Деформация',
        'abrasion': 'Истирание',
        'corrosion': 'Коррозия',
        'break': 'Надлом',
        'other': 'Другое'
    };
    return defects[defectType] || defectType;
};

export default ArtifactDetail;