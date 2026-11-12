import { useEffect } from 'react';
import { site } from '../config/brand';
import { fullTitle, headFor, SHOP_NAME, type Head } from './seo-data.js';

/** Site URL and business details (one source: src/config/brand.ts). */
export const SITE = site;

const SHARE_KEYS: [attr: 'name' | 'property', key: string][] = [
  ['property', 'og:type'],
  ['property', 'og:site_name'],
  ['property', 'og:title'],
  ['property', 'og:description'],
  ['property', 'og:url'],
  ['property', 'og:image'],
  ['property', 'og:image:width'],
  ['property', 'og:image:height'],
  ['property', 'og:image:alt'],
  ['name', 'twitter:card'],
  ['name', 'twitter:title'],
  ['name', 'twitter:description'],
  ['name', 'twitter:image'],
  ['name', 'twitter:image:alt'],
];

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', value);
}

function removeMeta(attr: 'name' | 'property', key: string) {
  document.head.querySelectorAll(`meta[${attr}="${key}"]`).forEach((tag) => tag.remove());
}

function setCanonical(href: string | null) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

function setJsonLd(items: Record<string, unknown>[]) {
  document.head
    .querySelectorAll('script[type="application/ld+json"]')
    .forEach((tag) => tag.remove());
  for (const item of items) {
    const tag = document.createElement('script');
    tag.type = 'application/ld+json';
    tag.text = JSON.stringify(item);
    document.head.appendChild(tag);
  }
}

/** Writes a public page's head: title, description, canonical, robots, share tags, JSON-LD. */
export function applyHead(head: Head) {
  document.title = head.title;
  setMeta('name', 'description', head.description);
  setMeta('name', 'robots', head.robots);
  setCanonical(head.canonical);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', SHOP_NAME);
  setMeta('property', 'og:title', head.title);
  setMeta('property', 'og:description', head.description);
  setMeta('property', 'og:url', head.canonical);
  setMeta('property', 'og:image', head.image.url);
  setMeta('property', 'og:image:width', String(head.image.width));
  setMeta('property', 'og:image:height', String(head.image.height));
  setMeta('property', 'og:image:alt', head.image.alt);
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', head.title);
  setMeta('name', 'twitter:description', head.description);
  setMeta('name', 'twitter:image', head.image.url);
  setMeta('name', 'twitter:image:alt', head.image.alt);
  setJsonLd(head.jsonLd);
}

/** A page that must never be indexed (signed-in screens, 404, 403): title and noindex only. */
export function applyPrivateHead(title?: string, description?: string) {
  document.title = title ? fullTitle(title) : SHOP_NAME;
  setMeta('name', 'robots', 'noindex, nofollow');
  if (description) setMeta('name', 'description', description);
  setCanonical(null);
  for (const [attr, key] of SHARE_KEYS) removeMeta(attr, key);
  setJsonLd([]);
}

/** The head of the public page at `path` (from src/seo/seo-data.js). */
export function usePageHead(path: string) {
  useEffect(() => {
    const head = headFor(SITE, path);
    if (head) applyHead(head);
  }, [path]);
}
