import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ticketsAPI, authAPI, artifactsAPI } from '../../services';
import type { PaginatedUsersResponse } from '../../services/authAPI';
import { Ticket, TicketStatus, TicketPriority, Artifact, User, PaginationInfo } from '../../types';
import { LoadingSpinner, StatusBadge, ListPaginationBar, Seo } from '../../components';
import SearchInputWithFocus from '../../components/SearchInputWithFocus';
import { loadTicketsViewPrefs, saveTicketsViewPrefs } from '../../utils/listViewPreferences';
import './Tickets.css';

const Tickets: React.FC = () => {
    const ticketsPrefsBoot = useMemo(() => loadTicketsViewPrefs(), []);
    const { accessToken } = useAuth();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [pagination, setPagination] = useState<PaginationInfo | null>(null);
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [restorers, setRestorers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Filters
    const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>(ticketsPrefsBoot.statusFilter);
    const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'all'>(ticketsPrefsBoot.priorityFilter);
    const [assignedFilter, setAssignedFilter] = useState<string>(ticketsPrefsBoot.assignedFilter);
    const [artifactQuery, setArtifactQuery] = useState<string>(ticketsPrefsBoot.artifactQuery);
    const [debouncedArtifactQuery, setDebouncedArtifactQuery] = useState<string>(ticketsPrefsBoot.artifactQuery);

    // Sorting
    const [sortBy, setSortBy] = useState<'created_at' | 'priority'>(ticketsPrefsBoot.sortBy);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(ticketsPrefsBoot.sortDir);

    // Pagination
    const [page, setPage] = useState<number>(ticketsPrefsBoot.page);
    const [pageSize, setPageSize] = useState<number>(ticketsPrefsBoot.pageSize);

    // Used to force refresh after updates
    const [refreshKey, setRefreshKey] = useState<number>(0);

    const ticketsFilterSigRef = useRef<string | null>(null);
    useEffect(() => {
        const sig = JSON.stringify({
            statusFilter,
            priorityFilter,
            assignedFilter,
            debouncedArtifactQuery,
            sortBy,
            sortDir,
        });
        if (ticketsFilterSigRef.current === null) {
            ticketsFilterSigRef.current = sig;
            return;
        }
        if (ticketsFilterSigRef.current !== sig) {
            ticketsFilterSigRef.current = sig;
            setPage(1);
        }
    }, [statusFilter, priorityFilter, assignedFilter, debouncedArtifactQuery, sortBy, sortDir]);

    useEffect(() => {
        saveTicketsViewPrefs({
            statusFilter,
            priorityFilter,
            assignedFilter,
            artifactQuery,
            sortBy,
            sortDir,
            page,
            pageSize,
        });
    }, [statusFilter, priorityFilter, assignedFilter, artifactQuery, sortBy, sortDir, page, pageSize]);

    const goToPage = (nextPage: number) => {
        setPage(Math.max(1, nextPage));
    };

    const handlePageSizeChange = (nextPageSize: number) => {
        const safeSize = Math.max(1, nextPageSize);
        setPageSize(safeSize);
        setPage(1);
    };
    
    // UI state
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    
    // Form state
    const [formData, setFormData] = useState({
        artifact_id: '',
        title: '',
        description: '',
        priority: 'medium' as TicketPriority,
        assigned_to_id: '',
        notes: ''
    });

    useEffect(() => {
        if (!accessToken) return;

        const loadDropdownData = async () => {
            try {
                const [artifactsResp, restorersResp] = await Promise.all([
                    artifactsAPI.fetchArtifacts({ page: 1, pageSize: 1000, sortBy: 'title', sortDir: 'asc' }, accessToken),
                    authAPI.getUsers('restorer', false, accessToken, { page: 1, pageSize: 500 }).catch((): PaginatedUsersResponse => ({
                        users: [],
                        pagination: { currentPage: 1, totalPages: 0, totalItems: 0, itemsPerPage: 500 },
                    })),
                ]);

                setArtifacts(artifactsResp.artifacts);
                let restorerList = restorersResp.users;

                // If no restorers found, try to get all active users as fallback
                if (restorerList.length === 0) {
                    try {
                        const allUsersResp = await authAPI.getUsers(undefined, false, accessToken, {
                            page: 1,
                            pageSize: 500,
                        });
                        restorerList = allUsersResp.users;
                    } catch (err) {
                        console.warn('Could not load users for assignment:', err);
                    }
                }
                setRestorers(restorerList);
            } catch (err) {
                console.error('Failed to load dropdown data:', err);
            }
        };

        loadDropdownData();
    }, [accessToken]);

    // Debounce artifact-name search so we don't refetch on every keystroke.
    useEffect(() => {
        const t = window.setTimeout(() => {
            setDebouncedArtifactQuery(artifactQuery);
        }, 300);

        return () => window.clearTimeout(t);
    }, [artifactQuery]);

    useEffect(() => {
        if (!accessToken) return;

        const loadTickets = async () => {
            try {
                setLoading(true);
                setError(null);

                const params: any = {
                    page,
                    pageSize,
                    sortBy,
                    sortDir,
                };

                if (statusFilter !== 'all') params.status = statusFilter;
                if (priorityFilter !== 'all') params.priority = priorityFilter;
                if (assignedFilter) params.assigned_to = assignedFilter;
                if (debouncedArtifactQuery) params.artifact_q = debouncedArtifactQuery;

                const resp = await ticketsAPI.fetchTickets(params, accessToken);
                setTickets(resp.tickets);
                setPagination(resp.pagination);
            } catch (err) {
                console.error('Failed to load tickets:', err);
                setError('Не удалось загрузить тикеты');
            } finally {
                setLoading(false);
            }
        };

        loadTickets();
    }, [
        accessToken,
        statusFilter,
        priorityFilter,
        assignedFilter,
        debouncedArtifactQuery,
        page,
        pageSize,
        sortBy,
        sortDir,
        refreshKey
    ]);

    const handleCreateTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accessToken) return;
        
        try {
            setError(null);
            await ticketsAPI.createTicket({
                artifact_id: formData.artifact_id,
                title: formData.title,
                description: formData.description || undefined,
                priority: formData.priority,
                assigned_to_id: formData.assigned_to_id || undefined,
                notes: formData.notes || undefined
            }, accessToken);

            setShowCreateForm(false);
            setPage(1);
            setRefreshKey((k) => k + 1);
            setFormData({
                artifact_id: '',
                title: '',
                description: '',
                priority: 'medium',
                assigned_to_id: '',
                notes: ''
            });
        } catch (err) {
            console.error('Failed to create ticket:', err);
            setError('Не удалось создать тикет');
        }
    };

    const handleUpdateStatus = async (ticketId: string, newStatus: TicketStatus) => {
        if (!accessToken) return;
        
        try {
            const updatedTicket = await ticketsAPI.updateTicket(
                ticketId,
                { status: newStatus },
                accessToken
            );
            
            setTickets(tickets.map(t => t.id === ticketId ? updatedTicket : t));
            if (selectedTicket?.id === ticketId) {
                setSelectedTicket(updatedTicket);
            }
            setRefreshKey((k) => k + 1);
        } catch (err) {
            console.error('Failed to update ticket:', err);
            setError('Не удалось обновить статус тикета');
        }
    };

    const handleAssignRestorer = async (ticketId: string, restorerId: string) => {
        if (!accessToken) return;
        
        try {
            const updatedTicket = await ticketsAPI.updateTicket(
                ticketId,
                { assigned_to_id: restorerId || undefined },
                accessToken
            );
            
            setTickets(tickets.map(t => t.id === ticketId ? updatedTicket : t));
            if (selectedTicket?.id === ticketId) {
                setSelectedTicket(updatedTicket);
            }
            setRefreshKey((k) => k + 1);
        } catch (err) {
            console.error('Failed to assign restorer:', err);
            setError('Не удалось назначить реставратора');
        }
    };

    const getPriorityLabel = (priority: TicketPriority): string => {
        const labels: Record<TicketPriority, string> = {
            low: 'Низкий',
            medium: 'Средний',
            high: 'Высокий',
            urgent: 'Срочный'
        };
        return labels[priority];
    };

    const getPriorityClass = (priority: TicketPriority): string => {
        return `priority-${priority}`;
    };

    return (
        <div className="tickets-page">
            <Seo
                title="Тикеты реставрации"
                description="Реставрационные тикеты ArtGuardian: статусы, приоритеты и назначения."
                canonicalPath="/tickets"
            />
            <div className="page-header">
                <h1>Реставрационные тикеты</h1>
                <button 
                    className="btn btn-primary"
                    onClick={() => setShowCreateForm(true)}
                >
                    🎫 Создать тикет
                </button>
            </div>

            {error && (
                <div className="error-message">
                    {error}
                </div>
            )}

            <div className="tickets-filters">
                <div className="filter-group">
                    <label>Статус:</label>
                    <select 
                        value={statusFilter} 
                        onChange={(e) => {
                            setStatusFilter(e.target.value as TicketStatus | 'all');
                            setPage(1);
                        }}
                    >
                        <option value="all">Все</option>
                        <option value="open">Открыт</option>
                        <option value="in_progress">В работе</option>
                        <option value="completed">Завершен</option>
                    </select>
                </div>
                <div className="filter-group">
                    <label>Приоритет:</label>
                    <select 
                        value={priorityFilter} 
                        onChange={(e) => {
                            setPriorityFilter(e.target.value as TicketPriority | 'all');
                            setPage(1);
                        }}
                    >
                        <option value="all">Все</option>
                        <option value="low">Низкий</option>
                        <option value="medium">Средний</option>
                        <option value="high">Высокий</option>
                        <option value="urgent">Срочный</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label>Назначен реставратору:</label>
                    <select
                        value={assignedFilter}
                        onChange={(e) => {
                            setAssignedFilter(e.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="">Любой</option>
                        {restorers.map((user) => (
                            <option key={user.id} value={user.id}>
                                {user.name} {user.role !== 'restorer' ? `(${user.role})` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <label>Артефакт (название):</label>
                    <SearchInputWithFocus
                        value={artifactQuery}
                        onChange={(next) => {
                            setArtifactQuery(next);
                            setPage(1);
                        }}
                        loading={loading}
                        storageFocusedKey="tickets_artifact_search_focused"
                        placeholder="Поиск по названию артефакта..."
                    />
                </div>

                <div className="filter-group">
                    <label>Сортировка:</label>
                    <select
                        value={sortBy}
                        onChange={(e) => {
                            setSortBy(e.target.value as 'created_at' | 'priority');
                            setPage(1);
                        }}
                    >
                        <option value="created_at">Дата создания</option>
                        <option value="priority">Приоритет</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label>Направление:</label>
                    <select
                        value={sortDir}
                        onChange={(e) => {
                            setSortDir(e.target.value as 'asc' | 'desc');
                            setPage(1);
                        }}
                    >
                        <option value="desc">По убыванию</option>
                        <option value="asc">По возрастанию</option>
                    </select>
                </div>
            </div>

            {showCreateForm && (
                <div className="modal-overlay" onClick={() => setShowCreateForm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Создать тикет</h2>
                            <button className="close-btn" onClick={() => setShowCreateForm(false)}>×</button>
                        </div>
                        <form onSubmit={handleCreateTicket} className="ticket-form">
                            <div className="form-group">
                                <label>Артефакт *</label>
                                <select
                                    value={formData.artifact_id}
                                    onChange={(e) => setFormData({...formData, artifact_id: e.target.value})}
                                    required
                                >
                                    <option value="">Выберите артефакт</option>
                                    {artifacts.map(artifact => (
                                        <option key={artifact.id} value={artifact.id}>
                                            {artifact.title} ({artifact.inventoryNumber})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="form-group">
                                <label>Название *</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                                    required
                                    placeholder="Например: Реставрация картины"
                                />
                            </div>
                            
                            <div className="form-group">
                                <label>Описание</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                                    rows={4}
                                    placeholder="Описание проблемы или необходимых работ"
                                />
                            </div>
                            
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Приоритет</label>
                                    <select
                                        value={formData.priority}
                                        onChange={(e) => setFormData({...formData, priority: e.target.value as TicketPriority})}
                                    >
                                        <option value="low">Низкий</option>
                                        <option value="medium">Средний</option>
                                        <option value="high">Высокий</option>
                                        <option value="urgent">Срочный</option>
                                    </select>
                                </div>
                                
                                <div className="form-group">
                                    <label>Назначить реставратора</label>
                                    <select
                                        value={formData.assigned_to_id}
                                        onChange={(e) => setFormData({...formData, assigned_to_id: e.target.value})}
                                    >
                                        <option value="">Не назначен</option>
                                        {restorers.length > 0 ? (
                                            restorers.map(user => (
                                                <option key={user.id} value={user.id}>
                                                    {user.name} {user.role !== 'restorer' ? `(${user.role})` : ''}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="" disabled>Нет доступных пользователей</option>
                                        )}
                                    </select>
                                    {restorers.length === 0 && (
                                        <small className="form-hint">
                                            Нет пользователей с ролью "restorer". Будут показаны все активные пользователи.
                                        </small>
                                    )}
                                </div>
                            </div>
                            
                            <div className="form-group">
                                <label>Заметки</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                    rows={3}
                                    placeholder="Дополнительные заметки"
                                />
                            </div>
                            
                            <div className="form-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>
                                    Отмена
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Создать тикет
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="tickets-content">
                {loading ? (
                    <LoadingSpinner text="Загрузка тикетов..." />
                ) : tickets.length === 0 ? (
                    <div className="tickets-empty">
                        <div className="empty-icon">📋</div>
                        <h3>Нет тикетов</h3>
                        <p>Создайте первый тикет для начала работы</p>
                    </div>
                ) : (
                    <div className="tickets-list">
                        {tickets.map(ticket => (
                            <div
                                key={ticket.id}
                                className={`ticket-card ${getPriorityClass(ticket.priority)}`}
                                onClick={() => setSelectedTicket(ticket)}
                            >
                                <div className="ticket-card__header">
                                    <div className="ticket-card__title-row">
                                        <h3>{ticket.title}</h3>
                                        <StatusBadge status={ticket.status as any} />
                                    </div>
                                    <div className="ticket-card__meta">
                                        <span className="ticket-priority">{getPriorityLabel(ticket.priority)}</span>
                                        <span className="ticket-date">
                                            {new Date(ticket.created_at).toLocaleDateString('ru-RU')}
                                        </span>
                                    </div>
                                </div>

                                <div className="ticket-card__body">
                                    {ticket.artifact_title && (
                                        <div className="ticket-artifact">
                                            <strong>Артефакт:</strong> {ticket.artifact_title}
                                        </div>
                                    )}
                                    {ticket.description && (
                                        <p className="ticket-description">{ticket.description}</p>
                                    )}
                                </div>

                                <div className="ticket-card__footer">
                                    <div className="ticket-assignment">
                                        {ticket.assigned_to_name ? (
                                            <span>Назначен: {ticket.assigned_to_name}</span>
                                        ) : (
                                            <span className="unassigned">Не назначен</span>
                                        )}
                                    </div>
                                    <div className="ticket-creator">
                                        Создан: {ticket.created_by_name || 'Неизвестно'}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {pagination && (
                <ListPaginationBar
                    pagination={pagination}
                    page={page}
                    onPageChange={goToPage}
                    pageSize={pageSize}
                    onPageSizeChange={handlePageSizeChange}
                    pageSizeOptions={[12, 20, 50]}
                    showTotalCount
                />
            )}

            {selectedTicket && (
                <div className="modal-overlay" onClick={() => setSelectedTicket(null)}>
                    <div className="modal-content ticket-detail" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{selectedTicket.title}</h2>
                            <button className="close-btn" onClick={() => setSelectedTicket(null)}>×</button>
                        </div>
                        
                        <div className="ticket-detail__content">
                            <div className="ticket-detail__section">
                                <h3>Информация</h3>
                                <div className="detail-row">
                                    <strong>Статус:</strong>
                                    <StatusBadge status={selectedTicket.status as any} />
                                </div>
                                <div className="detail-row">
                                    <strong>Приоритет:</strong>
                                    <span className={getPriorityClass(selectedTicket.priority)}>
                                        {getPriorityLabel(selectedTicket.priority)}
                                    </span>
                                </div>
                                {selectedTicket.artifact_title && (
                                    <div className="detail-row">
                                        <strong>Артефакт:</strong>
                                        <span>{selectedTicket.artifact_title}</span>
                                    </div>
                                )}
                                <div className="detail-row">
                                    <strong>Создан:</strong>
                                    <span>{new Date(selectedTicket.created_at).toLocaleString('ru-RU')}</span>
                                </div>
                                {selectedTicket.completed_at && (
                                    <div className="detail-row">
                                        <strong>Завершен:</strong>
                                        <span>{new Date(selectedTicket.completed_at).toLocaleString('ru-RU')}</span>
                                    </div>
                                )}
                            </div>
                            
                            {selectedTicket.description && (
                                <div className="ticket-detail__section">
                                    <h3>Описание</h3>
                                    <p>{selectedTicket.description}</p>
                                </div>
                            )}
                            
                            {selectedTicket.notes && (
                                <div className="ticket-detail__section">
                                    <h3>Заметки</h3>
                                    <p>{selectedTicket.notes}</p>
                                </div>
                            )}
                            
                            <div className="ticket-detail__section">
                                <h3>Управление</h3>
                                
                                <div className="form-group">
                                    <label>Статус</label>
                                    <select
                                        value={selectedTicket.status}
                                        onChange={(e) => handleUpdateStatus(selectedTicket.id, e.target.value as TicketStatus)}
                                    >
                                        <option value="open">Открыт</option>
                                        <option value="in_progress">В работе</option>
                                        <option value="completed">Завершен</option>
                                    </select>
                                </div>
                                
                                <div className="form-group">
                                    <label>Назначить реставратора</label>
                                    <select
                                        value={selectedTicket.assigned_to_id || ''}
                                        onChange={(e) => handleAssignRestorer(selectedTicket.id, e.target.value)}
                                    >
                                        <option value="">Не назначен</option>
                                        {restorers.map(restorer => (
                                            <option key={restorer.id} value={restorer.id}>
                                                {restorer.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Tickets;
