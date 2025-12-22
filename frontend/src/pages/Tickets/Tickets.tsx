import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ticketsAPI, authAPI, artifactsAPI } from '../../services';
import { Ticket, TicketStatus, TicketPriority, Artifact, User } from '../../types';
import { LoadingSpinner, StatusBadge } from '../../components';
import './Tickets.css';

const Tickets: React.FC = () => {
    const { accessToken } = useAuth();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [restorers, setRestorers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Filters
    const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
    const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'all'>('all');
    
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
        loadData();
    }, [accessToken, statusFilter]);

    const loadData = async () => {
        if (!accessToken) return;
        
        try {
            setLoading(true);
            setError(null);
            
            // Load tickets with filters
            const filters: any = {};
            if (statusFilter !== 'all') {
                filters.status = statusFilter;
            }
            
            const [ticketsData, artifactsList, restorersData] = await Promise.all([
                ticketsAPI.fetchTickets(filters, accessToken),
                artifactsAPI.fetchArtifacts(accessToken),
                authAPI.getUsers('restorer', false, accessToken).catch(() => []) // Fallback to empty array if error
            ]);
            
            setTickets(ticketsData);
            setArtifacts(artifactsList);
            setRestorers(restorersData);
            
            // If no restorers found, try to get all active users as fallback
            if (restorersData.length === 0) {
                try {
                    const allUsers = await authAPI.getUsers(undefined, false, accessToken);
                    setRestorers(allUsers);
                } catch (err) {
                    console.warn('Could not load users for assignment:', err);
                }
            }
            
        } catch (err) {
            console.error('Failed to load tickets:', err);
            setError('Не удалось загрузить тикеты');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accessToken) return;
        
        try {
            setError(null);
            const newTicket = await ticketsAPI.createTicket({
                artifact_id: formData.artifact_id,
                title: formData.title,
                description: formData.description || undefined,
                priority: formData.priority,
                assigned_to_id: formData.assigned_to_id || undefined,
                notes: formData.notes || undefined
            }, accessToken);
            
            setTickets([newTicket, ...tickets]);
            setShowCreateForm(false);
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
        } catch (err) {
            console.error('Failed to assign restorer:', err);
            setError('Не удалось назначить реставратора');
        }
    };

    const getStatusLabel = (status: TicketStatus): string => {
        const labels: Record<TicketStatus, string> = {
            open: 'Открыт',
            in_progress: 'В работе',
            completed: 'Завершен'
        };
        return labels[status];
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

    if (loading) {
        return (
            <div className="tickets-page">
                <LoadingSpinner text="Загрузка тикетов..." />
            </div>
        );
    }

    return (
        <div className="tickets-page">
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

            {/* Filters */}
            <div className="tickets-filters">
                <div className="filter-group">
                    <label>Статус:</label>
                    <select 
                        value={statusFilter} 
                        onChange={(e) => setStatusFilter(e.target.value as TicketStatus | 'all')}
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
                        onChange={(e) => setPriorityFilter(e.target.value as TicketPriority | 'all')}
                    >
                        <option value="all">Все</option>
                        <option value="low">Низкий</option>
                        <option value="medium">Средний</option>
                        <option value="high">Высокий</option>
                        <option value="urgent">Срочный</option>
                    </select>
                </div>
            </div>

            {/* Create Ticket Form */}
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

            {/* Tickets List */}
            <div className="tickets-content">
                {tickets.length === 0 ? (
                    <div className="tickets-empty">
                        <div className="empty-icon">📋</div>
                        <h3>Нет тикетов</h3>
                        <p>Создайте первый тикет для начала работы</p>
                    </div>
                ) : (
                    <div className="tickets-list">
                        {tickets
                            .filter(ticket => priorityFilter === 'all' || ticket.priority === priorityFilter)
                            .map(ticket => (
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

            {/* Ticket Detail Modal */}
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
