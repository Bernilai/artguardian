import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../../services';
import { Button} from "../../components";
import './Register.css';

export const Register: React.FC = () => {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        name: ''
    });

    const [errors, setErrors] = useState<{[key: string]: string}>({});

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

        const namePattern = /^[А-Яа-яЁё \-']+$/
        if (!formData.name.trim()) {
            newErrors.name = "Введите имя";
        } else if (!namePattern.test(formData.name)) {
            newErrors.namr = "Имя должно содержать только русские буквы, пробелы, дефисы и апострофы";
        }

        if (!formData.confirmPassword) {
            newErrors.confirmPassword = "Подтвердите пароль";
        } else if (formData.confirmPassword !== formData.password) {
            newErrors.confirmPassword = "Пароли не совпадают";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const [isLoading, setIsLoading] = useState(false);

    const navigate = useNavigate();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        // Очищаем ошибку при изменении поля
        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        let error = "";

        if (name === "email") {
            const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
            if (!value.trim()) {
                error = "Введите email";
            } else if (!emailPattern.test(value)) {
                error = "Некорректный формат email";
            }
        } else if (name === "password") {
            const passwordPattern = /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]{8,32}$/;
            if (!value) {
                error = "Введите пароль";
            } else if (value.length < 8 || value.length > 32) {
                error = "Пароль должен содержать от 8 до 32 символов";
            } else if (!passwordPattern.test(value) || value.includes(' ')) {
                error = "Пароль содержит недопустимые символы или пробелы";
            }
        } else if (name === "name") {
            const namePattern = /^[А-Яа-яЁё \-']+$/;
            if (!value.trim()) {
                error = "Введите имя";
            } else if (!namePattern.test(value)) {
                error = "Имя должно содержать только русские буквы, пробелы, дефисы и апострофы";
            }
        } else if (name === "confirmPassword") {
            if (!value) {
                error = "Подтвердите пароль";
            } else if (value !== formData.password) {
                error = "Пароли не совпадают";
            }
        }

        setErrors(prev => ({ ...prev, [name]: error }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
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

    return (
        <div className="register-container">
            <div className="register-form">
                <h1>ArtGuardian</h1>
                <h2>Регистрация</h2>

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
                            onBlur={handleBlur}
                            required
                            disabled={isLoading}
                            placeholder="Иван Иванов"
                        />
                        {errors.name && <span className="field-error">{errors.name}</span>}
                    </div>

                    <div className="form-group">
                        <label htmlFor="email">Email *</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            required
                            disabled={isLoading}
                            placeholder="ivan@example.com"
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
                            onBlur={handleBlur}
                            required
                            disabled={isLoading}
                            minLength={6}
                            placeholder="Минимум 8 символов"
                        />
                        {errors.password && <span className="field-error">{errors.password}</span>}
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword">Подтвердите пароль *</label>
                        <input
                            type="password"
                            id="confirmPassword"
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            required
                            disabled={isLoading}
                            minLength={8}
                        />
                        {errors.confirmPassword && <span className="field-error">{errors.confirmPassword}</span>}
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