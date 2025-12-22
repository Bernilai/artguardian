import React, { useState, useRef } from 'react';
import { ArtifactFormData, MaterialType, ArtifactStatus } from '../../../types';
import { imagesAPI } from '../../../services/imagesAPI';
import { artifactsAPI, CreateArtifactRequest } from '../../../services/artifactsAPI';
import { useAuth } from '../../../contexts/AuthContext';
import './ArtifactForm.css';

export interface ArtifactFormProps {
    onClose: () => void;
    onSuccess?: () => void;
    initialData?: Partial<ArtifactFormData>;
    mode?: 'create' | 'edit';
    artifactId?: string; // Required for edit mode
}

const ArtifactForm: React.FC<ArtifactFormProps> = ({
    onClose,
    onSuccess,
    initialData,
    mode = 'create',
    artifactId
}) => {
    const { accessToken } = useAuth();
    const [formData, setFormData] = useState<ArtifactFormData>({
        title: initialData?.title || '',
        description: initialData?.description || '',
        inventoryNumber: initialData?.inventoryNumber || '',
        collection: initialData?.collection || '',
        creationDate: initialData?.creationDate || '',
        dimensions: initialData?.dimensions || { width: 0, height: 0, unit: 'cm' },
        materials: initialData?.materials || [],
        status: initialData?.status || 'good',
        currentLocation: initialData?.currentLocation || '',
        tags: initialData?.tags || [],
        notes: initialData?.notes || ''
    });

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [existingImagePath, setExistingImagePath] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load existing image if editing
    React.useEffect(() => {
        if (mode === 'edit' && initialData) {
            // Try to get image from initialData if available
            // Note: initialData might not have images array, so we'll handle it in the form
        }
    }, [mode, initialData]);

    const materialTypes: MaterialType[] = [
        'oil_paint', 'watercolor', 'acrylic', 'tempera', 'canvas',
        'wood', 'metal', 'stone', 'ceramic', 'paper', 'textile', 'mixed', 'other'
    ];

    const statusTypes: ArtifactStatus[] = [
        'good', 'requires_attention', 'critical',
        'under_restoration', 'exhibited'
    ];

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        
        if (name.startsWith('dimensions.')) {
            const dimField = name.split('.')[1];
            setFormData(prev => ({
                ...prev,
                dimensions: {
                    ...prev.dimensions,
                    [dimField]: dimField === 'unit' ? value : parseFloat(value) || 0
                }
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [name]: value
            }));
        }
    };

    const handleMaterialToggle = (material: MaterialType) => {
        setFormData(prev => ({
            ...prev,
            materials: prev.materials.includes(material)
                ? prev.materials.filter(m => m !== material)
                : [...prev.materials, material]
        }));
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                setError('Пожалуйста, выберите файл изображения');
                return;
            }
            
            // Validate file size (10MB)
            if (file.size > 10 * 1024 * 1024) {
                setError('Размер файла не должен превышать 10MB');
                return;
            }

            setImageFile(file);
            setError(null);

            // Create preview
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveImage = () => {
        setImageFile(null);
        setImagePreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            let imagePath: string | undefined;

            // Upload image if provided
            if (imageFile && accessToken) {
                try {
                    const uploadResult = await imagesAPI.uploadImage(imageFile, 'artifacts', accessToken);
                    imagePath = uploadResult.object_path;
                } catch (uploadError) {
                    setError(`Ошибка загрузки изображения: ${uploadError instanceof Error ? uploadError.message : 'Неизвестная ошибка'}`);
                    setIsLoading(false);
                    return;
                }
            }

            // Prepare artifact data for API (matches backend schema)
            // Note: Status mapping is done on the backend
            const artifactData: CreateArtifactRequest = {
                title: formData.title,
                description: formData.description || undefined,
                inventory_number: formData.inventoryNumber,
                collection: formData.collection,
                current_location: formData.currentLocation || undefined,
                dimensions: JSON.stringify(formData.dimensions),
                materials: JSON.stringify(formData.materials),
                image_path: imagePath,
                status: formData.status,  // Frontend status will be mapped on backend
                creation_date: formData.creationDate || undefined
            };

            // Create or update artifact
            if (accessToken) {
                if (mode === 'edit' && artifactId) {
                    // Update existing artifact
                    await artifactsAPI.updateArtifact(artifactId, artifactData, accessToken);
                } else {
                    // Create new artifact
                    await artifactsAPI.createArtifact(artifactData, accessToken);
                }
                
                // Call success callback and close
                onSuccess?.();
                onClose();
            } else {
                setError('Необходима авторизация');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка при создании артефакта');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="artifact-form-overlay" onClick={onClose}>
            <div className="artifact-form-container" onClick={(e) => e.stopPropagation()}>
                <div className="artifact-form-header">
                    <h2>{mode === 'create' ? 'Добавить артефакт' : 'Редактировать артефакт'}</h2>
                    <button className="artifact-form-close" onClick={onClose}>×</button>
                </div>

                {error && <div className="artifact-form-error">{error}</div>}

                <form onSubmit={handleSubmit} className="artifact-form">
                    <div className="form-section">
                        <h3>Основная информация</h3>
                        
                        <div className="form-group">
                            <label htmlFor="title">Название *</label>
                            <input
                                type="text"
                                id="title"
                                name="title"
                                value={formData.title}
                                onChange={handleChange}
                                required
                                disabled={isLoading}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="description">Описание</label>
                            <textarea
                                id="description"
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                rows={4}
                                disabled={isLoading}
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="inventoryNumber">Инвентарный номер *</label>
                                <input
                                    type="text"
                                    id="inventoryNumber"
                                    name="inventoryNumber"
                                    value={formData.inventoryNumber}
                                    onChange={handleChange}
                                    required
                                    disabled={isLoading}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="collection">Коллекция *</label>
                                <input
                                    type="text"
                                    id="collection"
                                    name="collection"
                                    value={formData.collection}
                                    onChange={handleChange}
                                    required
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="currentLocation">Местонахождение</label>
                            <input
                                type="text"
                                id="currentLocation"
                                name="currentLocation"
                                value={formData.currentLocation}
                                onChange={handleChange}
                                disabled={isLoading}
                                placeholder="Например: Зал 3, Стена Западная"
                            />
                        </div>
                    </div>

                    <div className="form-section">
                        <h3>Изображение</h3>
                        
                        <div className="form-group">
                            {imagePreview ? (
                                <div className="image-preview-container">
                                    <img src={imagePreview} alt="Preview" className="image-preview" />
                                    <button
                                        type="button"
                                        onClick={handleRemoveImage}
                                        className="remove-image-btn"
                                        disabled={isLoading}
                                    >
                                        Удалить
                                    </button>
                                </div>
                            ) : (
                                <div className="image-upload-area">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        id="image"
                                        accept="image/*"
                                        onChange={handleImageChange}
                                        disabled={isLoading}
                                        style={{ display: 'none' }}
                                    />
                                    <label htmlFor="image" className="image-upload-label">
                                        <span>📷</span>
                                        <span>Нажмите для загрузки изображения</span>
                                        <span className="image-upload-hint">JPEG, PNG, WebP (макс. 10MB)</span>
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="form-section">
                        <h3>Характеристики</h3>
                        
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="dimensions.width">Ширина (см) *</label>
                                <input
                                    type="number"
                                    id="dimensions.width"
                                    name="dimensions.width"
                                    value={formData.dimensions.width}
                                    onChange={handleChange}
                                    min="0"
                                    step="0.1"
                                    required
                                    disabled={isLoading}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="dimensions.height">Высота (см) *</label>
                                <input
                                    type="number"
                                    id="dimensions.height"
                                    name="dimensions.height"
                                    value={formData.dimensions.height}
                                    onChange={handleChange}
                                    min="0"
                                    step="0.1"
                                    required
                                    disabled={isLoading}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="dimensions.unit">Единица измерения</label>
                                <select
                                    id="dimensions.unit"
                                    name="dimensions.unit"
                                    value={formData.dimensions.unit}
                                    onChange={handleChange}
                                    disabled={isLoading}
                                >
                                    <option value="cm">см</option>
                                    <option value="mm">мм</option>
                                    <option value="m">м</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Материалы</label>
                            <div className="materials-grid">
                                {materialTypes.map(material => (
                                    <label key={material} className="material-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={formData.materials.includes(material)}
                                            onChange={() => handleMaterialToggle(material)}
                                            disabled={isLoading}
                                        />
                                        <span>{getMaterialLabel(material)}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="status">Статус</label>
                            <select
                                id="status"
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                                disabled={isLoading}
                            >
                                {statusTypes.map(status => (
                                    <option key={status} value={status}>
                                        {getStatusLabel(status)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-actions">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn btn-secondary"
                            disabled={isLoading}
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Сохранение...' : mode === 'create' ? 'Создать' : 'Сохранить'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Helper functions for labels
const getMaterialLabel = (material: MaterialType): string => {
    const labels: Record<MaterialType, string> = {
        oil_paint: 'Масляная краска',
        watercolor: 'Акварель',
        acrylic: 'Акрил',
        tempera: 'Темпера',
        canvas: 'Холст',
        wood: 'Дерево',
        metal: 'Металл',
        stone: 'Камень',
        ceramic: 'Керамика',
        paper: 'Бумага',
        textile: 'Текстиль',
        mixed: 'Смешанная техника',
        other: 'Другое'
    };
    return labels[material] || material;
};

const getStatusLabel = (status: ArtifactStatus): string => {
    const labels: Record<ArtifactStatus, string> = {
        good: 'Хорошее',
        requires_attention: 'Требует внимания',
        critical: 'Критическое',
        under_restoration: 'На реставрации',
        exhibited: 'Экспонируется'
    };
    return labels[status] || status;
};

export default ArtifactForm;

