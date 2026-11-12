import { siteConfig, type SiteConfig } from '../seo/seo-data.js';

/**
 * Brand configuration (rename-proof). Mirrors backend/core/brand.py.
 * Never type these names in components, routes, titles or tests: import them from here.
 * Customers see the shop brand. The platform name appears only on the For Zenotians page
 * and in the small "Powered by" line.
 */
export const brand = {
  shopName: 'Alankar',
  shopTagline: 'Salon · Spa · Beauty Parlor',
  logoText: 'Alankar',
  // "ZenFlow" was the working name; users now see Alankar everywhere.
  platformName: 'Alankar',
  platformTagline: 'Book smarter. Serve faster. Grow automatically.',
} as const;

export const poweredBy = `Powered by ${brand.platformName}`;

/**
 * The site's public address and the shop's real business details, read from VITE_* environment
 * variables when the site is built (docs/SEO.md). SITE_URL has no trailing slash. With no real
 * details set, `site.businessIsReal` is false and nothing on the site or in its structured data
 * pretends to be a real address or phone number.
 */
export const site: SiteConfig = siteConfig(import.meta.env as Record<string, string | undefined>);
export const SITE_URL = site.siteUrl;
export const business = site.business;
