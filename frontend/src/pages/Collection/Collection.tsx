import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {ArtifactList, LoadingSpinner, ArtifactForm, ArtifactDetail, Toast, ToastType, ListPaginationBar, Seo} from "../../components";
import {Artifact, ArtifactStatus} from "../../types";
import './Collection.css';
import {useApi} from "../../hooks";
import { useAuth } from "../../contexts/AuthContext";
import { autoDetectionAPI, aiPreferencesAPI, artifactsAPI } from "../../services";
import SearchInputWithFocus from '../../components/SearchInputWithFocus';
import { loadCollectionViewPrefs, saveCollectionViewPrefs } from '../../utils/listViewPreferences';

const Collection: React.FC = () => {
    const { artifactId: routeArtifactId } = useParams<{ artifactId?: string }>();
    const navigate = useNavigate();
    const listPrefsBoot = useMemo(() => loadCollectionViewPrefs(), []);
    const { artifacts, loading, error, refetch, fetchArtifactById, pagination } = useApi();
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>(listPrefsBoot.viewMode);
    const [showForm, setShowForm] = useState(false);
    const [showDetail, setShowDetail] = useState(false);
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [editingArtifact, setEditingArtifact] = useState<Artifact | null>(null);
    const [autoDetecting, setAutoDetecting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
    const [searchQuery, setSearchQuery] = useState(listPrefsBoot.searchQuery);
    /** Text sent to the API — updated only after debounce, so list fetch does not run on every keystroke. */
    const [debouncedSearch, setDebouncedSearch] = useState(listPrefsBoot.searchQuery);
    const [inspecting, setInspecting] = useState(false);
    const [statusFilter, setStatusFilter] = useState<ArtifactStatus | 'all'>(listPrefsBoot.statusFilter);
    const [collectionFilter, setCollectionFilter] = useState<string>(listPrefsBoot.collectionFilter);
    const [sortBy, setSortBy] = useState<'created_at' | 'title' | 'status'>(listPrefsBoot.sortBy);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(listPrefsBoot.sortDir);
    const [page, setPage] = useState<number>(listPrefsBoot.page);
    const [pageSize, setPageSize] = useState<number>(listPrefsBoot.pageSize);
    const { accessToken } = useAuth();
    /** Boolean only — JWT refresh replaces the string and would retrigger effects if we depended on `accessToken`. */
    const hasAuthToken = !!accessToken;
    const refetchRef = useRef(refetch);
    refetchRef.current = refetch;
    /** First run after mount: keep restored `page`; later filter/sort/search changes reset to page 1. */
    const isFirstListLoadRef = useRef(true);
    const prevListFiltersKeyRef = useRef('');
    const prevRouteArtifactIdRef = useRef<string | undefined>(undefined);

    // Deep link: /collection/artifact/:artifactId
    useEffect(() => {
        if (!hasAuthToken || !routeArtifactId) return;
        if (selectedArtifact?.id === routeArtifactId && showDetail) return;
        let cancelled = false;
        (async () => {
            setDetailLoading(true);
            setShowDetail(true);
            try {
                const full = await fetchArtifactById(routeArtifactId);
                if (cancelled) return;
                if (!full) {
                    setShowDetail(false);
                    setSelectedArtifact(null);
                    navigate('/collection', { replace: true });
                    setToast({
                        message: 'Артефакт не найден.',
                        type: 'error',
                    });
                    return;
                }
                setSelectedArtifact(full);
            } finally {
                if (!cancelled) setDetailLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [hasAuthToken, routeArtifactId, fetchArtifactById, navigate, selectedArtifact?.id, showDetail]);

    useEffect(() => {
        const prev = prevRouteArtifactIdRef.current;
        if (prev && !routeArtifactId) {
            setShowDetail(false);
            setSelectedArtifact(null);
        }
        prevRouteArtifactIdRef.current = routeArtifactId;
    }, [routeArtifactId]);

    const listFiltersKey = useMemo(
        () =>
            JSON.stringify({
                debouncedSearch,
                statusFilter,
                collectionFilter,
                sortBy,
                sortDir,
            }),
        [debouncedSearch, statusFilter, collectionFilter, sortBy, sortDir]
    );

    const buildFetchParams = useCallback(
        (qOverride?: string, pageOverride?: number, pageSizeOverride?: number) => {
            return {
                q: qOverride !== undefined ? (qOverride || undefined) : (debouncedSearch || undefined),
                status: statusFilter,
                collection: collectionFilter || undefined,
                page: pageOverride ?? page,
                pageSize: pageSizeOverride ?? pageSize,
                sortBy,
                sortDir,
            };
        },
        [debouncedSearch, statusFilter, collectionFilter, page, pageSize, sortBy, sortDir]
    );

    const goToPage = (nextPage: number) => {
        const safePage = Math.max(1, nextPage);
        setPage(safePage);
    };

    const handlePageSizeChange = (nextPageSize: number) => {
        const safeSize = Math.max(1, nextPageSize);
        setPageSize(safeSize);
        setPage(1);
    };

    useEffect(() => {
        saveCollectionViewPrefs({
            searchQuery,
            statusFilter,
            collectionFilter,
            sortBy,
            sortDir,
            page,
            pageSize,
            viewMode,
        });
    }, [searchQuery, statusFilter, collectionFilter, sortBy, sortDir, page, pageSize, viewMode]);

    // Debounce typing: only `debouncedSearch` changes after idle, so the list fetch effect runs sparingly.
    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedSearch(searchQuery), 450);
        return () => window.clearTimeout(t);
    }, [searchQuery]);

    // Do not depend on `refetch` or the raw JWT string: both can change without needing a new list load.
    // Depend on `hasAuthToken` so we load when the user becomes authenticated, but not on every silent refresh.
    useEffect(() => {
        if (!hasAuthToken) return;

        if (isFirstListLoadRef.current) {
            isFirstListLoadRef.current = false;
            prevListFiltersKeyRef.current = listFiltersKey;
            refetchRef.current(buildFetchParams());
            return;
        }

        const filtersChanged = prevListFiltersKeyRef.current !== listFiltersKey;
        if (filtersChanged) {
            prevListFiltersKeyRef.current = listFiltersKey;
            if (page !== 1) {
                setPage(1);
                return;
            }
            refetchRef.current(buildFetchParams(undefined, 1));
            return;
        }

        refetchRef.current(buildFetchParams());
    }, [hasAuthToken, listFiltersKey, page, pageSize, buildFetchParams]);

    const handleArtifactClick = (artifact: Artifact) => {
        setSelectedArtifact(artifact);
        setShowDetail(true);
        navigate(`/collection/artifact/${artifact.id}`, { replace: false });
    };

    const handleEditArtifact = (artifact: Artifact) => {
        setEditingArtifact(artifact);
        setShowForm(true);
    };

    const handleInspectArtifact = async (artifact: Artifact) => {
        setDetailLoading(true);
        setShowDetail(true);
        try {
            const fullArtifact = await fetchArtifactById(artifact.id);
            if (fullArtifact) {
                setSelectedArtifact(fullArtifact);
            } else {
                setSelectedArtifact(artifact);
            }
        } catch (err) {
            console.error('Failed to fetch artifact details:', err);
            setSelectedArtifact(artifact);
        } finally {
            setDetailLoading(false);
        }
        navigate(`/collection/artifact/${artifact.id}`, { replace: false });
    };

    const handleAddArtifact = () => {
        setShowForm(true);
    };

    const handleFormClose = () => {
        setShowForm(false);
        setEditingArtifact(null);
    };

    const handleFormSuccess = () => {
        refetch(buildFetchParams(undefined, page));
        setEditingArtifact(null);
    };

    const handleDetailClose = () => {
        setShowDetail(false);
        setSelectedArtifact(null);
        setDetailLoading(false);
        navigate('/collection', { replace: true });
    };

    const handleDetailEdit = (artifact: Artifact) => {
        setShowDetail(false);
        setSelectedArtifact(null);
        navigate('/collection', { replace: true });
        handleEditArtifact(artifact);
    };

    const handleAutoDetect = async (artifact: Artifact) => {
        if (!accessToken || !artifact.id) return;
        
        try {
            setAutoDetecting(true);
            
            const status = await autoDetectionAPI.getStatus(accessToken);
            if (!status.available) {
                setToast({
                    message: 'AI анализ недоступен. Убедитесь, что модель установлена и настроена.',
                    type: 'error'
                });
                return;
            }

            const preferences = await aiPreferencesAPI.getPreferences(accessToken);
            
            if (!preferences.enabled) {
                setToast({
                    message: 'AI анализ отключен в настройках. Включите его в разделе "AI Анализ" настроек.',
                    type: 'error'
                });
                return;
            }

            const result = await autoDetectionAPI.detectDamage(
                artifact.id,
                preferences.auto_create_tickets,
                preferences.min_confidence,
                accessToken
            );

            if (result.detected) {
                const message = `Обнаружено ${result.damage_count} областей повреждения (${result.damage_percentage.toFixed(1)}% изображения). Создано записей: ${result.detections_created}${result.ticket_created ? '. Тикет автоматически создан.' : ''}`;
                setToast({
                    message,
                    type: 'success'
                });
                await refetch(buildFetchParams(undefined, page));
                if (selectedArtifact?.id === artifact.id) {
                    const updated = await fetchArtifactById(artifact.id);
                    if (updated) {
                        setSelectedArtifact(updated);
                    }
                }
            } else {
                setToast({
                    message: 'Повреждения не обнаружены.',
                    type: 'info'
                });
            }
        } catch (err: any) {
            console.error('Auto-detection failed:', err);
            const errorMsg = err?.response?.data?.detail || err?.message || 'Не удалось выполнить автоматический анализ изображения. Пожалуйста, используйте ручное обнаружение повреждений.';
            setToast({
                message: errorMsg,
                type: 'error'
            });
        } finally {
            setAutoDetecting(false);
        }
    };

    const handleInspect = async (artifact: Artifact) => {
        if (!accessToken || !artifact.id) return;
        
        try {
            setInspecting(true);
            const updated = await artifactsAPI.inspectArtifact(artifact.id, accessToken);
            
            setToast({
                message: 'Проверка артефакта зафиксирована',
                type: 'success'
            });
            
            await refetch(buildFetchParams(undefined, page));
            if (selectedArtifact?.id === artifact.id) {
                setSelectedArtifact(updated);
            }
        } catch (err: any) {
            console.error('Inspection failed:', err);
            const errorMsg = err?.response?.data?.detail || err?.message || 'Не удалось зафиксировать проверку';
            setToast({
                message: errorMsg,
                type: 'error'
            });
        } finally {
            setInspecting(false);
        }
    };

    if (error) {
        return (
            <div className="collection-page">
                <Seo
                    title="Коллекция"
                    description="Каталог артефактов ArtGuardian."
                    canonicalPath="/collection"
                />
                <div className="error-message">
                    <h2>Ошибка загрузки</h2>
                    <p>{error}</p>
                    <button onClick={() => window.location.reload()}>
                        Попробовать снова
                    </button>
                </div>
            </div>
        );
    }

    const seoDescription =
        showDetail && selectedArtifact
            ? `${selectedArtifact.title}. Инв. ${selectedArtifact.inventoryNumber}. ${(selectedArtifact.description || '').slice(0, 140)}`
            : 'Каталог музейных артефактов: статус, изображения, дефекты и реставрация в ArtGuardian.';
    const seoPath = routeArtifactId
        ? `/collection/artifact/${routeArtifactId}`
        : '/collection';

    return (
        <div className="collection-page">
            <Seo
                title={
                    showDetail && selectedArtifact
                        ? selectedArtifact.title
                        : 'Коллекция артефактов'
                }
                description={seoDescription}
                canonicalPath={seoPath}
                jsonLd={
                    showDetail && selectedArtifact
                        ? {
                              '@context': 'https://schema.org',
                              '@type': 'VisualArtwork',
                              name: selectedArtifact.title,
                              description: selectedArtifact.description || undefined,
                          }
                        : {
                              '@context': 'https://schema.org',
                              '@type': 'CollectionPage',
                              name: 'Коллекция артефактов',
                              description: seoDescription,
                          }
                }
            />
            <div className="page-header">
                <h1>Коллекция артефактов</h1>
                <div className="page-actions">
                    <button className="btn btn-primary" onClick={handleAddArtifact}>
                        ➕ Добавить артефакт
                    </button>
                </div>
            </div>

            {loading && (
                <div className="collection-loading-overlay" aria-hidden="true">
                    <LoadingSpinner size="large" text="Загрузка коллекции..." />
                </div>
            )}

            <div className="search-bar">
                <SearchInputWithFocus
                    value={searchQuery}
                    onChange={(next) => setSearchQuery(next)}
                    loading={loading}
                    storageFocusedKey="collection_search_focused"
                    placeholder="Поиск по названию артефакта..."
                    inputClassName="search-input"
                />
            </div>

            <div className="view-controls">
                <div className="view-toggle">
                    <button
                        className={viewMode === 'grid' ? 'active' : ''}
                        onClick={() => setViewMode('grid')}
                    >
                        ⏹️ Сетка
                    </button>
                    <button
                        className={viewMode === 'list' ? 'active' : ''}
                        onClick={() => setViewMode('list')}
                    >
                        📋 Список
                    </button>
                    <button
                        className={viewMode === 'compact' ? 'active' : ''}
                        onClick={() => setViewMode('compact')}
                    >
                        📱 Компактно
                    </button>
                </div>

                <div className="results-info">
                    Найдено артефактов: {pagination ? pagination.totalItems : artifacts.length}
                    {pagination ? ` (стр. ${pagination.currentPage} из ${pagination.totalPages || 1})` : ''}
                </div>
            </div>

            <div className="collection-filters">
                <div className="filter-group">
                    <label>Статус:</label>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as ArtifactStatus | 'all')}
                    >
                        <option value="all">Все</option>
                        <option value="good">Хорошее</option>
                        <option value="requires_attention">Требует внимания</option>
                        <option value="critical">Критическое</option>
                        <option value="under_restoration">На реставрации</option>
                        <option value="exhibited">Экспонируется</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label>Коллекция:</label>
                    <input
                        type="text"
                        value={collectionFilter}
                        onChange={(e) => setCollectionFilter(e.target.value)}
                        placeholder="Напр. Живопись"
                    />
                </div>

                <div className="filter-group">
                    <label>Сортировка:</label>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'created_at' | 'title' | 'status')}
                    >
                        <option value="created_at">Дата создания</option>
                        <option value="title">Название</option>
                        <option value="status">Статус</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label>Направление:</label>
                    <select
                        value={sortDir}
                        onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
                    >
                        <option value="desc">По убыванию</option>
                        <option value="asc">По возрастанию</option>
                    </select>
                </div>
            </div>

            <ArtifactList
                artifacts={artifacts}
                viewMode={viewMode}
                onArtifactClick={handleArtifactClick}
                onEditArtifact={handleEditArtifact}
                onInspectArtifact={handleInspectArtifact}
            />

            {showForm && (
                <ArtifactForm
                    onClose={handleFormClose}
                    onSuccess={handleFormSuccess}
                    mode={editingArtifact ? "edit" : "create"}
                    artifactId={editingArtifact?.id}
                    initialData={editingArtifact ? convertArtifactToFormData(editingArtifact) : undefined}
                />
            )}

            {showDetail && (
                <div className="artifact-detail-overlay" onClick={handleDetailClose}>
                    <div className="artifact-detail-container" onClick={(e) => e.stopPropagation()}>
                        <ArtifactDetail
                            artifact={selectedArtifact}
                            loading={detailLoading}
                            onClose={handleDetailClose}
                            onEdit={handleDetailEdit}
                            onAutoDetect={handleAutoDetect}
                            autoDetecting={autoDetecting}
                            onInspect={handleInspect}
                            inspecting={inspecting}
                        />
                    </div>
                </div>
            )}

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}

            {pagination && (
                <ListPaginationBar
                    pagination={pagination}
                    page={page}
                    onPageChange={goToPage}
                    pageSize={pageSize}
                    onPageSizeChange={handlePageSizeChange}
                    pageSizeOptions={[2, 12, 20, 50]}
                />
            )}
        </div>
    );
};

const convertArtifactToFormData = (artifact: Artifact): Partial<any> => {
    return {
        title: artifact.title,
        description: artifact.description,
        inventoryNumber: artifact.inventoryNumber,
        collection: artifact.collection,
        creationDate: artifact.creationDate || '',
        dimensions: artifact.dimensions,
        materials: artifact.materials || [],
        status: artifact.status,
        currentLocation: artifact.currentLocation || '',
        tags: artifact.tags || [],
        notes: artifact.notes || '',
        images: artifact.images || []
    };
};

export default Collection;