import type { Artifact } from '../../types';

/** Inline SVG — avoids missing `public/images/placeholder-artifact.jpg` causing onError → reload loops. */
export const FALLBACK_ARTIFACT_IMAGE_SRC =
    'data:image/svg+xml,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="384" viewBox="0 0 512 384">' +
            '<rect fill="%232a2a2a" width="512" height="384"/>' +
            '<g fill="none" stroke="%23555" stroke-width="2">' +
            '<path d="M160 260 L256 140 L352 260 Z"/><circle cx="196" cy="156" r="18"/></g>' +
            '<text x="256" y="320" fill="%23888" font-size="20" text-anchor="middle" font-family="system-ui,sans-serif">Нет фото</text>' +
            '</svg>'
    );

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
    return '';
}

export function primaryArtifactImageUrl(artifact: Pick<Artifact, 'images'>): string | null {
    const images = Array.isArray(artifact.images) ? artifact.images : [];
    if (images.length === 0 || !images[0]) return null;
    const url = getArtifactImageUrl(images[0]);
    return url || null;
}
