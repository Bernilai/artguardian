import React from 'react';
import type { PaginationInfo } from '../../../types';
import './ListPaginationBar.css';

export interface ListPaginationBarProps {
    pagination: PaginationInfo;
    /** Current page index used for prev/next disabled state (usually matches API after load). */
    page: number;
    onPageChange: (page: number) => void;
    pageSize: number;
    onPageSizeChange: (pageSize: number) => void;
    pageSizeOptions: number[];
    /** Append ` (всего: N)` after the page indicator. */
    showTotalCount?: boolean;
    className?: string;
}

const ListPaginationBar: React.FC<ListPaginationBarProps> = ({
    pagination,
    page,
    onPageChange,
    pageSize,
    onPageSizeChange,
    pageSizeOptions,
    showTotalCount = false,
    className = '',
}) => {
    const totalPages = pagination.totalPages || 1;

    return (
        <div className={['list-pagination-bar', className].filter(Boolean).join(' ')}>
            <button
                type="button"
                className="btn btn-primary"
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={page <= 1}
            >
                Назад
            </button>
            <div className="list-pagination-bar__info">
                Страница {pagination.currentPage} из {totalPages}
                {showTotalCount ? ` (всего: ${pagination.totalItems})` : ''}
            </div>
            <button
                type="button"
                className="btn btn-primary"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= pagination.totalPages}
            >
                Далее
            </button>
            <div className="list-pagination-bar__page-size">
                <label>
                    На странице:
                    <select
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    >
                        {pageSizeOptions.map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
        </div>
    );
};

export default ListPaginationBar;
