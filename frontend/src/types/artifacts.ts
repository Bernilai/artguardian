// Типы дефектов
export type DefectType =
    | 'crack'          // Трещина
    | 'stain'          // Пятно
    | 'discoloration'  // Изменение цвета
    | 'peeling'        // Отслоение
    | 'deformation'    // Деформация
    | 'abrasion'       // Истирание
    | 'corrosion'      // Коррозия
    | 'break'          // Надлом
    | 'other';         // Другое

export type DefectSeverity =
    | 'low'      // Низкая
    | 'medium'   // Средняя
    | 'high'     // Высокая
    | 'critical' // Критическая

export interface Defect {
    id: string;
    type: DefectType;
    severity: DefectSeverity;
    location: string; // Описание местоположения или координаты
    description?: string;
    detectedDate: string; // ISO string даты обнаружения
    lastInspectionDate?: string; // ISO string даты последней проверки
    progress: number; // Прогресс ухудшения в процентах (0-100)
    images?: string[]; // Ссылки на фотографии дефекта
    notes?: string; // Дополнительные заметки
    isActive: boolean; // Активен ли дефект (или устранен)
}

// Типы материалов
export type MaterialType =
    | 'oil_paint'      // Масляная краска
    | 'watercolor'     // Акварель
    | 'acrylic'        // Акрил
    | 'tempera'        // Темпера
    | 'canvas'         // Холст
    | 'wood'           // Дерево
    | 'metal'          // Металл
    | 'stone'          // Камень
    | 'ceramic'        // Керамика
    | 'paper'          // Бумага
    | 'textile'        // Текстиль
    | 'mixed'          // Смешанная техника
    | 'other';         // Другое

// Статусы артефакта
export type ArtifactStatus =
    | 'excellent'          // Отличное
    | 'good'               // Хорошее
    | 'requires_attention' // Требует внимания
    | 'critical'           // Критическое
    | 'under_restoration'  // На реставрации
    | 'storage'            // В хранилище
    | 'exhibited'          // Экспонируется

// Периоды создания
export type HistoricalPeriod =
    | 'ancient'           // Античность
    | 'medieval'          // Средневековье
    | 'renaissance'       // Возрождение
    | 'baroque'           // Барокко
    | 'classicism'        // Классицизм
    | 'romanticism'       // Романтизм
    | 'realism'           // Реализм
    | 'impressionism'     // Импрессионизм
    | 'modern'            // Модерн
    | 'contemporary'      // Современное
    | 'unknown'           // Неизвестно

// Основной интерфейс артефакта
export interface Artifact {
    // Основная информация
    id: string;
    title: string;
    description: string;
    inventoryNumber: string; // Инвентарный номер
    collection: string; // Название коллекции

    // Даты
    creationDate: string; // Дата создания (может быть приблизительной "XVIII век")
    acquisitionDate?: string; // Дата приобретения музеем

    // Физические характеристики
    dimensions: {
        width: number; // см
        height: number; // см
        depth?: number; // см (для 3D объектов)
        unit: 'cm' | 'mm' | 'm';
    };

    materials: MaterialType[];
    weight?: number; // кг
    technique?: string; // Техника исполнения

    // Состояние и консервация
    status: ArtifactStatus;
    currentLocation: string; // Местонахождение (зал, хранилище и т.д.)
    restorationHistory: RestorationRecord[];
    lastInspection: string; // Дата последней инспекции

    // Медиа
    images: string[]; // Ссылки на основные изображения
    scans?: string[]; // Ссылки на сканы высокого разрешения
    documents?: string[]; // Ссылки на сопроводительные документы

    // Дефекты
    defects: Defect[];

    // Метаданные
    tags: string[];
    notes?: string;
    createdBy: string; // Кто добавил в систему
    createdAt: string; // Когда добавлен в систему
    updatedAt: string; // Когда последний раз обновлен
}

// Запись о реставрации
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
    cost?: number; // Стоимость работ
}

// Фильтры для коллекции
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

// Пагинация
export interface PaginationInfo {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
}

// Ответ API для списка артефактов
export interface ArtifactsResponse {
    artifacts: Artifact[];
    pagination: PaginationInfo;
    filters?: ArtifactFilters;
}

// Форма создания/редактирования артефакта
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

// Статистика по коллекции
export interface CollectionStats {
    total: number;
    byStatus: Record<ArtifactStatus, number>;
    byMaterial: Record<MaterialType, number>;
    byPeriod: Record<HistoricalPeriod, number>;
    criticalCount: number;
    restorationCount: number;
    recentAdditions: number;
}

// Утилитарные типы для работы с изображениями
export interface ImageAnalysisResult {
    artifactId: string;
    imageUrl: string;
    defectsDetected: Defect[];
    segmentationData?: {
        regions: Array<{
            id: string;
            label: string; // "sky", "drapery", "flesh", etc.
            coordinates: number[][]; // Полигоны региона
            material?: string;
        }>;
    };
    analysisDate: string;
    confidence: number; // Уверенность анализа (0-1)
}

// Типы для поиска
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

// Экспорт всех типов
export type {
    Defect as IDefect,
    Artifact as IArtifact,
    RestorationRecord as IRestorationRecord,
    ArtifactFilters as IArtifactFilters,
};