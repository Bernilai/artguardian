import { API_BASE_URL } from './config';
import { apiService } from './api';

export interface ImageUploadResponse {
    object_path: string;
    url: string;
    public_url: string;
    filename: string;
}

export interface MultipleImageUploadResponse {
    results: Array<{
        filename: string;
        success: boolean;
        object_path?: string;
        url?: string;
        public_url?: string;
        error?: string;
    }>;
}

export const imagesAPI = {
    /**
     * Upload a single image file
     */
    async uploadImage(
        file: File,
        folder: string = 'artifacts',
        token?: string
    ): Promise<ImageUploadResponse> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', folder);

        const response = await fetch(`${API_BASE_URL}/images/upload`, {
            method: 'POST',
            headers: token ? {
                'Authorization': `Bearer ${token}`,
            } : {},
            credentials: 'include',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }

        return response.json();
    },

    /**
     * Upload multiple image files
     */
    async uploadMultipleImages(
        files: File[],
        folder: string = 'artifacts',
        token?: string
    ): Promise<MultipleImageUploadResponse> {
        const formData = new FormData();
        files.forEach(file => {
            formData.append('files', file);
        });
        formData.append('folder', folder);

        const response = await fetch(`${API_BASE_URL}/images/upload-multiple`, {
            method: 'POST',
            headers: token ? {
                'Authorization': `Bearer ${token}`,
            } : {},
            credentials: 'include',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }

        return response.json();
    },

    /**
     * Get image URL (presigned URL from MinIO)
     */
    async getImageUrl(objectPath: string, token?: string): Promise<string> {
        const response = await fetch(`${API_BASE_URL}/images/${objectPath}`, {
            method: 'GET',
            headers: token ? {
                'Authorization': `Bearer ${token}`,
            } : {},
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error('Failed to get image URL');
        }

        // The endpoint redirects to the presigned URL
        return response.url;
    },

    /**
     * Delete an image
     */
    async deleteImage(objectPath: string, token?: string): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/images/${objectPath}`, {
            method: 'DELETE',
            headers: token ? {
                'Authorization': `Bearer ${token}`,
            } : {},
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }
    },
};

