export interface PageInfo {
  path: string;
  title: string;
  description: string;
  index: boolean;
  redirect?: boolean;
  parent?: string;
  breadcrumbs?: boolean;
  og?: string;
  ogAlt?: string;
  label: string;
}
export interface Business {
  name: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  hours: string;
  latitude: string;
  longitude: string;
}
export interface SiteConfig {
  siteUrl: string;
  business: Business;
  businessIsReal: boolean;
  isLocalUrl: boolean;
}
export interface Head {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  image: { url: string; width: number; height: number; alt: string };
  jsonLd: Record<string, unknown>[];
}
export declare const SHOP_NAME: string;
export declare const TITLE_SEPARATOR: string;
export declare const DEFAULT_SITE_URL: string;
export declare const OG_WIDTH: number;
export declare const OG_HEIGHT: number;
export declare const PLACEHOLDER_PATTERNS: readonly RegExp[];
export declare function looksLikePlaceholder(value: string | null | undefined): boolean;
export declare function siteConfig(env?: Record<string, string | boolean | undefined>): SiteConfig;
export declare function absoluteUrl(config: SiteConfig, path: string): string;
export declare function fullTitle(title: string): string;
export declare const PAGES: readonly PageInfo[];
export declare const SPECIAL_PAGES: Readonly<
  Record<'notFound' | 'forbidden' | 'error', { title: string; description: string }>
>;
export declare const ZEN_ROOT: string;
export declare const ZEN_SECTION_PATHS: readonly string[];
export declare const REDIRECTS: readonly { from: string; to: string }[];
export declare const PRIVATE_PREFIXES: readonly string[];
export declare function pageFor(path: string): PageInfo | undefined;
export declare function indexablePages(): PageInfo[];
export declare function breadcrumbTrail(path: string): { label: string; path: string }[];
export declare function websiteSchema(config: SiteConfig): Record<string, unknown>;
export declare function organizationSchema(config: SiteConfig): Record<string, unknown>;
export declare function localBusinessSchema(
  config: SiteConfig,
  path: string,
): Record<string, unknown> | null;
export declare function breadcrumbSchema(
  config: SiteConfig,
  path: string,
): Record<string, unknown> | null;
export declare function headFor(config: SiteConfig, path: string): Head | null;
