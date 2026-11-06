import { useEffect } from 'react';
import { brand } from '../config/brand';

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', value);
}

/**
 * Page title plus the description, Open Graph and Twitter tags (so a shared link, for example on
 * LinkedIn, shows a sensible preview). The static defaults live in index.html for crawlers that do
 * not run scripts; this keeps them right for each sub-route in the browser.
 */
export function useSeo(title: string, description: string): void {
  useEffect(() => {
    const full = `${title} · ${brand.shopName}`;
    document.title = full;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', full);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:url', window.location.href);
    setMeta('name', 'twitter:card', 'summary');
    setMeta('name', 'twitter:title', full);
    setMeta('name', 'twitter:description', description);
  }, [title, description]);
}
