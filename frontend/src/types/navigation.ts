// Основные маршруты приложения
export type AppRoute =
    | '/'                    // Главная (редирект на дашборд)
    | '/dashboard'           // Дашборд
    | '/collection'          // Коллекция артефактов
    | '/collection/:id'      // Детали артефакта
    | '/tickets'             // Реставрационные тикеты
    | '/tickets/:id'         // Детали тикета
    | '/analytics'           // Аналитика
    | '/settings'            // Настройки
    | '/profile'             // Профиль пользователя
    | '/help';               // Помощь

// Элемент навигации в боковом меню
export interface NavigationItem {
    path: AppRoute;
    label: string;
    icon: string;
    description?: string;
    children?: NavigationItem[]; // Подменю (если нужно)
    requiredPermission?: string; // Права доступа (если нужно)
    badge?: number; // Количество уведомлений (например, необработанные тикеты)
}

// Хлебные крошки
export interface BreadcrumbItem {
    path: AppRoute;
    label: string;
    isCurrent?: boolean;
}

// Конфигурация навигации
export const navigationConfig: NavigationItem[] = [
    {
        path: '/dashboard',
        label: 'Дашборд',
        icon: '📊',
        description: 'Обзор состояния коллекции'
    },
    {
        path: '/collection',
        label: 'Коллекция',
        icon: '🖼️',
        description: 'Управление артефактами'
    },
    {
        path: '/tickets',
        label: 'Тикеты',
        icon: '⚠️',
        description: 'Реставрационные работы',
        badge: 0 // Будет обновляться динамически
    },
    {
        path: '/analytics',
        label: 'Аналитика',
        icon: '📈',
        description: 'Отчеты и статистика'
    },
    {
        path: '/settings',
        label: 'Настройки',
        icon: '⚙️',
        description: 'Настройки системы'
    }
];

// Утилитарные типы для работы с маршрутизацией
export type RouteParams = {
    [key: string]: string | number;
};

// Типы для активного маршрута
export interface ActiveRoute {
    path: AppRoute;
    params: RouteParams;
    breadcrumbs: BreadcrumbItem[];
}

// Права доступа для навигации
export type UserRole =
    | 'admin'           // Администратор
    | 'curator'         // Куратор
    | 'restorer'        // Реставратор
    | 'viewer';         // Наблюдатель (только просмотр)

export interface NavigationPermission {
    role: UserRole;
    allowedRoutes: AppRoute[];
}

// Конфигурация прав доступа
export const navigationPermissions: NavigationPermission[] = [
    {
        role: 'admin',
        allowedRoutes: ['/dashboard', '/collection', '/tickets', '/analytics', '/settings']
    },
    {
        role: 'curator',
        allowedRoutes: ['/dashboard', '/collection', '/tickets', '/analytics']
    },
    {
        role: 'restorer',
        allowedRoutes: ['/dashboard', '/collection', '/tickets']
    },
    {
        role: 'viewer',
        allowedRoutes: ['/dashboard', '/collection']
    }
];

// Вспомогательные функции для работы с навигацией

// Генерация хлебных крошек на основе текущего пути
export const generateBreadcrumbs = (currentPath: string): BreadcrumbItem[] => {
    const paths = currentPath.split('/').filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [
        { path: '/', label: 'Главная' }
    ];

    let accumulatedPath = '';
    paths.forEach(path => {
        accumulatedPath += `/${path}`;
        breadcrumbs.push({
            path: accumulatedPath as AppRoute,
            label: getLabelForPath(path)
        });
    });

    // Помечаем последний элемент как текущий
    if (breadcrumbs.length > 0) {
        breadcrumbs[breadcrumbs.length - 1].isCurrent = true;
    }

    return breadcrumbs;
};

// Получение читаемого названия для пути
const getLabelForPath = (path: string): string => {
    const labels: Record<string, string> = {
        'dashboard': 'Дашборд',
        'collection': 'Коллекция',
        'tickets': 'Тикеты',
        'analytics': 'Аналитика',
        'settings': 'Настройки',
        'profile': 'Профиль',
        'help': 'Помощь'
    };

    return labels[path] || path.charAt(0).toUpperCase() + path.slice(1);
};

// Проверка доступа пользователя к маршруту
export const hasAccessToRoute = (userRole: UserRole, route: AppRoute): boolean => {
    const permission = navigationPermissions.find(p => p.role === userRole);
    return permission ? permission.allowedRoutes.includes(route) : false;
};

// Получение конфигурации навигации для роли пользователя
export const getNavigationForRole = (userRole: UserRole): NavigationItem[] => {
    return navigationConfig.filter(item =>
        hasAccessToRoute(userRole, item.path)
    );
};

// Получение элемента навигации по пути
export const getNavigationItem = (path: AppRoute): NavigationItem | undefined => {
    return navigationConfig.find(item => item.path === path);
};

// Обновление бейджа (количества уведомлений) для пункта меню
export const updateNavigationBadge = (path: AppRoute, count: number): void => {
    const item = navigationConfig.find(item => item.path === path);
    if (item) {
        item.badge = count;
    }
};

// Экспорт типов для использования в компонентах
export type {
    NavigationItem as INavigationItem,
    BreadcrumbItem as IBreadcrumbItem,
    UserRole as IUserRole
};