import { User, LoginCredentials, RegisterData, AuthResponse } from '../types';

const mockAccessToken = 'mock-access-token-' + Date.now();
const mockRefreshToken = 'mock-refresh-token-' + Date.now(); // ← Добавляем

// Моковые данные пользователей
const mockUsers: User[] = [
    {
        id: '1',
        email: 'admin@artguardian.com',
        name: 'Анна Иванова',
        role: 'curator'
    },
    {
        id: '2',
        email: 'curator@artguardian.com',
        name: 'Петр Сидоров',
        role: 'curator'
    }
];

// Моковый токен (в реальном приложении это был бы JWT)
const mockToken = 'mock-jwt-token-' + Date.now();

class MockApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

// Имитация задержки сети
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mockAuthAPI = {
    async login(credentials: LoginCredentials): Promise<AuthResponse> {
        await delay(1000); // Имитация задержки сети

        const user = mockUsers.find(u => u.email === credentials.email);

        if (!user) {
            throw new MockApiError(401, 'Пользователь с таким email не найден');
        }

        // В моковой версии любой пароль подходит, кроме "wrongpassword"
        if (credentials.password === 'wrongpassword') {
            throw new MockApiError(401, 'Неверный пароль');
        }

        return {
            access_token: mockToken,          // ← Изменили с token
            refresh_token: mockRefreshToken,  // ← Добавили
            token_type: 'bearer',             // ← Добавили
            user                              // ← Оставляем
        };
    },

    async verifyToken(token: string): Promise<User> {
        await delay(500);

        // В моковой версии любой токен считается валидным
        if (token.includes('mock-jwt-token')) {
            return mockUsers[0]; // Возвращаем первого пользователя
        }

        throw new MockApiError(401, 'Невалидный токен');
    },

    async register(userData: RegisterData): Promise<AuthResponse> {
        await delay(1000);

        // Проверяем, нет ли уже пользователя с таким email
        const existingUser = mockUsers.find(u => u.email === userData.email);
        if (existingUser) {
            throw new MockApiError(409, 'Пользователь с таким email уже существует');
        }

        // Создаем нового пользователя
        const newUser: User = {
            id: (mockUsers.length + 1).toString(),
            email: userData.email,
            name: userData.name,
            role: 'curator' // По умолчанию все новые пользователи - кураторы
        };

        mockUsers.push(newUser);

        return {
            access_token: mockToken,          // ← Изменили с token
            refresh_token: mockRefreshToken,  // ← Добавили
            token_type: 'bearer',             // ← Добавили
            user: newUser                     // ← Оставляем
        };
    },
};