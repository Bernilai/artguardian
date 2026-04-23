import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ListPaginationBar from '../ListPaginationBar';
import type { PaginationInfo } from '../../../../../types';

const makePagination = (overrides: Partial<PaginationInfo> = {}): PaginationInfo => ({
    currentPage: 1,
    totalPages: 3,
    totalItems: 30,
    itemsPerPage: 10,
    ...overrides,
});

describe('ListPaginationBar', () => {
    let onPageChange: jest.Mock;
    let onPageSizeChange: jest.Mock;

    const renderComponent = (
        {
            page = 1,
            pageSize = 10,
            pageSizeOptions = [10, 25, 50],
            pagination = makePagination(),
            showTotalCount = false,
            className,
        }: {
            page?: number;
            pageSize?: number;
            pageSizeOptions?: number[];
            pagination?: PaginationInfo;
            showTotalCount?: boolean;
            className?: string;
        } = {},
    ) =>
        render(
            <ListPaginationBar
                pagination={pagination}
                page={page}
                onPageChange={onPageChange}
                pageSize={pageSize}
                onPageSizeChange={onPageSizeChange}
                pageSizeOptions={pageSizeOptions}
                showTotalCount={showTotalCount}
                className={className}
            />,
        );

    beforeEach(() => {
        onPageChange = jest.fn();
        onPageSizeChange = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('rendering', () => {
        it('shows page indicator text', () => {
            renderComponent();

            expect(screen.getByText('Страница 1 из 3')).toBeInTheDocument();
        });

        it('does not show total count by default', () => {
            renderComponent();

            expect(screen.queryByText('(всего: 30)')).not.toBeInTheDocument();
        });

        it('shows total count when showTotalCount is true', () => {
            renderComponent({ showTotalCount: true });

            expect(screen.getByText('Страница 1 из 3 (всего: 30)')).toBeInTheDocument();
        });

        it('adds custom className to root element', () => {
            renderComponent({ className: 'my-class' });

            expect(screen.getByTestId('list-pagination-bar')).toHaveClass('my-class');
        });

        it('renders all page size options in select', () => {
            renderComponent({ pageSizeOptions: [10, 25, 50] });

            const options = screen.getAllByRole('option');
            expect(options).toHaveLength(3);
            expect(options.map((option) => option.textContent)).toEqual(['10', '25', '50']);
        });
    });

    describe('Назад button', () => {
        it('is disabled when page is 1', () => {
            renderComponent({ page: 1 });

            expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled();
        });

        it('is enabled on page 2 and click calls onPageChange(1)', () => {
            renderComponent({
                page: 2,
                pagination: makePagination({ currentPage: 2 }),
            });

            fireEvent.click(screen.getByRole('button', { name: 'Назад' }));

            expect(onPageChange).toHaveBeenCalledWith(1);
        });

        it('on page 3 click calls onPageChange(2)', () => {
            renderComponent({
                page: 3,
                pagination: makePagination({ currentPage: 3 }),
            });

            fireEvent.click(screen.getByRole('button', { name: 'Назад' }));

            expect(onPageChange).toHaveBeenCalledWith(2);
        });
    });

    describe('Далее button', () => {
        it('is disabled when page equals totalPages', () => {
            renderComponent({
                page: 3,
                pagination: makePagination({ currentPage: 3, totalPages: 3 }),
            });

            expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();
        });

        it('is enabled on page 1 and click calls onPageChange(2)', () => {
            renderComponent({ page: 1 });

            fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

            expect(onPageChange).toHaveBeenCalledWith(2);
        });

        it('on page 2 with totalPages=3 click calls onPageChange(3)', () => {
            renderComponent({
                page: 2,
                pagination: makePagination({ currentPage: 2, totalPages: 3 }),
            });

            fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

            expect(onPageChange).toHaveBeenCalledWith(3);
        });
    });

    describe('page size select', () => {
        it("calls onPageSizeChange(25) when value changes to '25'", () => {
            renderComponent();

            fireEvent.change(screen.getByRole('combobox'), { target: { value: '25' } });

            expect(onPageSizeChange).toHaveBeenCalledWith(25);
        });

        it("keeps current pageSize value as '25' when pageSize is 25", () => {
            renderComponent({ pageSize: 25 });

            expect(screen.getByRole('combobox')).toHaveValue('25');
        });
    });
});
