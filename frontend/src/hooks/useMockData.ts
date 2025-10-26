import { useState, useEffect } from 'react';
import { Artifact, ArtifactStatus, MaterialType } from '../types';
import { LoadingSpinner } from "../components";

const mockArtifacts: Artifact[] = [
    {
        // Основная информация
        id: '1',
        title: 'Портрет неизвестной',
        description: 'Масляная живопись на холсте. Портрет молодой женщины в голубом платье.',
        inventoryNumber: 'Ж-1542',
        collection: 'Живопись',

        // Даты
        creationDate: '1760-1780',

        // Физические характеристики
        dimensions: {
            width: 60,
            height: 80,
            unit: 'cm' as const,
        },
        materials: ['oil_paint' as MaterialType, 'canvas' as MaterialType],

        // Состояние и консервация
        status: 'requires_attention' as ArtifactStatus,
        currentLocation: 'Зал 3, Стена Западная',
        restorationHistory: [],
        lastInspection: '2024-01-15',

        // Медиа
        images: ['/images/portrait-1.jpg'],
        scans: [],
        documents: [],

        // Дефекты
        defects: [
            {
                id: 'd1',
                type: 'crack',
                severity: 'medium',
                location: 'верхний левый угол',
                detectedDate: '2024-01-15',
                progress: 15,
                isActive: true,
            }
        ],

        // Метаданные
        tags: ['портрет', 'женский образ', 'XVIII век'],
        createdBy: 'Иванов А.П.',
        createdAt: '2023-05-10T10:00:00Z',
        updatedAt: '2024-01-15T14:30:00Z',
    },
    {
        // Основная информация
        id: '2',
        title: 'Пейзаж с рекой',
        description: 'Акварель на бумаге. Осенний пейзаж с рекой и мельницей.',
        inventoryNumber: 'Ж-2876',
        collection: 'Графика',

        // Даты
        creationDate: '1850',

        // Физические характеристики
        dimensions: {
            width: 45,
            height: 35,
            unit: 'cm' as const,
        },
        materials: ['watercolor' as MaterialType, 'paper' as MaterialType],

        // Состояние и консервация
        status: 'excellent' as ArtifactStatus,
        currentLocation: 'Хранилище 2, Секция А',
        restorationHistory: [
            {
                id: 'rest-1',
                date: '2023-03-15',
                restorer: 'Петрова С.И.',
                description: 'Профилактическая чистка',
                workPerformed: 'Удаление поверхностных загрязнений, укрепление красочного слоя',
                duration: 2,
            }
        ],
        lastInspection: '2024-01-10',

        // Медиа
        images: ['/images/landscape-1.jpg'],
        scans: [],
        documents: [],

        // Дефекты
        defects: [],

        // Метаданные
        tags: ['пейзаж', 'акварель', 'XIX век'],
        createdBy: 'Петрова С.И.',
        createdAt: '2023-04-22T09:15:00Z',
        updatedAt: '2024-01-10T11:20:00Z',
    },
    {
        // Основная информация
        id: '3',
        title: 'Античная ваза',
        description: 'Керамическая ваза с краснофигурной росписью. Древняя Греция.',
        inventoryNumber: 'А-0042',
        collection: 'Античное искусство',

        // Даты
        creationDate: 'V век до н.э.',

        // Физические характеристики
        dimensions: {
            width: 25,
            height: 40,
            depth: 25,
            unit: 'cm' as const,
        },
        materials: ['ceramic' as MaterialType],
        weight: 2.5,

        // Состояние и консервация
        status: 'critical' as ArtifactStatus,
        currentLocation: 'Реставрационная мастерская',
        restorationHistory: [
            {
                id: 'rest-2',
                date: '2023-11-20',
                restorer: 'Сидоров В.К.',
                description: 'Склейка фрагментов',
                workPerformed: 'Склейка крупных фрагментов, укрепление структуры',
                materialsUsed: ['реставрационный клей', 'грунтовка'],
                duration: 5,
                cost: 15000,
            }
        ],
        lastInspection: '2024-01-08',

        // Медиа
        images: ['/images/vase-1.jpg', '/images/vase-2.jpg'],
        scans: ['/scans/vase-3d-scan.obj'],
        documents: ['/docs/vase-analysis.pdf'],

        // Дефекты
        defects: [
            {
                id: 'd2',
                type: 'break',
                severity: 'critical',
                location: 'горлышко',
                description: 'Множественные трещины и сколы',
                detectedDate: '2023-11-15',
                progress: 45,
                isActive: true,
            },
            {
                id: 'd3',
                type: 'abrasion',
                severity: 'medium',
                location: 'основание',
                description: 'Значительное истирание поверхности',
                detectedDate: '2023-11-15',
                progress: 25,
                isActive: true,
            }
        ],

        // Метаданные
        tags: ['ваза', 'краснофигурный стиль', 'Древняя Греция'],
        createdBy: 'Сидоров В.К.',
        createdAt: '2023-06-15T14:45:00Z',
        updatedAt: '2024-01-08T16:10:00Z',
    }
];

export const useMockData = () => {
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Имитация загрузки данных с API
        const timer = setTimeout(() => {
            setArtifacts(mockArtifacts);
            setLoading(false);
        }, 1000);

        return () => clearTimeout(timer);
    }, []);

    if (loading) {
        return {
            artifacts: [],
            loading: true,
            getArtifactById: () => undefined,
            updateArtifact: () => {},
            addArtifact: () => {}
        };
    }

    // Функции для работы с данными
    const getArtifactById = (id: string): Artifact | undefined => {
        return artifacts.find(artifact => artifact.id === id);
    };

    const updateArtifact = (id: string, updates: Partial<Artifact>): void => {
        setArtifacts(prev => prev.map(artifact =>
            artifact.id === id ? { ...artifact, ...updates, updatedAt: new Date().toISOString() } : artifact
        ));
    };

    const addArtifact = (artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'>): void => {
        const newArtifact: Artifact = {
            ...artifact,
            id: `art-${Date.now()}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        setArtifacts(prev => [...prev, newArtifact]);
    };

    return {
        artifacts,
        loading,
        getArtifactById,
        updateArtifact,
        addArtifact
    };
};

// Вспомогательные функции для тестирования
export const getMockArtifacts = (): Artifact[] => mockArtifacts;

export const getArtifactStats = () => {
    const artifacts = mockArtifacts;
    return {
        total: artifacts.length,
        byStatus: artifacts.reduce((acc, artifact) => {
            acc[artifact.status] = (acc[artifact.status] || 0) + 1;
            return acc;
        }, {} as Record<ArtifactStatus, number>),
        criticalCount: artifacts.filter(a => a.status === 'critical').length,
        requiresAttentionCount: artifacts.filter(a => a.status === 'requires_attention').length,
    };
};