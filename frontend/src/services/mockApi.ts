import { Artifact, ArtifactStatus, MaterialType } from '../types';

// Моковые данные артефактов
export const mockArtifacts: Artifact[] = [
    {
        id: '1',
        title: 'Звездная ночь',
        description: 'Картина Винсента Ван Гога, написанная в 1889 году',
        inventoryNumber: 'ART-001',
        collection: 'Европейская живопись',
        creationDate: '1889-06-01',
        acquisitionDate: '1941-03-15',
        dimensions: {
            width: 73.7,
            height: 92.1,
            unit: 'cm' as const
        },
        materials: ['oil_paint' as MaterialType, 'canvas' as MaterialType],
        weight: 2.5,
        technique: 'Масляная живопись на холсте',
        status: 'excellent' as ArtifactStatus,
        currentLocation: 'Зал 1, Секция A',
        restorationHistory: [
            {
                id: 'res-1',
                date: '2020-05-15',
                restorer: 'Мария Петрова',
                description: 'Профилактическая чистка и укрепление красочного слоя',
                workPerformed: 'Очистка от поверхностных загрязнений, укрепление лакового покрытия',
                materialsUsed: ['Реставрационный лак', 'Дистиллированная вода'],
                duration: 14,
                cost: 50000
            }
        ],
        lastInspection: '2024-01-15',
        images: ['/images/starry-night.jpg'],
        defects: [
            {
                id: 'def-1',
                type: 'discoloration',
                severity: 'low',
                location: 'Левый верхний угол',
                description: 'Незначительное пожелтение лака',
                detectedDate: '2023-11-10',
                lastInspectionDate: '2024-01-15',
                progress: 5,
                isActive: true
            }
        ],
        tags: ['ван гог', 'постимпрессионизм', 'ночной пейзаж'],
        createdBy: 'admin',
        createdAt: '2020-01-10',
        updatedAt: '2024-01-15'
    },
    {
        id: '2',
        title: 'Давид',
        description: 'Мраморная статуя работы Микеланджело',
        inventoryNumber: 'SCUL-001',
        collection: 'Европейская скульптура',
        creationDate: '1504-01-01',
        acquisitionDate: '1925-07-20',
        dimensions: {
            width: 200,
            height: 517,
            depth: 200,
            unit: 'cm' as const
        },
        materials: ['stone' as MaterialType],
        weight: 5560,
        technique: 'Резьба по мрамору',
        status: 'good' as ArtifactStatus,
        currentLocation: 'Зал 2, Секция B',
        restorationHistory: [
            {
                id: 'res-2',
                date: '2018-09-10',
                restorer: 'Алексей Волков',
                description: 'Устранение трещины в основании',
                workPerformed: 'Консервация трещины, укрепление основания',
                materialsUsed: ['Эпоксидная смола', 'Мраморная пыль'],
                duration: 30,
                cost: 120000
            }
        ],
        lastInspection: '2024-02-20',
        images: ['/images/david.jpg'],
        defects: [
            {
                id: 'def-2',
                type: 'crack',
                severity: 'medium',
                location: 'Основание статуи',
                description: 'Стабилизированная трещина',
                detectedDate: '2018-08-15',
                lastInspectionDate: '2024-02-20',
                progress: 2,
                isActive: false
            }
        ],
        tags: ['микеланджело', 'ренессанс', 'мрамор', 'библейский сюжет'],
        createdBy: 'admin',
        createdAt: '2020-01-10',
        updatedAt: '2024-02-20'
    },
    {
        id: '3',
        title: 'Рождение Венеры',
        description: 'Картина Сандро Боттичелли',
        inventoryNumber: 'ART-002',
        collection: 'Итальянское Возрождение',
        creationDate: '1485-01-01',
        acquisitionDate: '1932-11-05',
        dimensions: {
            width: 172.5,
            height: 278.9,
            unit: 'cm' as const
        },
        materials: ['tempera' as MaterialType, 'canvas' as MaterialType],
        weight: 8.2,
        technique: 'Темпера на холсте',
        status: 'requires_attention' as ArtifactStatus,
        currentLocation: 'Зал 3, Секция C',
        restorationHistory: [],
        lastInspection: '2023-12-10',
        images: ['/images/birth-of-venus.jpg'],
        defects: [
            {
                id: 'def-3',
                type: 'peeling',
                severity: 'high',
                location: 'Нижняя часть полотна',
                description: 'Отслоение красочного слоя',
                detectedDate: '2023-11-20',
                lastInspectionDate: '2023-12-10',
                progress: 15,
                isActive: true
            }
        ],
        tags: ['боттичелли', 'ренессанс', 'мифология', 'венера'],
        createdBy: 'admin',
        createdAt: '2020-01-10',
        updatedAt: '2023-12-10'
    },
    {
        id: '4',
        title: 'Мыслитель',
        description: 'Бронзовая скульптура Огюста Родена',
        inventoryNumber: 'SCUL-002',
        collection: 'Современная скульптура',
        creationDate: '1902-01-01',
        acquisitionDate: '1950-04-12',
        dimensions: {
            width: 40,
            height: 71.5,
            depth: 58,
            unit: 'cm' as const
        },
        materials: ['metal' as MaterialType],
        weight: 120,
        technique: 'Бронзовое литье',
        status: 'critical' as ArtifactStatus,
        currentLocation: 'Зал 4, Секция D',
        restorationHistory: [
            {
                id: 'res-3',
                date: '2015-06-20',
                restorer: 'Иван Смирнов',
                description: 'Устранение коррозии',
                workPerformed: 'Очистка от коррозии, нанесение защитного покрытия',
                materialsUsed: ['Ингибитор коррозии', 'Защитный лак'],
                duration: 21,
                cost: 75000
            }
        ],
        lastInspection: '2023-11-05',
        images: ['/images/thinker.jpg'],
        defects: [
            {
                id: 'def-4',
                type: 'corrosion',
                severity: 'critical',
                location: 'Правое плечо и спина',
                description: 'Активная коррозия бронзы',
                detectedDate: '2023-10-15',
                lastInspectionDate: '2023-11-05',
                progress: 25,
                isActive: true
            },
            {
                id: 'def-5',
                type: 'crack',
                severity: 'medium',
                location: 'Основание',
                description: 'Трещина в основании',
                detectedDate: '2023-10-15',
                lastInspectionDate: '2023-11-05',
                progress: 10,
                isActive: true
            }
        ],
        tags: ['роден', 'бронза', 'философия', 'мыслитель'],
        createdBy: 'admin',
        createdAt: '2020-01-10',
        updatedAt: '2023-11-05'
    }
];

// Имитация задержки сети
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mockApiService = {
    async fetchArtifacts(): Promise<Artifact[]> {
        await delay(800);
        return mockArtifacts;
    },

    async fetchArtifactById(id: string): Promise<Artifact> {
        await delay(500);
        const artifact = mockArtifacts.find(a => a.id === id);
        if (!artifact) {
            throw new Error(`Артефакт с ID ${id} не найден`);
        }
        return artifact;
    },
};