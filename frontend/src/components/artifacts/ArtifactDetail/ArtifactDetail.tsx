import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {Artifact, Defect} from "../../../types";
import {StatusBadge, LoadingSpinner} from "../../ui";
import { useAuth } from "../../../contexts";
import {
    FALLBACK_ARTIFACT_IMAGE_SRC,
    getArtifactImageUrl,
    primaryArtifactImageUrl,
} from '../artifactImageUrl';
import './ArtifactDetail.css';

const ArtifactDetailHeroImage: React.FC<{ artifact: Artifact }> = ({ artifact }) => {
    const primaryUrl = useMemo(
        () => primaryArtifactImageUrl(artifact),
        [artifact.id, artifact.images]
    );
    const [displaySrc, setDisplaySrc] = useState(() => primaryUrl ?? FALLBACK_ARTIFACT_IMAGE_SRC);

    useEffect(() => {
        setDisplaySrc(primaryUrl ?? FALLBACK_ARTIFACT_IMAGE_SRC);
    }, [artifact.id, primaryUrl]);

    const onError = useCallback(() => {
        setDisplaySrc((prev) => (prev === FALLBACK_ARTIFACT_IMAGE_SRC ? prev : FALLBACK_ARTIFACT_IMAGE_SRC));
    }, []);

    return (
        <img
            src={displaySrc}
            alt={artifact.title}
            fetchPriority="high"
            decoding="async"
            onError={onError}
        />
    );
};

export interface ArtifactDetailProps {
    artifact: Artifact | null;
    loading?: boolean;
    onEdit?: (artifact: Artifact) => void;
    onClose?: () => void;
    onDefectClick?: (defect: Defect) => void;
    onAutoDetect?: (artifact: Artifact) => void;
    autoDetecting?: boolean;
    onInspect?: (artifact: Artifact) => void;
    inspecting?: boolean;
}

const ArtifactDetail: React.FC<ArtifactDetailProps> = ({
                                                           artifact,
                                                           loading = false,
                                                           onEdit,
                                                           onClose,
                                                           onDefectClick,
                                                           onAutoDetect,
                                                           autoDetecting = false,
                                                           onInspect,
                                                           inspecting = false
                                                       }) => {
    const { user } = useAuth();
    const canInspect = user && (user.role === 'restorer' || user.role === 'curator' || user.role === 'admin');
    const showInspectionInfo = canInspect;
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

    return (
        <div className="artifact-detail">
            {/* Заголовок и действия */}
            <div className="artifact-detail__header">
                <div className="artifact-detail__title-section">
                    <h1 className="artifact-detail__title">{artifact.title}</h1>
                    <StatusBadge status={artifact.status} size="large" />
                </div>

                <div className="artifact-detail__actions">
                    {onAutoDetect && artifact?.images && artifact.images.length > 0 && (
                        <button
                            className="btn btn-secondary"
                            onClick={() => onAutoDetect(artifact)}
                            disabled={autoDetecting}
                            title="Автоматическое обнаружение повреждений"
                        >
                            {autoDetecting ? '🤖 Анализ...' : '🤖 AI Анализ'}
                        </button>
                    )}
                    {onInspect && canInspect && (
                        <button
                            className="btn btn-secondary"
                            onClick={() => onInspect(artifact)}
                            disabled={inspecting}
                            title="Зафиксировать проверку артефакта"
                        >
                            {inspecting ? '⏳ Проверка...' : '✓ Зафиксировать проверку'}
                        </button>
                    )}
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
                        <ArtifactDetailHeroImage artifact={artifact} />
                    </div>

                    {artifact.images.length > 1 && (
                        <div className="artifact-detail__thumbnails">
                            {artifact.images.slice(1).map((image, index) => {
                                const thumbSrc = getArtifactImageUrl(image);
                                if (!thumbSrc) return null;
                                return (
                                    <div key={index} className="artifact-detail__thumbnail">
                                        <img
                                            src={thumbSrc}
                                            alt={`${artifact.title}, изображение ${index + 2}`}
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    </div>
                                );
                            })}
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
                            {showInspectionInfo && (
                                <>
                                    <div className="info-item">
                                        <label>Последняя проверка:</label>
                                        <span>
                                            {artifact.lastInspection && artifact.lastInspection !== '' 
                                                ? (() => {
                                                    const date = new Date(artifact.lastInspection);
                                                    return isNaN(date.getTime()) ? artifact.lastInspection : date.toLocaleDateString('ru-RU');
                                                })()
                                                : 'Не указана'}
                                        </span>
                                    </div>
                                    {artifact.lastInspector && (
                                        <div className="info-item">
                                            <label>Проверил:</label>
                                            <span>{artifact.lastInspector}</span>
                                        </div>
                                    )}
                                </>
                            )}
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
                                            <span>Обнаружен: {
                                                defect.detectedDate && defect.detectedDate !== ''
                                                    ? (() => {
                                                        const date = new Date(defect.detectedDate);
                                                        return isNaN(date.getTime()) ? defect.detectedDate : date.toLocaleDateString('ru-RU');
                                                    })()
                                                    : 'Не указана'
                                            }</span>
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
                        {record.date && record.date !== ''
                            ? (() => {
                                const date = new Date(record.date);
                                return isNaN(date.getTime()) ? record.date : date.toLocaleDateString('ru-RU');
                            })()
                            : 'Не указана'}
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