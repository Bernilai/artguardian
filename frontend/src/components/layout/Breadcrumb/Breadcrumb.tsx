import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Breadcrumb.css';

export interface BreadcrumbItem {
    path: string;
    label: string;
}

const Breadcrumb: React.FC = () => {
    const location = useLocation();

    // Разбиваем путь и формируем хлебные крошки
    const pathnames = location.pathname.split('/').filter(x => x);

    const breadcrumbItems: BreadcrumbItem[] = [
        { path: '/', label: 'Главная' },
        ...pathnames.map((path, index) => {
            const routeTo = `/${pathnames.slice(0, index + 1).join('/')}`;
            return {
                path: routeTo,
                label: path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ')
            };
        })
    ];

    return (
        <nav className="breadcrumb" aria-label="Хлебные крошки">
            <ol className="breadcrumb__list">
                {breadcrumbItems.map((item, index) => (
                    <li key={item.path} className="breadcrumb__item">
                        {index === breadcrumbItems.length - 1 ? (
                            <span className="breadcrumb__current" aria-current="page">
                {item.label}
              </span>
                        ) : (
                            <Link to={item.path} className="breadcrumb__link">
                                {item.label}
                            </Link>
                        )}
                        {index < breadcrumbItems.length - 1 && (
                            <span className="breadcrumb__separator">/</span>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
};

export default Breadcrumb;