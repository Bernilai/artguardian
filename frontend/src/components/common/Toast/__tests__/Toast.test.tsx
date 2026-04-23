import { act, fireEvent, render, screen } from '@testing-library/react';
import Toast from '../Toast';

describe('Toast', () => {
    let onCloseMock: jest.Mock;

    beforeEach(() => {
        jest.useFakeTimers();
        onCloseMock = jest.fn();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it('renders message text', () => {
        render(<Toast message="Тестовое сообщение" type="success" onClose={onCloseMock} />);

        expect(screen.getByText('Тестовое сообщение')).toBeInTheDocument();
    });

    it('renders success type class and icon', () => {
        render(<Toast message="Успех" type="success" onClose={onCloseMock} />);

        expect(screen.getByTestId('toast-root')).toHaveClass('toast--success');
        expect(screen.getByText('✓')).toBeInTheDocument();
    });

    it('renders error type class and icon', () => {
        render(<Toast message="Ошибка" type="error" onClose={onCloseMock} />);

        expect(screen.getByTestId('toast-root')).toHaveClass('toast--error');
        expect(screen.getByText('✕')).toBeInTheDocument();
    });

    it('renders info type class and icon', () => {
        render(<Toast message="Инфо" type="info" onClose={onCloseMock} />);

        expect(screen.getByTestId('toast-root')).toHaveClass('toast--info');
        expect(screen.getByText('ℹ')).toBeInTheDocument();
    });

    it('renders close button with aria-label', () => {
        render(<Toast message="Сообщение" type="success" onClose={onCloseMock} />);

        expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
    });

    it('calls onClose immediately when close button is clicked', () => {
        render(<Toast message="Сообщение" type="success" onClose={onCloseMock} />);

        fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

        expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('uses default auto-close duration of 5000ms', () => {
        render(<Toast message="Сообщение" type="success" onClose={onCloseMock} />);

        // Проверяем, что таймер не срабатывает раньше 5000мс
        act(() => {
            jest.advanceTimersByTime(4999);
        });
        expect(onCloseMock).not.toHaveBeenCalled();

        // Проверяем срабатывание авто-закрытия по достижении 5000мс
        act(() => {
            jest.advanceTimersByTime(1);
        });
        expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('uses custom auto-close duration', () => {
        render(<Toast message="Сообщение" type="success" onClose={onCloseMock} duration={2000} />);

        // Проверяем, что кастомный таймер не срабатывает раньше 2000мс
        act(() => {
            jest.advanceTimersByTime(1999);
        });
        expect(onCloseMock).not.toHaveBeenCalled();

        // Проверяем срабатывание кастомного авто-закрытия на 2000мс
        act(() => {
            jest.advanceTimersByTime(1);
        });
        expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('clears timer on unmount', () => {
        const { unmount } = render(<Toast message="Сообщение" type="success" onClose={onCloseMock} />);

        // Проверяем очистку таймера при размонтировании компонента
        unmount();
        act(() => {
            jest.runAllTimers();
        });

        expect(onCloseMock).not.toHaveBeenCalled();
    });
});
