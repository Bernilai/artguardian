import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts';
import { Button } from '../../components';
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
        const newErrors = {
            email: !formData.email.trim() ? 'Email обязателен' : '',
            password: !formData.password ? 'Пароль обязателен' : ''
        };

        setErrors(newErrors);
        return !Object.values(newErrors).some(error => error !== '');
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }
    };

    // const handleSubmit = async (e: React.FormEvent) => {
    //     e.preventDefault();
    //     setMessage('');
    //
    //     if (!validateForm()) {
    //         return;
    //     }
    //
    //     setIsLoading(true);
    //
    //     try {
    //         await login(formData.email, formData.password);
    //         navigate(from, { replace: true });
    //     } catch (err: any) {
    //         setErrors({ submit: err.message || 'Ошибка при входе' });
    //     } finally {
    //         setIsLoading(false);
    //     }
    // };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage('');
        setErrors({});

        if (!validateForm()) {
            return;
        }

        setIsLoading(true);

        try {
            console.log("🔄 Attempting login...", formData);
            await login(formData.email, formData.password);
            console.log("✅ Login successful in AuthContext");
            console.log("🎯 Navigating to:", from);
            navigate(from, { replace: true });
        } catch (err: any) {
            console.error("❌ Login error:", err);
            setErrors({ submit: err.message || 'Ошибка при входе' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-form">
                <h1>ArtGuardian</h1>
                <h2>Вход в систему</h2>

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
                        />
                        {errors.password && <span className="field-error">{errors.password}</span>}
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