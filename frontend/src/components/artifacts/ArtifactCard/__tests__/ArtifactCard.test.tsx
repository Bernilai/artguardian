import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Artifact, Defect } from '../../../../types';
import ArtifactCard from '../ArtifactCard';

jest.mock('../../../ui/StatusBadge/StatusBadge', () => ({
    __esModule: true,
    default: ({ status }: { status: string }) => (
        <span data-testid="status-badge" data-status={status} />
    ),
}));

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
        dimensions: { width: 10, height: 10, unit: 'cm' },
        ...overrides,
    };
}

function makeDefect(overrides: Partial<Defect> = {}): Defect {
    return {
        id: 'defect-1',
        type: 'crack',
        severity: 'low',
        location: 'Frame',
        detectedDate: '2024-06-01',
        progress: 0,
        isActive: true,
        ...overrides,
    };
}

describe('ArtifactCard', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('rendering — basic fields', () => {
        it('renders title inside h3, inventory, description, collection', () => {
            const artifact = makeArtifact({
                title: 'Mona Lisa',
                inventoryNumber: 'ML-77',
                description: 'Famous portrait',
                collection: 'Louvre',
            });

            render(<ArtifactCard artifact={artifact} />);

            const heading = screen.getByRole('heading', { level: 3, name: 'Mona Lisa' });
            expect(heading.tagName).toBe('H3');
            expect(screen.getByText('ML-77')).toBeInTheDocument();
            expect(screen.getByText('Famous portrait')).toBeInTheDocument();
            expect(screen.getByText('Louvre')).toBeInTheDocument();
        });

        it('passes status to StatusBadge', () => {
            const artifact = makeArtifact({ status: 'critical' });
            render(<ArtifactCard artifact={artifact} />);

            const badge = screen.getByTestId('status-badge');
            expect(badge).toHaveAttribute('data-status', 'critical');
        });
    });

    describe('image handling', () => {
        it('uses placeholder when images is empty', () => {
            const artifact = makeArtifact({ images: [], title: 'No photo' });
            render(<ArtifactCard artifact={artifact} />);

            const img = screen.getByRole('img', { name: 'No photo' });
            expect(img).toHaveAttribute('src', '/images/placeholder-artifact.jpg');
        });

        it('prefixes simple filename with /images/', () => {
            const artifact = makeArtifact({ images: ['photo.jpg'], title: 'With photo' });
            render(<ArtifactCard artifact={artifact} />);

            const img = screen.getByRole('img', { name: 'With photo' });
            expect(img).toHaveAttribute('src', '/images/photo.jpg');
        });

        it('leaves full https URL unchanged', () => {
            const url = 'https://cdn.example.com/img.jpg';
            const artifact = makeArtifact({ images: [url], title: 'Remote' });
            render(<ArtifactCard artifact={artifact} />);

            const img = screen.getByRole('img', { name: 'Remote' });
            expect(img).toHaveAttribute('src', url);
        });

        it('leaves absolute path starting with / unchanged', () => {
            const artifact = makeArtifact({ images: ['/uploads/img.jpg'], title: 'Upload' });
            render(<ArtifactCard artifact={artifact} />);

            const img = screen.getByRole('img', { name: 'Upload' });
            // Абсолютный путь на том же origin — без префикса `/images/`.
            expect(img).toHaveAttribute('src', '/uploads/img.jpg');
        });
    });

    describe('lastInspection formatting', () => {
        it('formats valid ISO date with ru-RU locale', () => {
            const iso = '2024-03-15T12:00:00.000Z';
            const artifact = makeArtifact({ lastInspection: iso });
            render(<ArtifactCard artifact={artifact} />);

            const expected = new Date(iso).toLocaleDateString('ru-RU');
            expect(screen.getByText(expected)).toBeInTheDocument();
        });

        it("shows 'Не указана' when lastInspection is undefined", () => {
            const artifact = makeArtifact({ lastInspection: undefined });
            render(<ArtifactCard artifact={artifact} />);

            expect(screen.getByText('Не указана')).toBeInTheDocument();
        });

        it("shows 'Не указана' when lastInspection is empty string", () => {
            const artifact = makeArtifact({ lastInspection: '' });
            render(<ArtifactCard artifact={artifact} />);

            expect(screen.getByText('Не указана')).toBeInTheDocument();
        });
    });

    describe('viewMode CSS class', () => {
        it('defaults to artifact-card--grid', () => {
            const artifact = makeArtifact();
            render(<ArtifactCard artifact={artifact} />);

            expect(screen.getByTestId('artifact-card-root')).toHaveClass('artifact-card--grid');
        });

        it('uses artifact-card--list for list mode', () => {
            const artifact = makeArtifact();
            render(<ArtifactCard artifact={artifact} viewMode="list" />);

            expect(screen.getByTestId('artifact-card-root')).toHaveClass('artifact-card--list');
        });

        it('uses artifact-card--compact for compact mode', () => {
            const artifact = makeArtifact();
            render(<ArtifactCard artifact={artifact} viewMode="compact" />);

            expect(screen.getByTestId('artifact-card-root')).toHaveClass('artifact-card--compact');
        });
    });

    describe('click / keyboard handlers', () => {
        it('calls onClick with artifact when card is clicked', () => {
            const artifact = makeArtifact();
            const onClick = jest.fn();
            render(<ArtifactCard artifact={artifact} onClick={onClick} />);

            fireEvent.click(screen.getByTestId('artifact-card-root'));
            expect(onClick).toHaveBeenCalledTimes(1);
            expect(onClick).toHaveBeenCalledWith(artifact);
        });

        it('calls onClick on Enter when card is focused', () => {
            const artifact = makeArtifact();
            const onClick = jest.fn();
            render(<ArtifactCard artifact={artifact} onClick={onClick} />);

            const card = screen.getByTestId('artifact-card-root');
            card.focus();
            fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });

            expect(onClick).toHaveBeenCalledTimes(1);
            expect(onClick).toHaveBeenCalledWith(artifact);
        });

        it('calls onClick on Space when card is focused', () => {
            const artifact = makeArtifact();
            const onClick = jest.fn();
            render(<ArtifactCard artifact={artifact} onClick={onClick} />);

            const card = screen.getByTestId('artifact-card-root');
            card.focus();
            fireEvent.keyDown(card, { key: ' ', code: 'Space' });

            expect(onClick).toHaveBeenCalledTimes(1);
            expect(onClick).toHaveBeenCalledWith(artifact);
        });

        it('does not throw when onClick is omitted and card is clicked', () => {
            const artifact = makeArtifact();
            render(<ArtifactCard artifact={artifact} />);

            expect(() => fireEvent.click(screen.getByTestId('artifact-card-root'))).not.toThrow();
        });
    });

    describe('action buttons (stopPropagation)', () => {
        it('calls onInspect and does not trigger card onClick', () => {
            const artifact = makeArtifact();
            const onClick = jest.fn();
            const onInspect = jest.fn();
            render(<ArtifactCard artifact={artifact} onClick={onClick} onInspect={onInspect} />);

            const inspectBtn = screen.getByTitle('Осмотреть');
            // Кнопка останавливает всплытие — карточный onClick не должен сработать.
            fireEvent.click(inspectBtn);

            expect(onInspect).toHaveBeenCalledTimes(1);
            expect(onInspect).toHaveBeenCalledWith(artifact);
            expect(onClick).not.toHaveBeenCalled();
        });

        it('calls onEdit and does not trigger card onClick', () => {
            const artifact = makeArtifact();
            const onClick = jest.fn();
            const onEdit = jest.fn();
            render(<ArtifactCard artifact={artifact} onClick={onClick} onEdit={onEdit} />);

            const editBtn = screen.getByTitle('Редактировать');
            fireEvent.click(editBtn);

            expect(onEdit).toHaveBeenCalledTimes(1);
            expect(onEdit).toHaveBeenCalledWith(artifact);
            expect(onClick).not.toHaveBeenCalled();
        });
    });

    describe('defects', () => {
        it('does not render defect section when defects is empty', () => {
            const artifact = makeArtifact({ defects: [] });
            render(<ArtifactCard artifact={artifact} />);

            expect(screen.queryByTestId('artifact-card-defects')).not.toBeInTheDocument();
        });

        it('renders both tags for two defects without +N', () => {
            const artifact = makeArtifact({
                defects: [
                    makeDefect({ id: 'd1', type: 'stain', location: 'a' }),
                    makeDefect({ id: 'd2', type: 'peeling', location: 'b' }),
                ],
            });
            render(<ArtifactCard artifact={artifact} />);

            expect(screen.getByTestId('artifact-card-defects')).toBeInTheDocument();
            expect(screen.getByText(/stain/)).toBeInTheDocument();
            expect(screen.getByText(/peeling/)).toBeInTheDocument();
            expect(screen.queryByTestId('artifact-defect-more')).not.toBeInTheDocument();
        });

        it('shows first three defects and +1 for four', () => {
            const artifact = makeArtifact({
                defects: [
                    makeDefect({ id: 'd1', type: 'stain', location: 'a' }),
                    makeDefect({ id: 'd2', type: 'peeling', location: 'b' }),
                    makeDefect({ id: 'd3', type: 'abrasion', location: 'c' }),
                    makeDefect({ id: 'd4', type: 'other', location: 'd' }),
                ],
            });
            render(<ArtifactCard artifact={artifact} />);

            expect(screen.getByText(/stain/)).toBeInTheDocument();
            expect(screen.getByText(/peeling/)).toBeInTheDocument();
            expect(screen.getByText(/abrasion/)).toBeInTheDocument();
            expect(screen.queryByText(/other/)).not.toBeInTheDocument();
            expect(screen.getByText('+1')).toBeInTheDocument();
        });

        it('includes defect type text for crack', () => {
            const artifact = makeArtifact({
                defects: [makeDefect({ id: 'd1', type: 'crack', location: 'corner' })],
            });
            render(<ArtifactCard artifact={artifact} />);

            expect(screen.getByText(/crack/)).toBeInTheDocument();
        });
    });
});
