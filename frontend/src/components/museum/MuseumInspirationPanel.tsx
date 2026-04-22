import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { museumReferenceAPI } from '../../services/museumReferenceAPI';
import type { MuseumInspirationResponse, MuseumReferenceObject } from '../../services/museumReferenceAPI';
import './MuseumInspirationPanel.css';

const PAGE_SIZE = 6;

export const MuseumInspirationPanel: React.FC = () => {
    const { accessToken } = useAuth();
    const [data, setData] = useState<MuseumInspirationResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    /** Bump to reshuffle: clears server seed so the next request opens a new random deck. */
    const [deckNonce, setDeckNonce] = useState(0);
    const deckSeedRef = useRef<string | null>(null);

    const load = useCallback(async () => {
        if (!accessToken) return;
        setLoading(true);
        try {
            const needNewDeck = deckSeedRef.current === null;
            const res = await museumReferenceAPI.getInspiration(accessToken, {
                page,
                pageSize: PAGE_SIZE,
                seed: needNewDeck ? undefined : (deckSeedRef.current ?? undefined),
                bustCache: needNewDeck,
            });
            if (res.seed) {
                deckSeedRef.current = res.seed;
            }
            setData(res);
        } catch (e) {
            console.error('Museum inspiration failed:', e);
            setData({
                available: false,
                source: '',
                departments_count: null,
                items: [],
                error_message: 'Не удалось загрузить справочную подборку.',
                seed: null,
                pagination: null,
            });
        } finally {
            setLoading(false);
        }
    }, [accessToken, page, deckNonce]);

    useEffect(() => {
        if (!accessToken) {
            setLoading(false);
            return;
        }
        void load();
    }, [accessToken, load]);

    if (!accessToken) {
        return null;
    }

    const goPrev = () => setPage((p) => Math.max(1, p - 1));
    const goNext = () => {
        const max = data?.pagination?.totalPages;
        if (max != null) {
            setPage((p) => Math.min(max, p + 1));
        } else {
            setPage((p) => p + 1);
        }
    };

    const newRandomDeck = () => {
        deckSeedRef.current = null;
        setPage(1);
        setDeckNonce((n) => n + 1);
    };

    if (loading && !data) {
        return (
            <section className="museum-inspiration" aria-busy="true" aria-label="Справочная галерея">
                <div className="museum-inspiration__header">
                    <h2>Справочная подборка</h2>
                </div>
                <p className="museum-inspiration__fallback">Загрузка иллюстраций из открытой коллекции…</p>
            </section>
        );
    }

    if (!data?.available || !data.items.length) {
        return (
            <section className="museum-inspiration" aria-label="Справочная галерея">
                <div className="museum-inspiration__header">
                    <h2>Справочная подборка</h2>
                </div>
                <p className="museum-inspiration__fallback">
                    {data?.error_message ||
                        'Внешняя справочная галерея сейчас недоступна. Работа с вашей коллекцией не затронута.'}
                </p>
                <div className="museum-inspiration__toolbar">
                    <button type="button" className="museum-inspiration__btn" onClick={newRandomDeck}>
                        Другая подборка
                    </button>
                </div>
            </section>
        );
    }

    const pg = data.pagination;
    const canPrev = pg ? pg.currentPage > 1 : page > 1;
    const canNext = pg ? pg.currentPage < pg.totalPages : false;

    return (
        <section className="museum-inspiration" aria-label="Справочная подборка The Met">
            <div className="museum-inspiration__header">
                <h2>Справочная подборка</h2>
                <span className="museum-inspiration__meta">
                    {data.source}
                    {data.departments_count != null ? ` · ${data.departments_count} отделов` : ''}
                </span>
            </div>

            <div className="museum-inspiration__toolbar">
                <button
                    type="button"
                    className="museum-inspiration__btn"
                    onClick={goPrev}
                    disabled={loading || !canPrev}
                >
                    ← Назад
                </button>
                <span className="museum-inspiration__page">
                    {pg
                        ? `Стр. ${pg.currentPage} из ${pg.totalPages} · ~${pg.totalItems} работ в текущей подборке`
                        : loading
                          ? '…'
                          : ''}
                </span>
                <button
                    type="button"
                    className="museum-inspiration__btn"
                    onClick={goNext}
                    disabled={loading || !canNext}
                >
                    Вперёд →
                </button>
                <button
                    type="button"
                    className="museum-inspiration__btn museum-inspiration__btn--secondary"
                    onClick={newRandomDeck}
                    disabled={loading}
                >
                    Другая подборка
                </button>
            </div>

            {loading && (
                <p className="museum-inspiration__loading-inline" aria-live="polite">
                    Обновление…
                </p>
            )}

            <div className="museum-inspiration__grid">
                {data.items.map((item: MuseumReferenceObject) => (
                    <a
                        key={`${item.object_id}-${page}`}
                        className="museum-inspiration__card"
                        href={item.object_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <img
                            src={item.primary_image_small}
                            alt={`${item.title}. ${item.artist_display || 'Произведение из открытой коллекции'}`}
                            loading="lazy"
                            decoding="async"
                            width={200}
                            height={200}
                        />
                        <div className="museum-inspiration__card-body">
                            <h3 className="museum-inspiration__card-title">{item.title}</h3>
                            {item.artist_display && <div>{item.artist_display}</div>}
                            {item.object_date && <div>{item.object_date}</div>}
                        </div>
                    </a>
                ))}
            </div>
        </section>
    );
};
