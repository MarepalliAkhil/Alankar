import { describe, expect, it } from 'vitest';
import { fullContent } from '../test/zenotians-fixture';
import { buildMenu } from '../pages/zenotians/model';
import {
  breadcrumbSchema,
  breadcrumbTrail,
  headFor,
  indexablePages,
  localBusinessSchema,
  looksLikePlaceholder,
  PAGES,
  PRIVATE_PREFIXES,
  REDIRECTS,
  siteConfig,
  ZEN_ROOT,
  ZEN_SECTION_PATHS,
} from './seo-data.js';

const demo = siteConfig({ VITE_SITE_URL: 'https://alankar.test/' });
const real = siteConfig({
  VITE_SITE_URL: 'https://alankar.test',
  VITE_BUSINESS_PHONE: '+91 98480 12345',
  VITE_BUSINESS_EMAIL: 'hello@alankar.test',
  VITE_BUSINESS_STREET: '12 MG Road',
  VITE_BUSINESS_CITY: 'Vijayawada',
  VITE_BUSINESS_REGION: 'Andhra Pradesh',
  VITE_BUSINESS_POSTAL_CODE: '520010',
  VITE_BUSINESS_HOURS: 'Mo-Sa 10:00-20:00, Su 10:00-18:00',
  VITE_BUSINESS_LATITUDE: '16.5062',
  VITE_BUSINESS_LONGITUDE: '80.6480',
});

describe('one source of truth', () => {
  it('reads SITE_URL without a trailing slash and falls back to a local address', () => {
    expect(demo.siteUrl).toBe('https://alankar.test');
    expect(siteConfig({}).isLocalUrl).toBe(true);
    expect(demo.isLocalUrl).toBe(false);
  });

  it('treats empty or placeholder business details as not real', () => {
    expect(demo.businessIsReal).toBe(false);
    expect(real.businessIsReal).toBe(true);
    const fake = siteConfig({
      VITE_BUSINESS_PHONE: '+91 90000 00000',
      VITE_BUSINESS_STREET: 'Demo address',
      VITE_BUSINESS_CITY: 'Vijayawada',
      VITE_BUSINESS_POSTAL_CODE: '520010',
    });
    expect(fake.businessIsReal).toBe(false);
    expect(looksLikePlaceholder('hello@example.com')).toBe(true);
    expect(looksLikePlaceholder('+91 98480 12345')).toBe(false);
  });
});

describe('titles, descriptions, canonicals', () => {
  it('gives every page a unique "Page | Alankar" title and a unique 120-160 character description', () => {
    const titles = PAGES.map((p) => headFor(demo, p.path)!.title);
    expect(new Set(titles).size).toBe(PAGES.length);
    for (const title of titles) {
      expect(title).toMatch(/^.+ \| Alankar$/);
      expect(title).not.toMatch(/vite|react/i);
    }
    const descriptions = PAGES.map((p) => p.description);
    expect(new Set(descriptions).size).toBe(PAGES.length);
    for (const d of descriptions) {
      expect(d.length).toBeGreaterThanOrEqual(120);
      expect(d.length).toBeLessThanOrEqual(160);
    }
  });

  it('builds every canonical from SITE_URL', () => {
    for (const page of PAGES) {
      expect(headFor(demo, page.path)!.canonical).toBe(
        `https://alankar.test${page.path === '/' ? '/' : page.path}`,
      );
    }
  });

  it('gives an old For Zenotians section address the page canonical', () => {
    for (const path of ZEN_SECTION_PATHS) {
      expect(headFor(demo, path)!.canonical).toBe(`https://alankar.test${ZEN_ROOT}`);
    }
  });

  it('marks utility and redirect pages noindex and keeps them out of the sitemap list', () => {
    expect(headFor(demo, '/forgot-password')!.robots).toBe('noindex, follow');
    expect(headFor(demo, '/book')!.robots).toBe('noindex, follow');
    expect(headFor(demo, '/salon')!.robots).toBe('index, follow');
    const listed = indexablePages().map((p) => p.path);
    expect(listed).toEqual(
      expect.arrayContaining(['/', '/salon', '/spa', '/beauty-parlor', ZEN_ROOT]),
    );
    expect(listed).not.toContain('/book');
    for (const path of listed.filter((p) => p !== '/')) {
      expect(PRIVATE_PREFIXES.some((prefix) => path.startsWith(prefix.replace(/\/$/, '')))).toBe(
        false,
      );
    }
  });

  it('has share images of 1200 x 630 with alt text on the main pages', () => {
    for (const path of ['/', '/salon', '/spa', '/beauty-parlor', ZEN_ROOT]) {
      const image = headFor(demo, path)!.image;
      expect(image.url).toMatch(/^https:\/\/alankar\.test\/og\/[a-z-]+\.png$/);
      expect([image.width, image.height]).toEqual([1200, 630]);
      expect(image.alt.length).toBeGreaterThan(10);
    }
  });

  it('keeps the old /zenotians addresses as redirects to /for-zenotians', () => {
    expect(REDIRECTS).toEqual([
      { from: '/zenotians', to: '/for-zenotians' },
      { from: '/zenotians/*', to: '/for-zenotians/*' },
    ]);
  });

  it('lists every For Zenotians section address the page can show', () => {
    const fromMenu = buildMenu(fullContent).flatMap((entry) =>
      entry.children ? entry.children.map((c) => c.path) : [entry.path],
    );
    for (const path of fromMenu.filter((p) => p !== ZEN_ROOT)) {
      expect(ZEN_SECTION_PATHS).toContain(path);
    }
  });
});

describe('breadcrumbs', () => {
  it('builds the trail from the parents, Home first', () => {
    expect(breadcrumbTrail('/forgot-password')).toEqual([
      { label: 'Home', path: '/' },
      { label: 'Login', path: '/login' },
      { label: 'Forgot password', path: '/forgot-password' },
    ]);
  });

  it('has a BreadcrumbList only where the page shows the trail', () => {
    const crumbs = breadcrumbSchema(demo, '/privacy') as {
      '@type': string;
      itemListElement: { position: number; name: string; item: string }[];
    };
    expect(crumbs['@type']).toBe('BreadcrumbList');
    expect(crumbs.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://alankar.test/' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Privacy notice',
        item: 'https://alankar.test/privacy',
      },
    ]);
    expect(breadcrumbSchema(demo, '/salon')).toBeNull();
    expect(breadcrumbSchema(demo, '/')).toBeNull();
  });
});

describe('structured data', () => {
  it('has WebSite and Organization on the home page', () => {
    const types = headFor(demo, '/')!.jsonLd.map((item) => item['@type']);
    expect(types).toEqual(['WebSite', 'Organization']);
    const org = headFor(demo, '/')!.jsonLd[1] as Record<string, string>;
    expect(org['@context']).toBe('https://schema.org');
    expect(org.url).toBe('https://alankar.test/');
    expect(org.logo).toBe('https://alankar.test/brand/alankar-logo-512.png');
  });

  it('never publishes a LocalBusiness with demo or empty details', () => {
    for (const path of ['/', '/salon', '/spa', '/beauty-parlor']) {
      expect(localBusinessSchema(demo, path)).toBeNull();
      expect(headFor(demo, path)!.jsonLd.map((i) => i['@type'])).not.toContain('BeautySalon');
    }
  });

  it('publishes the most specific business type when real details are set', () => {
    expect(localBusinessSchema(real, '/')!['@type']).toBe('BeautySalon');
    expect(localBusinessSchema(real, '/salon')!['@type']).toBe('HairSalon');
    expect(localBusinessSchema(real, '/spa')!['@type']).toBe('DaySpa');
    expect(localBusinessSchema(real, '/beauty-parlor')!['@type']).toBe('BeautySalon');
    expect(localBusinessSchema(real, '/privacy')).toBeNull();
    const salon = localBusinessSchema(real, '/salon') as Record<string, unknown>;
    expect(salon).toMatchObject({
      '@context': 'https://schema.org',
      name: 'Alankar',
      url: 'https://alankar.test/salon',
      telephone: '+91 98480 12345',
      email: 'hello@alankar.test',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '12 MG Road',
        addressLocality: 'Vijayawada',
        addressRegion: 'Andhra Pradesh',
        postalCode: '520010',
        addressCountry: 'IN',
      },
      openingHours: ['Mo-Sa 10:00-20:00', 'Su 10:00-18:00'],
      geo: { '@type': 'GeoCoordinates', latitude: 16.5062, longitude: 80.648 },
    });
  });
});
