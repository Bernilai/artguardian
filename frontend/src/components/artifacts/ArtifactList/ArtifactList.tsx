import React from 'react';
import {Artifact} from "../../../types";
import {ArtifactCard} from "../index";
import './ArtifactList.css';

export interface ArtifactListProps {
    artifacts: Artifact[];
    viewMode?: 'grid' | 'list' | 'compact';
    onArtifactClick?: (artifact: Artifact) => void;
    onEditArtifact?: (artifact: Artifact) => void;
    onInspectArtifact?: (artifact: Artifact) => void;
    emptyMessage?: string;
}

const ArtifactList: React.FC<ArtifactListProps> = ({
                                                       artifacts,
                                                       viewMode = 'grid',
                                                       onArtifactClick,
                                                       onEditArtifact,
                                                       onInspectArtifact,
                                                       emptyMessage = 'Артефакты не найдены'
                                                   }) => {
    if (artifacts.length === 0) {
        return (
            <div className="artifact-list__empty">
                <div className="artifact-list__empty-icon">🖼️</div>
                <h3>{emptyMessage}</h3>
                <p>Попробуйте изменить параметры поиска или фильтры</p>
            </div>
        );
    }

    return (
        <div className={`artifact-list artifact-list--${viewMode}`}>
            {artifacts.map(artifact => (
                <ArtifactCard
                    key={artifact.id}
                    artifact={artifact}
                    viewMode={viewMode}
                    onClick={onArtifactClick}
                    onEdit={onEditArtifact}
                    onInspect={onInspectArtifact}
                />
            ))}
        </div>
    );
};

export default ArtifactList;