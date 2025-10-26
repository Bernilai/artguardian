// Флаги для переключения между моковыми данными и реальным API
export const USE_MOCK_API = process.env.REACT_APP_USE_MOCK_API === 'true' || false;
export const MOCK_DELAY = parseInt(process.env.REACT_APP_MOCK_DELAY || '500');

// Базовый URL API
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

// Логирование для отладки
console.log('API Configuration:', {
    USE_MOCK_API,
    MOCK_DELAY,
    API_BASE_URL
});