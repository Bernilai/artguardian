import { useEffect, useMemo, useRef } from 'react';
import { getCanonicalOrigin } from '../../utils/siteUrl';

export interface SeoProps {
    title: string;
    description: string;
    canonicalPath: string;
    noIndex?: boolean;
    ogImage?: string;
    jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

const APP_NAME = 'ArtGuardian';

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
    let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}

function upsertCanonical(href: string) {
    let el = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        document.head.appendChild(el);
    }
    el.setAttribute('href', href);
}

export const Seo: React.FC<SeoProps> = ({
    title,
    description,
    canonicalPath,
    noIndex = false,
    ogImage,
    jsonLd,
}) => {
    const instanceIdRef = useRef(`seo-${Math.random().toString(36).slice(2)}`);
    const origin = getCanonicalOrigin();
    const path = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
    const canonicalUrl = `${origin}${path}`;
    const fullTitle = title.includes(APP_NAME) ? title : `${title} | ${APP_NAME}`;
    const defaultOg = process.env.REACT_APP_OG_IMAGE_URL?.trim();
    const imageUrl =
        ogImage ||
        (defaultOg
            ? defaultOg.startsWith('http')
                ? defaultOg
                : `${origin}${defaultOg.startsWith('/') ? '' : '/'}${defaultOg}`
            : '');
    const ldBlocks = useMemo(
        () => (jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]).filter(Boolean) : []),
        [jsonLd]
    );

    useEffect(() => {
        document.documentElement.setAttribute('lang', 'ru');
        document.title = fullTitle;

        upsertMeta('name', 'description', description);
        upsertCanonical(canonicalUrl);
        upsertMeta('name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow');

        upsertMeta('property', 'og:type', 'website');
        upsertMeta('property', 'og:site_name', APP_NAME);
        upsertMeta('property', 'og:title', fullTitle);
        upsertMeta('property', 'og:description', description);
        upsertMeta('property', 'og:url', canonicalUrl);
        upsertMeta('property', 'og:locale', 'ru_RU');
        if (imageUrl) {
            upsertMeta('property', 'og:image', imageUrl);
        }

        upsertMeta('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary');
        upsertMeta('name', 'twitter:title', fullTitle);
        upsertMeta('name', 'twitter:description', description);
        if (imageUrl) {
            upsertMeta('name', 'twitter:image', imageUrl);
        }

        const selector = `script[type="application/ld+json"][data-seo-id="${instanceIdRef.current}"]`;
        document.head.querySelectorAll(selector).forEach((n) => n.remove());
        ldBlocks.forEach((obj) => {
            const script = document.createElement('script');
            script.type = 'application/ld+json';
            script.dataset.seoId = instanceIdRef.current;
            script.text = JSON.stringify(obj);
            document.head.appendChild(script);
        });

        return () => {
            document.head.querySelectorAll(selector).forEach((n) => n.remove());
        };
    }, [canonicalUrl, description, fullTitle, imageUrl, ldBlocks, noIndex]);

    return null;
};

export default Seo;
