import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts';
import { Button, Seo } from '../../components';
import { getCanonicalOrigin } from '../../utils/siteUrl';
import './Login.css';

export const Login: React.FC = () => {
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [errors, setErrors] = useState<{[key: string]: string}>({});
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const from = (location.state as any)?.from?.pathname || '/dashboard';

    useEffect(() => {
        if (location.state?.message) {
            setMessage(location.state.message);
        }
    }, [location.state]);

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
        if (!formData.email.trim()) {
            newErrors.email = "Введите email";
        } else if (!emailPattern.test(formData.email)) {
            newErrors.email = "Некорректный формат email";
        }
        
        const passwordPattern = /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]{8,32}$/;
        if (!formData.password) {
            newErrors.password = "Введите пароль";
        } else if (formData.password.length < 8 || formData.password.length > 32) {
            newErrors.password = "Пароль должен содержать от 8 до 32 символов";
        } else if (!passwordPattern.test(formData.password) || formData.password.includes(' ')) {
            newErrors.password  = "Пароль содержит недопустимые символы или пробелы";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        // Clear custom validity for password field when user types
        if (name === 'password') {
            const passwordInput = e.target;
            passwordInput.setCustomValidity("");
        }

        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage('');
        setErrors({});

        // Validate password using native HTML5 validation
        const passwordInput = document.getElementById('password') as HTMLInputElement;
        if (passwordInput) {
            const passwordPattern = /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]{8,32}$/;
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

        // Validate email (keep inline errors for email)
        const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
        if (!formData.email.trim()) {
            setErrors({ email: "Введите email" });
            return;
        } else if (!emailPattern.test(formData.email)) {
            setErrors({ email: "Некорректный формат email" });
            return;
        }

        setIsLoading(true);

        try {
            await login(formData.email, formData.password);
            navigate(from, { replace: true });
        } catch (err: any) {
            console.error("Login error:", err);
            let errorText = "Ошибка при входе";
            if (err?.response) {
                if (err.response.status === 401) {
                    errorText = "Неверный email или пароль"
                } else if (typeof err.response.data?.detail === "string") {
                    errorText = err.response.data.detail;
                }
            } else if (typeof err?.message === "string") {
                try {
                    const json = JSON.parse(err.message);
                    if (json.detail) errorText = json.detail;
                } catch {
                    errorText = err.message;
                }
                if (errorText.includes("Login failed") || errorText.includes("Incorrect email or password")) {
                    errorText = "Неверный email или пароль";
                }
            }
            setErrors({ submit: errorText });
        } finally {
            setIsLoading(false);
        }
    };

    const siteUrl = getCanonicalOrigin();

    return (
        <div className="login-container">
            <Seo
                title="Вход"
                description="Войдите в ArtGuardian — учёт артефактов, тикетов реставрации и аналитики музейной коллекции."
                canonicalPath="/login"
                jsonLd={{
                    '@context': 'https://schema.org',
                    '@type': 'WebSite',
                    name: 'ArtGuardian',
                    url: `${siteUrl}/`,
                    description:
                        'Платформа для учёта музейных артефактов, тикетов реставрации и аналитики состояния коллекций.',
                }}
            />
            <div className="login-form">
                <p className="login-brand" translate="no">ArtGuardian</p>
                <h1>Вход в систему</h1>

                {errors.submit && <div className="login-error">{errors.submit}</div>}
                {message && <div className="login-message">{message}</div>}

                <form onSubmit={handleSubmit}>
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
                            placeholder="your@email.com"
                        />
                        {errors.email && <span className="field-error">{errors.email}</span>}
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

                        {isLoading ? 'Вход...' : 'Войти'}
                    </Button>
                </form>

                <div className="auth-links">
                    Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
                </div>
            </div>
        </div>
    );
};