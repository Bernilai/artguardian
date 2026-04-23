import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Artifact, Defect, User } from '../../../../types';
import ArtifactDetail from '../ArtifactDetail';
import { useAuth } from '../../../../contexts';

// jest.mock считается от этого файла: у ArtifactDetail путь `../../../contexts`, из __tests__ — на один `../` больше.
jest.mock('../../../../contexts', () => ({
    useAuth: jest.fn(),
}));

jest.mock('../../../ui/StatusBadge/StatusBadge', () => ({
    __esModule: true,
    default: ({ status }: { status: string }) => (
        <span data-testid="status-badge" data-status={status} />
    ),
}));

jest.mock('../../../ui/LoadingSpinner/LoadingSpinner', () => ({
    __esModule: true,
    default: () => <div data-testid="loading-spinner" />,
}));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
    return {
        id: 'artifact-1',
        title: 'Test title',
        description: 'Test description',
        inventoryNumber: 'INV-001',
        collection: 'Main collection',
        status: 'good',
        images: [],
        defects: [],
        tags: [],
        creationDate: '2020-01-01',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-02T00:00:00.000Z',
        createdBy: 'user-1',
        currentLocation: 'Storage A',
        materials: [],
        restorationHistory: [],
        dimensions: { width: 10, height: 20, unit: 'cm' },
        ...overrides,
    };
}

function makeDefect(overrides: Partial<Defect> = {}): Defect {
    return {
        id: 'defect-1',
        type: 'crack',
        severity: 'low',
        location: 'Угол рамы',
        detectedDate: '2024-01-15',
        progress: 0,
        isActive: true,
        ...overrides,
    };
}

function baseUser(overrides: Partial<User> = {}): User {
    return {
        id: 'u1',
        email: 'u@example.com',
        role: 'viewer',
        name: 'Test User',
        ...overrides,
    };
}

describe('ArtifactDetail', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    beforeEach(() => {
        mockedUseAuth.mockReturnValue({ user: null } as ReturnType<typeof useAuth>);
    });

    describe('loading', () => {
        it('при loading=true показывает LoadingSpinner и не рендерит содержимое артефакта', () => {
            const artifact = makeArtifact({ title: 'Hidden title' });
            render(<ArtifactDetail artifact={artifact} loading />);

            expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
            expect(screen.queryByRole('heading', { name: 'Hidden title' })).not.toBeInTheDocument();
            expect(screen.queryByText('Основная информация')).not.toBeInTheDocument();
        });

        it('при loading=true и переданном artifact всё равно показывает спиннер', () => {
            render(<ArtifactDetail artifact={makeArtifact()} loading />);
            expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
            expect(screen.queryByText('Основная информация')).not.toBeInTheDocument();
        });
    });

    describe('null artifact', () => {
        it('при artifact=null показывает текст и не рендерит основной контент', () => {
            render(<ArtifactDetail artifact={null} />);

            expect(screen.getByText('Артефакт не найден')).toBeInTheDocument();
            expect(screen.queryByText('Основная информация')).not.toBeInTheDocument();
        });
    });

    describe('basic rendering', () => {
        it('рендерит поля артефакта, описание, размеры, StatusBadge и опциональные вес/техника', () => {
            const artifact = makeArtifact({
                title: 'Картина X',
                inventoryNumber: 'INV-99',
                collection: 'Главная',
                currentLocation: 'Зал 3',
                creationDate: '1850-05-05',
                description: 'Подробное описание',
                status: 'requires_attention',
                dimensions: { width: 10, height: 20, unit: 'cm' },
                weight: 1.5,
                technique: 'Масло',
            });
            render(
                <ArtifactDetail
                    artifact={artifact}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );

            expect(screen.getByRole('heading', { level: 1, name: 'Картина X' })).toBeInTheDocument();
            expect(screen.getByText('INV-99')).toBeInTheDocument();
            expect(screen.getByText('Главная')).toBeInTheDocument();
            expect(screen.getByText('Зал 3')).toBeInTheDocument();
            expect(screen.getByText('1850-05-05')).toBeInTheDocument();
            expect(screen.getByText('Подробное описание')).toBeInTheDocument();

            const badges = screen.getAllByTestId('status-badge');
            expect(badges[0]).toHaveAttribute('data-status', 'requires_attention');

            // Размеры: «10 × 20» и суффикс единицы (в разметке число и unit — соседние узлы)
            expect(screen.getByText('Размеры:')).toBeInTheDocument();
            const dimensionsItem = screen.getByText('Размеры:').closest('.info-item');
            expect(dimensionsItem?.textContent?.replace(/\s+/g, ' ').trim()).toMatch(
                /Размеры:\s*10\s*×\s*20\s*cm/
            );

            expect(screen.getByText('1.5 кг')).toBeInTheDocument();
            expect(screen.getByText('Масло')).toBeInTheDocument();
        });

        it('не показывает вес и технику, если они не заданы', () => {
            const artifact = makeArtifact({ weight: undefined, technique: undefined });
            render(<ArtifactDetail artifact={artifact} onClose={jest.fn()} onEdit={jest.fn()} />);

            expect(screen.queryByText(/кг/)).not.toBeInTheDocument();
            expect(screen.queryByText('Техника:')).not.toBeInTheDocument();
        });

        it('materials: oil_paint и canvas — подписи через запятую', () => {
            const artifact = makeArtifact({ materials: ['oil_paint', 'canvas'] });
            render(<ArtifactDetail artifact={artifact} onClose={jest.fn()} onEdit={jest.fn()} />);

            expect(screen.getByText('Масляная краска, Холст')).toBeInTheDocument();
        });
    });

    describe('inspection info', () => {
        it('при user: null блок «Последняя проверка» не показывается (роль не даёт прав)', () => {
            mockedUseAuth.mockReturnValue({ user: null } as ReturnType<typeof useAuth>);
            const artifact = makeArtifact({ lastInspection: '2024-06-01' });
            render(<ArtifactDetail artifact={artifact} onClose={jest.fn()} onEdit={jest.fn()} />);

            expect(screen.queryByText('Последняя проверка:')).not.toBeInTheDocument();
        });

        it('при роли viewer блок проверки скрыт — только restorer/curator/admin видят поля', () => {
            mockedUseAuth.mockReturnValue({ user: baseUser({ role: 'viewer' }) } as ReturnType<typeof useAuth>);
            render(
                <ArtifactDetail
                    artifact={makeArtifact({ lastInspection: '2024-06-01' })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );

            expect(screen.queryByText('Последняя проверка:')).not.toBeInTheDocument();
        });

        it('restorer + lastInspection: дата в формате ru-RU', () => {
            mockedUseAuth.mockReturnValue({ user: baseUser({ role: 'restorer' }) } as ReturnType<typeof useAuth>);
            const formatted = new Date('2024-06-01').toLocaleDateString('ru-RU');
            render(
                <ArtifactDetail
                    artifact={makeArtifact({ lastInspection: '2024-06-01' })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );

            expect(screen.getByText('Последняя проверка:')).toBeInTheDocument();
            expect(screen.getByText(formatted)).toBeInTheDocument();
        });

        it('admin без lastInspection — «Не указана»', () => {
            mockedUseAuth.mockReturnValue({ user: baseUser({ role: 'admin' }) } as ReturnType<typeof useAuth>);
            render(
                <ArtifactDetail
                    artifact={makeArtifact({ lastInspection: undefined })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );

            const inspectionRow = screen.getByText('Последняя проверка:').closest('.info-item');
            expect(inspectionRow).toHaveTextContent('Не указана');
        });

        it('restorer + lastInspector — имя проверяющего; без lastInspector строка «Проверил» скрыта', () => {
            mockedUseAuth.mockReturnValue({ user: baseUser({ role: 'restorer' }) } as ReturnType<typeof useAuth>);

            const { rerender } = render(
                <ArtifactDetail
                    artifact={makeArtifact({ lastInspector: 'Иванов' })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );
            expect(screen.getByText('Проверил:')).toBeInTheDocument();
            expect(screen.getByText('Иванов')).toBeInTheDocument();

            rerender(
                <ArtifactDetail
                    artifact={makeArtifact({ lastInspector: undefined })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );
            expect(screen.queryByText('Проверил:')).not.toBeInTheDocument();
        });
    });

    describe('action buttons', () => {
        it('Закрыть и Редактировать всегда вызывают колбэки', () => {
            const onClose = jest.fn();
            const onEdit = jest.fn();
            const artifact = makeArtifact();
            render(<ArtifactDetail artifact={artifact} onClose={onClose} onEdit={onEdit} />);

            fireEvent.click(screen.getByRole('button', { name: /Закрыть/i }));
            expect(onClose).toHaveBeenCalledTimes(1);

            fireEvent.click(screen.getByRole('button', { name: /Редактировать/i }));
            expect(onEdit).toHaveBeenCalledWith(artifact);
        });

        it('AI-кнопка только при onAutoDetect и непустых images; клик и disabled при autoDetecting', () => {
            const onAutoDetect = jest.fn();
            const artifact = makeArtifact();

            const { rerender } = render(
                <ArtifactDetail artifact={artifact} onClose={jest.fn()} onEdit={jest.fn()} />
            );
            expect(screen.queryByRole('button', { name: /AI Анализ/i })).not.toBeInTheDocument();

            rerender(
                <ArtifactDetail
                    artifact={makeArtifact({ images: [] })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                    onAutoDetect={onAutoDetect}
                />
            );
            expect(screen.queryByRole('button', { name: /AI Анализ/i })).not.toBeInTheDocument();

            const withImage = makeArtifact({ images: ['a.jpg'] });
            rerender(
                <ArtifactDetail
                    artifact={withImage}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                    onAutoDetect={onAutoDetect}
                />
            );
            const aiBtn = screen.getByRole('button', { name: /AI Анализ/i });
            expect(aiBtn).toBeInTheDocument();
            fireEvent.click(aiBtn);
            expect(onAutoDetect).toHaveBeenCalledWith(withImage);

            rerender(
                <ArtifactDetail
                    artifact={withImage}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                    onAutoDetect={onAutoDetect}
                    autoDetecting
                />
            );
            expect(screen.getByRole('button', { name: /Анализ/i })).toBeDisabled();
        });

        it('кнопка проверки: только при onInspect и canInspect; disabled при inspecting', () => {
            const onInspect = jest.fn();
            const artifact = makeArtifact();

            mockedUseAuth.mockReturnValue({ user: baseUser({ role: 'restorer' }) } as ReturnType<typeof useAuth>);
            const { rerender } = render(
                <ArtifactDetail artifact={artifact} onClose={jest.fn()} onEdit={jest.fn()} />
            );
            // Нет колбэка onInspect — кнопка не показывается, даже если роль допускает проверку
            expect(screen.queryByRole('button', { name: /Зафиксировать проверку/i })).not.toBeInTheDocument();

            mockedUseAuth.mockReturnValue({ user: baseUser({ role: 'viewer' }) } as ReturnType<typeof useAuth>);
            rerender(
                <ArtifactDetail artifact={artifact} onClose={jest.fn()} onEdit={jest.fn()} onInspect={onInspect} />
            );
            // viewer не входит в canInspect — кнопки нет
            expect(screen.queryByRole('button', { name: /Зафиксировать проверку/i })).not.toBeInTheDocument();

            mockedUseAuth.mockReturnValue({ user: baseUser({ role: 'restorer' }) } as ReturnType<typeof useAuth>);
            rerender(
                <ArtifactDetail artifact={artifact} onClose={jest.fn()} onEdit={jest.fn()} onInspect={onInspect} />
            );
            const inspectBtn = screen.getByRole('button', { name: /Зафиксировать проверку/i });
            fireEvent.click(inspectBtn);
            expect(onInspect).toHaveBeenCalledWith(artifact);

            rerender(
                <ArtifactDetail
                    artifact={artifact}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                    onInspect={onInspect}
                    inspecting
                />
            );
            expect(screen.getByRole('button', { name: /Проверка/i })).toBeDisabled();
        });
    });

    describe('gallery', () => {
        it('пустой images — главное фото с placeholder', () => {
            render(
                <ArtifactDetail
                    artifact={makeArtifact({ images: [] })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );
            const mainImg = screen.getAllByRole('img')[0];
            expect(mainImg).toHaveAttribute('src', '/images/placeholder-artifact.jpg');
        });

        it('одно изображение — src через /images/; миниатюр нет', () => {
            render(
                <ArtifactDetail
                    artifact={makeArtifact({ images: ['a.jpg'] })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );
            expect(screen.getAllByRole('img')).toHaveLength(1);
            expect(screen.getByRole('img')).toHaveAttribute('src', '/images/a.jpg');
            expect(document.querySelector('.artifact-detail__thumbnails')).not.toBeInTheDocument();
        });

        it('три изображения — две миниатюры после главного', () => {
            render(
                <ArtifactDetail
                    artifact={makeArtifact({ images: ['a.jpg', 'b.jpg', 'c.jpg'] })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );
            const imgs = screen.getAllByRole('img');
            expect(imgs).toHaveLength(3);
            expect(imgs[0]).toHaveAttribute('src', '/images/a.jpg');
            expect(imgs[1]).toHaveAttribute('src', '/images/b.jpg');
            expect(imgs[2]).toHaveAttribute('src', '/images/c.jpg');
            expect(document.querySelector('.artifact-detail__thumbnails')).toBeInTheDocument();
        });
    });

    describe('defects', () => {
        it('пустой список — секции дефектов нет', () => {
            render(
                <ArtifactDetail
                    artifact={makeArtifact({ defects: [] })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );
            expect(screen.queryByText(/Выявленные дефекты/)).not.toBeInTheDocument();
        });

        it('один дефект: заголовок «(1)», локация и тип crack → «Трещина»', () => {
            render(
                <ArtifactDetail
                    artifact={makeArtifact({ defects: [makeDefect({ location: 'Левый край' })] })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );

            expect(screen.getByRole('heading', { name: /Выявленные дефекты \(1\)/ })).toBeInTheDocument();
            expect(screen.getByText('Трещина')).toBeInTheDocument();
            expect(screen.getByText(/Левый край/)).toBeInTheDocument();
        });

        it('клик по строке дефекта вызывает onDefectClick(defect)', () => {
            const onDefectClick = jest.fn();
            const defect = makeDefect();
            render(
                <ArtifactDetail
                    artifact={makeArtifact({ defects: [defect] })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                    onDefectClick={onDefectClick}
                />
            );

            const row = screen.getByText('Трещина').closest('.defect-item');
            expect(row).toBeTruthy();
            fireEvent.click(row as HTMLElement);
            expect(onDefectClick).toHaveBeenCalledWith(defect);
        });

        it('severity critical → StatusBadge critical', () => {
            render(
                <ArtifactDetail
                    artifact={makeArtifact({ defects: [makeDefect({ severity: 'critical' })] })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );
            expect(screen.getAllByTestId('status-badge').pop()).toHaveAttribute('data-status', 'critical');
        });

        it('severity high → StatusBadge requires_attention', () => {
            render(
                <ArtifactDetail
                    artifact={makeArtifact({ defects: [makeDefect({ severity: 'high' })] })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );
            expect(screen.getAllByTestId('status-badge').pop()).toHaveAttribute(
                'data-status',
                'requires_attention'
            );
        });

        it('severity low → StatusBadge good', () => {
            render(
                <ArtifactDetail
                    artifact={makeArtifact({ defects: [makeDefect({ severity: 'low' })] })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );
            expect(screen.getAllByTestId('status-badge').pop()).toHaveAttribute('data-status', 'good');
        });

        it('описание дефекта: показывается при наличии, скрыто при отсутствии', () => {
            const { rerender } = render(
                <ArtifactDetail
                    artifact={makeArtifact({
                        defects: [makeDefect({ description: 'Заметное повреждение' })],
                    })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );
            expect(screen.getByText('Заметное повреждение')).toBeInTheDocument();

            rerender(
                <ArtifactDetail
                    artifact={makeArtifact({ defects: [makeDefect({ description: undefined })] })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );
            expect(screen.queryByText('Заметное повреждение')).not.toBeInTheDocument();
        });
    });

    describe('tags', () => {
        it('пустые теги — секции нет', () => {
            render(
                <ArtifactDetail artifact={makeArtifact({ tags: [] })} onClose={jest.fn()} onEdit={jest.fn()} />
            );
            expect(screen.queryByRole('heading', { name: 'Теги' })).not.toBeInTheDocument();
        });

        it('несколько тегов отображаются', () => {
            render(
                <ArtifactDetail
                    artifact={makeArtifact({ tags: ['живопись', 'XIX'] })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );
            expect(screen.getByText('живопись')).toBeInTheDocument();
            expect(screen.getByText('XIX')).toBeInTheDocument();
        });
    });

    describe('restoration history', () => {
        it('пустая история — секции нет', () => {
            render(
                <ArtifactDetail
                    artifact={makeArtifact({ restorationHistory: [] })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );
            expect(screen.queryByRole('heading', { name: 'История реставрации' })).not.toBeInTheDocument();
        });

        it('одна запись: реставратор, описание и дата ru-RU', () => {
            const dateStr = '2023-11-10';
            const formatted = new Date(dateStr).toLocaleDateString('ru-RU');
            render(
                <ArtifactDetail
                    artifact={makeArtifact({
                        restorationHistory: [
                            {
                                id: 'rh-1',
                                date: dateStr,
                                restorer: 'Петров',
                                description: 'Чистка поверхности',
                                workPerformed: 'Удаление загрязнений',
                            },
                        ],
                    })}
                    onClose={jest.fn()}
                    onEdit={jest.fn()}
                />
            );

            expect(screen.getByText('Петров')).toBeInTheDocument();
            expect(screen.getByText('Чистка поверхности')).toBeInTheDocument();
            expect(screen.getByText(formatted)).toBeInTheDocument();
            expect(screen.getByText('Удаление загрязнений')).toBeInTheDocument();
        });
    });
});
