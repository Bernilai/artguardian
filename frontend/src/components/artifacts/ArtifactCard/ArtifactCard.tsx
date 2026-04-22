// src/components/artifacts/ArtifactCard/ArtifactCard.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {Artifact} from "../../../types";
import {
    FALLBACK_ARTIFACT_IMAGE_SRC,
    primaryArtifactImageUrl,
} from '../artifactImageUrl';
import StatusBadge from "../../ui/StatusBadge/StatusBadge";
import './ArtifactCard.css';

export interface ArtifactCardProps {
    artifact: Artifact;
    viewMode?: 'grid' | 'list' | 'compact';
    onClick?: (artifact: Artifact) => void;
    onEdit?: (artifact: Artifact) => void;
    onInspect?: (artifact: Artifact) => void;
}

const ArtifactCard: React.FC<ArtifactCardProps> = ({
                                                       artifact,
                                                       viewMode = 'grid',
                                                       onClick,
                                                       onEdit,
                                                       onInspect
                                                   }) => {
    const handleClick = () => {
        onClick?.(artifact);
    };

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        onEdit?.(artifact);
    };

    const handleInspect = (e: React.MouseEvent) => {
        e.stopPropagation();
        onInspect?.(artifact);
    };

    const primaryUrl = useMemo(() => primaryArtifactImageUrl(artifact), [artifact.id, artifact.images]);
    const [displaySrc, setDisplaySrc] = useState(() => primaryUrl ?? FALLBACK_ARTIFACT_IMAGE_SRC);

    useEffect(() => {
        setDisplaySrc(primaryUrl ?? FALLBACK_ARTIFACT_IMAGE_SRC);
    }, [artifact.id, primaryUrl]);

    const onImgError = useCallback(() => {
        setDisplaySrc((prev) => (prev === FALLBACK_ARTIFACT_IMAGE_SRC ? prev : FALLBACK_ARTIFACT_IMAGE_SRC));
    }, []);

    return (
        <div
            className={`artifact-card artifact-card--${viewMode}`}
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    handleClick();
                }
            }}
        >
            <div className="artifact-card__image-container">
                <img
                    src={displaySrc}
                    alt={artifact.title}
                    className="artifact-card__image"
                    loading="lazy"
                    decoding="async"
                    onError={onImgError}
                />
                <div className="artifact-card__status">
                    <StatusBadge status={artifact.status} size="small" />
                </div>

                <div className="artifact-card__actions">
                    <button
                        className="artifact-card__action-btn"
                        onClick={handleInspect}
                        title="Осмотреть"
                    >
                        🔍
                    </button>
                    <button
                        className="artifact-card__action-btn"
                        onClick={handleEdit}
                        title="Редактировать"
                    >
                        ✏️
                    </button>
                </div>
            </div>

            <div className="artifact-card__content">
                <div className="artifact-card__header">
                    <h3 className="artifact-card__title">{artifact.title}</h3>
                    <span className="artifact-card__inventory">
            {artifact.inventoryNumber}
          </span>
                </div>

                <p className="artifact-card__description">
                    {artifact.description}
                </p>

                <div className="artifact-card__meta">
          <span className="artifact-card__collection">
            {artifact.collection}
          </span>
                    <span className="artifact-card__date">
            {artifact.lastInspection && artifact.lastInspection !== '' 
                ? (() => {
                    const date = new Date(artifact.lastInspection);
                    return isNaN(date.getTime()) ? artifact.lastInspection : date.toLocaleDateString('ru-RU');
                })()
                : 'Не указана'}
          </span>
                </div>

                {artifact.defects.length > 0 && (
                    <div className="artifact-card__defects">
                        {artifact.defects.slice(0, 3).map(defect => (
                            <span
                                key={defect.id}
                                className={`defect-tag defect-tag--${defect.type}`}
                                title={`${defect.type}: ${defect.location}`}
                            >
                {getDefectIcon(defect.type)} {defect.type}
              </span>
                        ))}
                        {artifact.defects.length > 3 && (
                            <span className="defect-tag defect-tag--more">
                +{artifact.defects.length - 3}
              </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// Вспомогательная функция для иконок дефектов
const getDefectIcon = (type: string): string => {
    const icons: Record<string, string> = {
        crack: '🔨',
        stain: '💧',
        discoloration: '🎨',
        peeling: '📜',
        deformation: '⚡',
        abrasion: '↔️',
        corrosion: '⚗️',
        break: '💔',
        other: '❓'
    };
    return icons[type] || '❓';
};

export default ArtifactCard;