import { ApiError, ApiService } from '../api';

const BASE_URL = 'http://test.example/api';

function createJsonResponse<T>(
    body: T,
    status: number,
    overrides: Partial<Response> = {}
): Response {
    const ok = status >= 200 && status < 300;
    return {
        ok,
        status,
        json: async () => body,
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
        ...overrides,
    } as Response;
}

function createTextErrorResponse(status: number, text: string): Response {
    return {
        ok: false,
        status,
        json: async () => {
            throw new Error('json() should not be called on error body');
        },
        text: async () => text,
    } as Response;
}

function getLastFetchInit(): RequestInit {
    const mock = global.fetch as jest.Mock;
    const calls = mock.mock.calls;
    const call = calls[calls.length - 1];
    if (!call) {
        throw new Error('fetch was not called');
    }
    return call[1] as RequestInit;
}

function getLastFetchHeaders(): Headers {
    const init = getLastFetchInit();
    return new Headers(init.headers as HeadersInit);
}

describe('ApiService', () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('HTTP methods', () => {
        it('get: корректный URL, метод, заголовки и credentials', async () => {
            fetchSpy.mockResolvedValueOnce(createJsonResponse({ a: 1 }, 200));
            const api = new ApiService(BASE_URL);

            await api.get('/items', 'tok');

            expect(fetchSpy).toHaveBeenCalledWith(
                `${BASE_URL}/items`,
                expect.objectContaining({
                    method: 'GET',
                    credentials: 'include',
                })
            );
            const h = getLastFetchHeaders();
            expect(h.get('Authorization')).toBe('Bearer tok');
            expect(h.get('Content-Type')).toBe('application/json');
        });

        it('get: без токена заголовок Authorization не отправляется', async () => {
            fetchSpy.mockResolvedValueOnce(createJsonResponse({}, 200));
            const api = new ApiService(BASE_URL);

            await api.get('/items');

            expect(getLastFetchHeaders().get('Authorization')).toBeNull();
        });

        it('post: тело JSON и заголовки', async () => {
            fetchSpy.mockResolvedValueOnce(createJsonResponse({ id: 1 }, 201));
            const api = new ApiService(BASE_URL);

            await api.post('/items', { name: 'x' }, 't');

            expect(fetchSpy).toHaveBeenCalledWith(
                `${BASE_URL}/items`,
                expect.objectContaining({
                    method: 'POST',
                    credentials: 'include',
                    body: JSON.stringify({ name: 'x' }),
                })
            );
            const h = getLastFetchHeaders();
            expect(h.get('Authorization')).toBe('Bearer t');
            expect(h.get('Content-Type')).toBe('application/json');
        });

        it('put: тело и метод', async () => {
            fetchSpy.mockResolvedValueOnce(createJsonResponse({ ok: true }, 200));
            const api = new ApiService(BASE_URL);

            await api.put('/items/1', { name: 'y' }, 'tok');

            expect(fetchSpy).toHaveBeenCalledWith(
                `${BASE_URL}/items/1`,
                expect.objectContaining({
                    method: 'PUT',
                    credentials: 'include',
                    body: JSON.stringify({ name: 'y' }),
                })
            );
        });

        it('patch: тело и метод', async () => {
            fetchSpy.mockResolvedValueOnce(createJsonResponse({ ok: true }, 200));
            const api = new ApiService(BASE_URL);

            await api.patch('/items/1', { name: 'z' });

            expect(fetchSpy).toHaveBeenCalledWith(
                `${BASE_URL}/items/1`,
                expect.objectContaining({
                    method: 'PATCH',
                    credentials: 'include',
                    body: JSON.stringify({ name: 'z' }),
                })
            );
        });

        it('delete: метод, опциональное тело JSON', async () => {
            fetchSpy.mockResolvedValueOnce(createJsonResponse({}, 200));
            const api = new ApiService(BASE_URL);

            await api.delete('/items/1', 'tok', { reason: 'test' });

            expect(fetchSpy).toHaveBeenCalledWith(
                `${BASE_URL}/items/1`,
                expect.objectContaining({
                    method: 'DELETE',
                    credentials: 'include',
                    body: JSON.stringify({ reason: 'test' }),
                })
            );
            expect(getLastFetchHeaders().get('Authorization')).toBe('Bearer tok');
        });
    });

    describe('Обработка ответов', () => {
        it('возвращает распарсенный JSON при 200', async () => {
            fetchSpy.mockResolvedValueOnce(createJsonResponse({ hello: 'world' }, 200));
            const api = new ApiService(BASE_URL);

            const data = await api.get<{ hello: string }>('/x');

            expect(data).toEqual({ hello: 'world' });
        });

        it('возвращает пустой объект при 204', async () => {
            fetchSpy.mockResolvedValueOnce(createJsonResponse(null, 204));
            const api = new ApiService(BASE_URL);

            const data = await api.get<Record<string, never>>('/x');

            expect(data).toEqual({});
        });

        it('бросает ApiError при не-ok ответе', async () => {
            fetchSpy.mockResolvedValueOnce(createTextErrorResponse(400, 'bad'));
            const api = new ApiService(BASE_URL);

            await expect(api.get('/x')).rejects.toMatchObject({
                name: 'ApiError',
                status: 400,
                message: 'bad',
            });
        });

        it('бросает ApiError(0, ...) если fetch упал', async () => {
            fetchSpy.mockRejectedValueOnce(new Error('offline'));
            const api = new ApiService(BASE_URL);

            await expect(api.get('/x')).rejects.toMatchObject({
                name: 'ApiError',
                status: 0,
                message: 'Network error: offline',
            });
        });
    });

    describe('401 и refresh', () => {
        it('при 401 без X-Retry: вызывается refresh, повтор с новым токеном и X-Retry: true', async () => {
            const refresh = jest.fn().mockResolvedValue('new-token');
            fetchSpy
                .mockResolvedValueOnce(createTextErrorResponse(401, 'nope'))
                .mockResolvedValueOnce(createJsonResponse({ ok: true }, 200));

            const api = new ApiService(BASE_URL);
            api.setRefreshCallback(refresh);

            const data = await api.get('/secure', 'old');

            expect(refresh).toHaveBeenCalledTimes(1);
            expect(fetchSpy).toHaveBeenCalledTimes(2);

            const retryHeaders = new Headers(fetchSpy.mock.calls[1][1].headers as HeadersInit);
            expect(retryHeaders.get('Authorization')).toBe('Bearer new-token');
            expect(retryHeaders.get('X-Retry')).toBe('true');
            expect(data).toEqual({ ok: true });
        });

        it('при 401 с уже выставленным X-Retry: сразу ошибка, без повторного refresh', async () => {
            const refresh = jest.fn().mockResolvedValue('new-token');
            fetchSpy
                .mockResolvedValueOnce(createTextErrorResponse(401, 'first'))
                .mockResolvedValueOnce(createTextErrorResponse(401, 'second'));

            const api = new ApiService(BASE_URL);
            api.setRefreshCallback(refresh);

            await expect(api.get('/secure', 't')).rejects.toMatchObject({
                status: 401,
                message: 'second',
            });

            expect(refresh).toHaveBeenCalledTimes(1);
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });

        it('без refreshCallback: ApiError(401, ...)', async () => {
            fetchSpy.mockResolvedValueOnce(createTextErrorResponse(401, 'unauth'));
            const api = new ApiService(BASE_URL);

            await expect(api.get('/x')).rejects.toMatchObject({
                status: 401,
                message: 'No refresh callback available',
            });
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        });

        it('параллельные 401: refreshCallback вызывается ровно один раз (дедупликация refreshPromise)', async () => {
            let resolveRefresh!: (t: string) => void;
            const refreshPromise = new Promise<string>(resolve => {
                resolveRefresh = resolve;
            });
            const refresh = jest.fn().mockReturnValue(refreshPromise);

            fetchSpy
                .mockResolvedValueOnce(createTextErrorResponse(401, 'a'))
                .mockResolvedValueOnce(createTextErrorResponse(401, 'b'))
                .mockResolvedValueOnce(createJsonResponse({ r: 1 }, 200))
                .mockResolvedValueOnce(createJsonResponse({ r: 2 }, 200));

            const api = new ApiService(BASE_URL);
            api.setRefreshCallback(refresh);

            const p1 = api.get('/a', 't');
            const p2 = api.get('/b', 't');

            // Ждём завершения моков fetch и входа в retryRequest (микрозадачи + следующий тик).
            await new Promise<void>(resolve => {
                setTimeout(resolve, 0);
            });
            expect(refresh).toHaveBeenCalledTimes(1);

            resolveRefresh!('shared');
            const [d1, d2] = await Promise.all([p1, p2]);

            expect(d1).toEqual({ r: 1 });
            expect(d2).toEqual({ r: 2 });
            expect(refresh).toHaveBeenCalledTimes(1);
            expect(fetchSpy).toHaveBeenCalledTimes(4);
        });
    });

    describe('getWithParams', () => {
        it('строит query string, пропускает null/undefined', async () => {
            fetchSpy.mockResolvedValueOnce(createJsonResponse({}, 200));
            const api = new ApiService(BASE_URL);

            await api.getWithParams('/items', {
                q: 'a b',
                empty: '',
                n: null,
                u: undefined,
                nZero: 0,
            });

            const url = fetchSpy.mock.calls[0][0] as string;
            expect(url.startsWith(`${BASE_URL}/items?`)).toBe(true);
            const qs = url.split('?')[1];
            const params = new URLSearchParams(qs);
            expect(params.get('q')).toBe('a b');
            expect(params.get('empty')).toBe('');
            expect(params.has('n')).toBe(false);
            expect(params.has('u')).toBe(false);
            expect(params.get('nZero')).toBe('0');
        });

        it('массивы сериализуются повторяющимися ключами', async () => {
            fetchSpy.mockResolvedValueOnce(createJsonResponse({}, 200));
            const api = new ApiService(BASE_URL);

            await api.getWithParams('/t', { status: ['good', 'critical'] });

            const url = fetchSpy.mock.calls[0][0] as string;
            expect(url).toContain('status=good');
            expect(url).toContain('status=critical');
        });

        it('пустой объект параметров: без ? в URL', async () => {
            fetchSpy.mockResolvedValueOnce(createJsonResponse({}, 200));
            const api = new ApiService(BASE_URL);

            await api.getWithParams('/items', {});

            expect(fetchSpy).toHaveBeenCalledWith(
                `${BASE_URL}/items`,
                expect.anything()
            );
        });
    });

    describe('uploadFile', () => {
        it('отправляет FormData с файлом под ключом file и доп. полями как строки', async () => {
            fetchSpy.mockResolvedValueOnce(createJsonResponse({ uploaded: true }, 200));
            const api = new ApiService(BASE_URL);
            const file = new File(['x'], 'a.txt', { type: 'text/plain' });

            await api.uploadFile('/upload', file, 'tok', { meta: 42, flag: true });

            const [, init] = fetchSpy.mock.calls[0];
            expect(init).toMatchObject({
                method: 'POST',
                credentials: 'include',
            });
            expect(init.body).toBeInstanceOf(FormData);
            const fd = init.body as FormData;
            expect(fd.get('file')).toBe(file);
            expect(fd.get('meta')).toBe('42');
            expect(fd.get('flag')).toBe('true');
            const h = new Headers(init.headers as HeadersInit);
            expect(h.get('Authorization')).toBe('Bearer tok');
        });

        it('известная проблема: request всегда выставляет Content-Type: application/json, что конфликтует с multipart FormData', async () => {
            // Реальный браузер часто перезапишет boundary при несовпадении, но заголовок остаётся некорректным для строгих клиентов/прокси.
            fetchSpy.mockResolvedValueOnce(createJsonResponse({}, 200));
            const api = new ApiService(BASE_URL);
            const file = new File(['x'], 'a.bin');

            await api.uploadFile('/u', file);

            expect(getLastFetchHeaders().get('Content-Type')).toBe('application/json');
        });
    });
});
