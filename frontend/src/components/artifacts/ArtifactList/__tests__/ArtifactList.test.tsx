import React from 'react';
import { render, screen } from '@testing-library/react';
import type { Artifact } from '../../../../types';
import type { ArtifactCardProps } from '../../ArtifactCard/ArtifactCard';
import ArtifactList from '../ArtifactList';

var artifactCardCapture: jest.Mock;

jest.mock('../../ArtifactCard/ArtifactCard', () => {
    const React = require('react');
    const capture = jest.fn();
    artifactCardCapture = capture;

    return {
        __esModule: true,
        default: function MockArtifactCard(props: ArtifactCardProps) {
            capture(props);
            return React.createElement('div', {
                'data-testid': 'artifact-card',
                'data-id': props.artifact.id,
            });
        },
    };
});

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

describe('ArtifactList', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('empty state', () => {
        it('renders empty state with default message when artifacts is empty', () => {
            render(<ArtifactList artifacts={[]} />);

            expect(screen.getByTestId('artifact-list-empty')).toBeInTheDocument();
            expect(
                screen.getByRole('heading', { level: 3, name: 'Артефакты не найдены' }),
            ).toBeInTheDocument();
        });

        it('renders custom emptyMessage when artifacts is empty', () => {
            render(<ArtifactList artifacts={[]} emptyMessage="Ничего нет" />);

            expect(screen.getByRole('heading', { level: 3, name: 'Ничего нет' })).toBeInTheDocument();
        });

        it('does not render ArtifactCard when artifacts is empty', () => {
            render(<ArtifactList artifacts={[]} />);

            expect(screen.queryByTestId('artifact-card')).not.toBeInTheDocument();
            expect(artifactCardCapture).not.toHaveBeenCalled();
        });
    });

    describe('non-empty list', () => {
        it('renders one ArtifactCard per artifact', () => {
            const artifacts = [
                makeArtifact({ id: 'a-1', title: 'One' }),
                makeArtifact({ id: 'a-2', title: 'Two' }),
                makeArtifact({ id: 'a-3', title: 'Three' }),
            ];

            render(<ArtifactList artifacts={artifacts} />);

            expect(screen.getAllByTestId('artifact-card')).toHaveLength(3);
        });

        it('passes the correct artifact prop to each ArtifactCard', () => {
            const a1 = makeArtifact({ id: 'a-1', title: 'One' });
            const a2 = makeArtifact({ id: 'a-2', title: 'Two' });
            const a3 = makeArtifact({ id: 'a-3', title: 'Three' });

            render(<ArtifactList artifacts={[a1, a2, a3]} />);

            const calls = artifactCardCapture.mock.calls.map((c) => c[0] as ArtifactCardProps);
            expect(calls[0].artifact).toBe(a1);
            expect(calls[1].artifact).toBe(a2);
            expect(calls[2].artifact).toBe(a3);
        });

        it('forwards list callbacks to each card as onClick, onEdit, onInspect', () => {
            const artifacts = [
                makeArtifact({ id: 'a-1' }),
                makeArtifact({ id: 'a-2' }),
                makeArtifact({ id: 'a-3' }),
            ];
            const onArtifactClick = jest.fn();
            const onEditArtifact = jest.fn();
            const onInspectArtifact = jest.fn();

            render(
                <ArtifactList
                    artifacts={artifacts}
                    onArtifactClick={onArtifactClick}
                    onEditArtifact={onEditArtifact}
                    onInspectArtifact={onInspectArtifact}
                />,
            );

            // Проброс: ArtifactList передаёт onArtifactClick/onEditArtifact/onInspectArtifact в карточку как onClick/onEdit/onInspect.
            const calls = artifactCardCapture.mock.calls.map((c) => c[0] as ArtifactCardProps);
            expect(calls).toHaveLength(3);
            calls.forEach((props) => {
                expect(props.onClick).toBe(onArtifactClick);
                expect(props.onEdit).toBe(onEditArtifact);
                expect(props.onInspect).toBe(onInspectArtifact);
            });
        });
    });

    describe('viewMode CSS class on list container', () => {
        it('defaults to artifact-list--grid', () => {
            render(<ArtifactList artifacts={[makeArtifact({ id: 'x' })]} />);

            expect(screen.getByTestId('artifact-list-root')).toHaveClass('artifact-list--grid');
        });

        it('uses artifact-list--list when viewMode is list', () => {
            render(
                <ArtifactList artifacts={[makeArtifact({ id: 'x' })]} viewMode="list" />,
            );

            expect(screen.getByTestId('artifact-list-root')).toHaveClass('artifact-list--list');
        });

        it('uses artifact-list--compact when viewMode is compact', () => {
            render(
                <ArtifactList artifacts={[makeArtifact({ id: 'x' })]} viewMode="compact" />,
            );

            expect(screen.getByTestId('artifact-list-root')).toHaveClass('artifact-list--compact');
        });
    });

    describe('viewMode forwarded to cards', () => {
        it('passes viewMode compact to each ArtifactCard', () => {
            const artifacts = [makeArtifact({ id: '1' }), makeArtifact({ id: '2' })];

            render(<ArtifactList artifacts={artifacts} viewMode="compact" />);

            const calls = artifactCardCapture.mock.calls.map((c) => c[0] as ArtifactCardProps);
            expect(calls).toHaveLength(2);
            calls.forEach((props) => {
                expect(props.viewMode).toBe('compact');
            });
        });
    });
});
