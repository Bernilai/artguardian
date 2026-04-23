import { render, screen } from '@testing-library/react';
import StatusBadge from '../StatusBadge';

afterEach(() => {
    jest.clearAllMocks();
});

describe('StatusBadge', () => {
    describe.each([
        ['good', 'Хорошее', '👍'],
        ['requires_attention', 'Требует внимания', '⚠️'],
        ['critical', 'Критическое', '🚨'],
        ['under_restoration', 'На реставрации', '🔧'],
        ['exhibited', 'Экспонируется', '🎨'],
        ['open', 'Открыт', '📝'],
        ['in_progress', 'В работе', '⚙️'],
        ['completed', 'Завершен', '✅']
    ] as const)('known status %s', (status, expectedLabel, expectedIcon) => {
        it('renders correct russian label and icon', () => {
            render(<StatusBadge status={status} />);

            expect(screen.getByText(expectedLabel)).toBeInTheDocument();
            expect(screen.getByText(expectedIcon)).toBeInTheDocument();
        });
    });

    it('normalizes no_defects to good label', () => {
        // Проверяем преобразование backend-статуса no_defects во frontend-статус good
        render(<StatusBadge status={'no_defects' as any} />);

        expect(screen.getByText('Хорошее')).toBeInTheDocument();
    });

    it('normalizes has_defects to critical label', () => {
        // Проверяем преобразование backend-статуса has_defects во frontend-статус critical
        render(<StatusBadge status={'has_defects' as any} />);

        expect(screen.getByText('Критическое')).toBeInTheDocument();
    });

    it('renders icon by default', () => {
        render(<StatusBadge status="good" />);

        expect(screen.getByText('👍')).toBeInTheDocument();
    });

    it('does not render icon when showIcon is false', () => {
        render(<StatusBadge status="good" showIcon={false} />);

        expect(screen.queryByText('👍')).not.toBeInTheDocument();
    });

    it('uses medium size class by default', () => {
        const { container } = render(<StatusBadge status="good" />);

        expect(container.firstChild).toHaveClass('status-badge--medium');
    });

    it('uses small size class when size is small', () => {
        const { container } = render(<StatusBadge status="good" size="small" />);

        expect(container.firstChild).toHaveClass('status-badge--small');
    });

    it('uses large size class when size is large', () => {
        const { container } = render(<StatusBadge status="good" size="large" />);

        expect(container.firstChild).toHaveClass('status-badge--large');
    });

    it('applies custom className to root element', () => {
        const { container } = render(<StatusBadge status="good" className="extra" />);

        expect(container.firstChild).toHaveClass('extra');
    });

    it('sets title attribute to russian label', () => {
        const { container } = render(<StatusBadge status="good" />);

        expect(container.firstChild).toHaveAttribute('title', 'Хорошее');
    });

    it('renders raw status for unknown value without crash', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        const { container } = render(<StatusBadge status={'unknown_xyz' as any} />);

        expect(screen.getByText('unknown_xyz')).toBeInTheDocument();
        expect(container.firstChild).not.toHaveAttribute('title');
        expect(warnSpy).toHaveBeenCalledWith('Unknown status: unknown_xyz, using default');
    });
});
