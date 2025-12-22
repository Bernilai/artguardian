import React, { useState, useEffect, useRef } from 'react';
import {ArtifactList, LoadingSpinner, ArtifactForm, ArtifactDetail, Toast, ToastType} from "../../components";
import {Artifact} from "../../types";
import './Collection.css';
import {useApi} from "../../hooks";
import { useAuth } from "../../contexts/AuthContext";
import { autoDetectionAPI, aiPreferencesAPI, artifactsAPI } from "../../services";

const Collection: React.FC = () => {
    const { artifacts, loading, error, refetch, fetchArtifactById } = useApi();
    const prevArtifactsCountRef = useRef(artifacts.length);
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
    const [showForm, setShowForm] = useState(false);
    const [showDetail, setShowDetail] = useState(false);
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [editingArtifact, setEditingArtifact] = useState<Artifact | null>(null);
    const [autoDetecting, setAutoDetecting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
    const [searchQuery, setSearchQuery] = useState(() => {
        const savedQuery = localStorage.getItem('collection_search_query');
        return savedQuery || '';
    });
    const [inspecting, setInspecting] = useState(false);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const isInitialMountRef = useRef(true);
    const shouldMaintainFocusRef = useRef(false);
    const { accessToken, user } = useAuth();

    useEffect(() => {
        if (searchQuery) {
            localStorage.setItem('collection_search_query', searchQuery);
        } else {
            localStorage.removeItem('collection_search_query');
        }
    }, [searchQuery]);

    useEffect(() => {
        const wasFocused = localStorage.getItem('collection_search_focused') === 'true';
        if (!wasFocused) return;

        let attempts = 0;
        const maxAttempts = 30;
        let focusRestored = false;
        
        const attemptFocus = () => {
            attempts++;
            if (searchInputRef.current && !focusRestored) {
                try {
                    searchInputRef.current.focus();
                    focusRestored = true;
                    
                    const savedQuery = localStorage.getItem('collection_search_query') || '';
                    if (savedQuery && searchInputRef.current) {
                        setTimeout(() => {
                            if (searchInputRef.current) {
                                searchInputRef.current.setSelectionRange(savedQuery.length, savedQuery.length);
                            }
                        }, 10);
                    }
                } catch (e) {
                    console.error('Failed to focus search input:', e);
                }
            } else if (!focusRestored && attempts < maxAttempts) {
                requestAnimationFrame(attemptFocus);
            }
        };
        
        setTimeout(() => requestAnimationFrame(attemptFocus), 100);
        setTimeout(() => {
            if (!focusRestored && searchInputRef.current) {
                searchInputRef.current.focus();
            }
        }, 300);
        setTimeout(() => {
            if (!focusRestored && searchInputRef.current) {
                searchInputRef.current.focus();
            }
        }, 500);
        
        const handleWindowFocus = () => {
            if (wasFocused && searchInputRef.current && document.activeElement !== searchInputRef.current) {
                searchInputRef.current.focus();
            }
        };
        
        window.addEventListener('focus', handleWindowFocus);
        
        return () => {
            window.removeEventListener('focus', handleWindowFocus);
        };
    }, []);

    useEffect(() => {
        if (prevArtifactsCountRef.current !== artifacts.length || (prevArtifactsCountRef.current === artifacts.length && artifacts.length > 0)) {
            prevArtifactsCountRef.current = artifacts.length;
            
            if (shouldMaintainFocusRef.current && searchInputRef.current && document.activeElement !== searchInputRef.current) {
                requestAnimationFrame(() => {
                    if (searchInputRef.current) {
                        searchInputRef.current.focus();
                        if (searchQuery && searchInputRef.current) {
                            searchInputRef.current.setSelectionRange(searchQuery.length, searchQuery.length);
                        }
                    }
                });
            }
        }
    }, [artifacts, searchQuery]);

    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        if (isInitialMountRef.current) {
            isInitialMountRef.current = false;
            if (searchQuery) {
                refetch(searchQuery);
            }
            return;
        }

        searchTimeoutRef.current = setTimeout(() => {
            const wasFocused = document.activeElement === searchInputRef.current;
            if (wasFocused) {
                shouldMaintainFocusRef.current = true;
            }
            
            refetch(searchQuery || undefined).then(() => {
                if (shouldMaintainFocusRef.current && searchInputRef.current) {
                    requestAnimationFrame(() => {
                        searchInputRef.current?.focus();
                        if (searchQuery && searchInputRef.current) {
                            searchInputRef.current.setSelectionRange(searchQuery.length, searchQuery.length);
                        }
                    });
                }
            });
        }, 300);

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery]);

    const handleArtifactClick = (artifact: Artifact) => {
        setSelectedArtifact(artifact);
        setShowDetail(true);
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
    };

    const handleAddArtifact = () => {
        setShowForm(true);
    };

    const handleFormClose = () => {
        setShowForm(false);
        setEditingArtifact(null);
    };

    const handleFormSuccess = () => {
        refetch();
        setEditingArtifact(null);
    };

    const handleDetailClose = () => {
        setShowDetail(false);
        setSelectedArtifact(null);
        setDetailLoading(false);
    };

    const handleDetailEdit = (artifact: Artifact) => {
        setShowDetail(false);
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
                await refetch();
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
            
            await refetch();
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

    if (loading) {
        return (
            <div className="collection-page">
                <LoadingSpinner size="large" text="Загрузка коллекции..." />
            </div>
        );
    }

    if (error) {
        return (
            <div className="collection-page">
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

    return (
        <div className="collection-page">
            <div className="page-header">
                <h1>Коллекция артефактов</h1>
                <div className="page-actions">
                    <button className="btn btn-primary" onClick={handleAddArtifact}>
                        ➕ Добавить артефакт
                    </button>
                </div>
            </div>

            <div className="search-bar">
                <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Поиск по названию артефакта..."
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                    }}
                    onFocus={() => {
                        localStorage.setItem('collection_search_focused', 'true');
                        shouldMaintainFocusRef.current = true;
                    }}
                    onBlur={() => {
                        if (!shouldMaintainFocusRef.current) {
                            localStorage.removeItem('collection_search_focused');
                        }
                    }}
                    className="search-input"
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
                    Найдено артефактов: {artifacts.length}
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