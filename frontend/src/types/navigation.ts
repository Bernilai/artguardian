export type AppRoute =
    | '/'
    | '/dashboard'
    | '/collection'
    | '/collection/:id'
    | '/tickets'
    | '/tickets/:id'
    | '/analytics'
    | '/settings'
    | '/profile'
    | '/help';

export interface NavigationItem {
    path: AppRoute;
    label: string;
    icon: string;
    description?: string;
    children?: NavigationItem[];
    requiredPermission?: string;
    badge?: number;
}

export interface BreadcrumbItem {
    path: AppRoute;
    label: string;
    isCurrent?: boolean;
}

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
        badge: 0
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

export type RouteParams = {
    [key: string]: string | number;
};

export interface ActiveRoute {
    path: AppRoute;
    params: RouteParams;
    breadcrumbs: BreadcrumbItem[];
}

export type UserRole =
    | 'admin'
    | 'curator'
    | 'restorer'
    | 'viewer';

export interface NavigationPermission {
    role: UserRole;
    allowedRoutes: AppRoute[];
}

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

    if (breadcrumbs.length > 0) {
        breadcrumbs[breadcrumbs.length - 1].isCurrent = true;
    }

    return breadcrumbs;
};

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

export const hasAccessToRoute = (userRole: UserRole, route: AppRoute): boolean => {
    const permission = navigationPermissions.find(p => p.role === userRole);
    return permission ? permission.allowedRoutes.includes(route) : false;
};

export const getNavigationForRole = (userRole: UserRole): NavigationItem[] => {
    return navigationConfig.filter(item =>
        hasAccessToRoute(userRole, item.path)
    );
};

export const getNavigationItem = (path: AppRoute): NavigationItem | undefined => {
    return navigationConfig.find(item => item.path === path);
};

export const updateNavigationBadge = (path: AppRoute, count: number): void => {
    const item = navigationConfig.find(item => item.path === path);
    if (item) {
        item.badge = count;
    }
};

export type {
    NavigationItem as INavigationItem,
    BreadcrumbItem as IBreadcrumbItem,
    UserRole as IUserRole
};