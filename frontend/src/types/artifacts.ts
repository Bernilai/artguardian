export type DefectType =
    | 'crack'
    | 'stain'
    | 'discoloration'
    | 'peeling'
    | 'deformation'
    | 'abrasion'
    | 'corrosion'
    | 'break'
    | 'other';

export type DefectSeverity =
    | 'low'
    | 'medium'
    | 'high'
    | 'critical'

export interface Defect {
    id: string;
    type: DefectType;
    severity: DefectSeverity;
    location: string;
    description?: string;
    detectedDate: string;
    lastInspectionDate?: string;
    progress: number;
    images?: string[];
    notes?: string;
    isActive: boolean;
}

export type MaterialType =
    | 'oil_paint'
    | 'watercolor'
    | 'acrylic'
    | 'tempera'
    | 'canvas'
    | 'wood'
    | 'metal'
    | 'stone'
    | 'ceramic'
    | 'paper'
    | 'textile'
    | 'mixed'
    | 'other';

export type ArtifactStatus =
    | 'good'
    | 'requires_attention'
    | 'critical'
    | 'under_restoration'
    | 'exhibited';

export type HistoricalPeriod =
    | 'ancient'
    | 'medieval'
    | 'renaissance'
    | 'baroque'
    | 'classicism'
    | 'romanticism'
    | 'realism'
    | 'impressionism'
    | 'modern'
    | 'contemporary'
    | 'unknown';

export interface Artifact {
    id: string;
    title: string;
    description: string;
    inventoryNumber: string;
    collection: string;
    creationDate: string;
    acquisitionDate?: string;
    dimensions: {
        width: number;
        height: number;
        depth?: number;
        unit: 'cm' | 'mm' | 'm';
    };
    materials: MaterialType[];
    weight?: number;
    technique?: string;
    status: ArtifactStatus;
    currentLocation: string;
    restorationHistory: RestorationRecord[];
    lastInspection?: string;
    lastInspector?: string;
    images: string[];
    scans?: string[];
    documents?: string[];
    defects: Defect[];
    tags: string[];
    notes?: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

export interface RestorationRecord {
    id: string;
    date: string;
    restorer: string;
    description: string;
    workPerformed: string; // Перечень выполненных работ
    materialsUsed?: string[]; // Использованные материалы
    duration?: number; // Продолжительность работ в днях
    beforeImages?: string[];
    afterImages?: string[];
    cost?: number;
}

export interface ArtifactFilters {
    status?: ArtifactStatus[];
    materials?: MaterialType[];
    defectTypes?: DefectType[];
    creationPeriod?: HistoricalPeriod[];
    collection?: string;
    location?: string;
    dateRange?: {
        start: string;
        end: string;
    };
}

export interface PaginationInfo {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
}

export interface ArtifactsResponse {
    artifacts: Artifact[];
    pagination: PaginationInfo;
    filters?: ArtifactFilters;
}

export interface ArtifactFormData {
    title: string;
    description: string;
    inventoryNumber: string;
    collection: string;
    creationDate: string;
    creationPeriod?: HistoricalPeriod;
    dimensions: {
        width: number;
        height: number;
        depth?: number;
        unit: 'cm' | 'mm' | 'm';
    };
    materials: MaterialType[];
    status: ArtifactStatus;
    currentLocation: string;
    tags: string[];
    notes?: string;
}

export interface CollectionStats {
    total: number;
    byStatus: Record<ArtifactStatus, number>;
    byMaterial: Record<MaterialType, number>;
    byPeriod: Record<HistoricalPeriod, number>;
    criticalCount: number;
    restorationCount: number;
    recentAdditions: number;
}

export interface ImageAnalysisResult {
    artifactId: string;
    imageUrl: string;
    defectsDetected: Defect[];
    segmentationData?: {
        regions: Array<{
            id: string;
            label: string;
            coordinates: number[][];
            material?: string;
        }>;
    };
    analysisDate: string;
    confidence: number;
}

export type SearchField =
    | 'title'
    | 'description'
    | 'inventoryNumber'
    | 'collection'
    | 'tags';

export interface SearchParams {
    query: string;
    fields: SearchField[];
    filters: ArtifactFilters;
}

export type {
    Defect as IDefect,
    Artifact as IArtifact,
    RestorationRecord as IRestorationRecord,
    ArtifactFilters as IArtifactFilters,
};