import type { Artifact } from '../../types';

/** Placeholder when there is no usable primary image URL. */
export const FALLBACK_ARTIFACT_IMAGE_SRC = '/images/placeholder-artifact.jpg';

/**
 * Only return URLs the browser can load directly in <img>.
 * MinIO object keys (e.g. artifacts/uuid.jpg) must not be turned into /images/... on the SPA host:
 * that serves index.html (text/html) and triggers net::ERR_BLOCKED_BY_ORB in Chrome.
 */
export function getArtifactImageUrl(imagePath: string): string {
    if (!imagePath) return '';
    const t = imagePath.trim();
    if (t.startsWith('http://') || t.startsWith('https://')) {
        return t;
    }
    if (t.startsWith('data:')) {
        return t;
    }
    if (t.startsWith('/')) {
        return t;
    }
    // Простое имя файла — относительный путь в каталог `/images/` на SPA-хосте.
    // Ключи вида `artifacts/uuid.jpg` (MinIO) не превращаем в URL: иначе хост отдаёт HTML и ловим ORB в Chrome.
    if (!t.includes('/')) {
        return `/images/${t}`;
    }
    return '';
}

export function primaryArtifactImageUrl(artifact: Pick<Artifact, 'images'>): string | null {
    const images = Array.isArray(artifact.images) ? artifact.images : [];
    if (images.length === 0 || !images[0]) return null;
    const url = getArtifactImageUrl(images[0]);
    return url || null;
}
