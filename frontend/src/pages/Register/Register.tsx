import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../../services';
import { Button, Seo } from "../../components";
import { getCanonicalOrigin } from '../../utils/siteUrl';
import './Register.css';

export const Register: React.FC = () => {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        name: ''
    });

    const [errors, setErrors] = useState<{[key: string]: string}>({});
    const [isLoading, setIsLoading] = useState(false);

    const navigate = useNavigate();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        // Clear custom validity for all fields when user types
        const input = e.target;
        input.setCustomValidity("");
        
        if (name === 'password' || name === 'confirmPassword') {
            // If confirmPassword, also revalidate it against password
            if (name === 'password') {
                const confirmPasswordInput = document.getElementById('confirmPassword') as HTMLInputElement;
                if (confirmPasswordInput && confirmPasswordInput.value) {
                    if (confirmPasswordInput.value !== value) {
                        confirmPasswordInput.setCustomValidity("Пароли не совпадают");
                    } else {
                        confirmPasswordInput.setCustomValidity("");
                    }
                }
            }
        }
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate password using native HTML5 validation
        const passwordInput = document.getElementById('password') as HTMLInputElement;
        if (passwordInput) {
            const passwordPattern = /^[A-Za-z0-9!@#$%^&*()_+\-=\x5b\x5d{};:'",.<>?/\\|`~]{8,32}$/;
            if (!formData.password) {
                passwordInput.setCustomValidity("Введите пароль");
            } else if (formData.password.length < 8 || formData.password.length > 32) {
                passwordInput.setCustomValidity("Пароль должен содержать от 8 до 32 символов");
            } else if (!passwordPattern.test(formData.password) || formData.password.includes(' ')) {
                passwordInput.setCustomValidity("Пароль содержит недопустимые символы или пробелы");
            } else {
                passwordInput.setCustomValidity("");
            }
            
            if (!passwordInput.reportValidity()) {
                return;
            }
        }

        // Validate confirm password using native HTML5 validation
        const confirmPasswordInput = document.getElementById('confirmPassword') as HTMLInputElement;
        if (confirmPasswordInput) {
            if (!formData.confirmPassword) {
                confirmPasswordInput.setCustomValidity("Подтвердите пароль");
            } else if (formData.confirmPassword !== formData.password) {
                confirmPasswordInput.setCustomValidity("Пароли не совпадают");
            } else {
                confirmPasswordInput.setCustomValidity("");
            }
            
            if (!confirmPasswordInput.reportValidity()) {
                return;
            }
        }

        // Validate email using native HTML5 validation
        const emailInput = document.getElementById('email') as HTMLInputElement;
        if (emailInput) {
            const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
            if (!formData.email.trim()) {
                emailInput.setCustomValidity("Введите email");
            } else if (!emailPattern.test(formData.email)) {
                emailInput.setCustomValidity("Некорректный формат email");
            } else {
                emailInput.setCustomValidity("");
            }
            
            if (!emailInput.reportValidity()) {
                return;
            }
        }

        // Validate name using native HTML5 validation
        const nameInput = document.getElementById('name') as HTMLInputElement;
        if (nameInput) {
            const namePattern = /^[А-Яа-яЁё \-']+$/;
            if (!formData.name.trim()) {
                nameInput.setCustomValidity("Введите имя");
            } else if (!namePattern.test(formData.name)) {
                nameInput.setCustomValidity("Имя должно содержать только русские буквы, пробелы, дефисы и апострофы");
            } else {
                nameInput.setCustomValidity("");
            }
            
            if (!nameInput.reportValidity()) {
                return;
            }
        }

        setIsLoading(true);

        try {
            const { confirmPassword, ...registerData } = formData;
            await authAPI.register(registerData);

            navigate('/login', {
                state: { message: 'Регистрация прошла успешно! Теперь вы можете войти.' }
            });
        } catch (err: any) {
            setErrors({ submit: err.message || 'Ошибка при регистрации' });
        } finally {
            setIsLoading(false);
        }
    };

    const siteUrl = getCanonicalOrigin();

    return (
        <div className="register-container">
            <Seo
                title="Регистрация"
                description="Создайте аккаунт ArtGuardian для доступа к коллекции артефактов и реставрационным тикетам."
                canonicalPath="/register"
                jsonLd={{
                    '@context': 'https://schema.org',
                    '@type': 'WebPage',
                    name: 'Регистрация — ArtGuardian',
                    url: `${siteUrl}/register`,
                    isPartOf: { '@type': 'WebSite', name: 'ArtGuardian', url: `${siteUrl}/` },
                }}
            />
            <div className="register-form">
                <p className="register-brand" translate="no">ArtGuardian</p>
                <h1>Регистрация</h1>

                {errors.submit && <div className="register-error">{errors.submit}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="name">Полное имя *</label>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                            disabled={isLoading}
                            placeholder="Иван Иванов"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="email">Email *</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            disabled={isLoading}
                            placeholder="ivan@example.com"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Пароль *</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                            disabled={isLoading}
                            minLength={8}
                            maxLength={32}
                            placeholder="Минимум 8 символов"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword">Подтвердите пароль *</label>
                        <input
                            type="password"
                            id="confirmPassword"
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            required
                            disabled={isLoading}
                            minLength={8}
                        />
                    </div>

                    <Button
                        type="submit"
                        variant="primary"
                        size="large"
                        fullWidth
                        loading={isLoading}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Регистрация...' : 'Зарегистрироваться'}
                    </Button>
                </form>

                <div className="auth-links">
                    Уже есть аккаунт? <Link to="/login">Войти</Link>
                </div>
            </div>
        </div>
    );
};