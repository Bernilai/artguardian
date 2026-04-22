export function getCanonicalOrigin(): string {
    const env = process.env.REACT_APP_PUBLIC_SITE_URL?.trim();
    if (env) {
        return env.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    return 'http://localhost:3000';
}
