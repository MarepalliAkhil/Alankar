/**
 * The one source of truth for public URLs, page titles, descriptions, share images, breadcrumbs
 * and structured data. Plain JavaScript so the browser app (src/seo/head.ts) and the build scripts
 * (scripts/seo-build.mjs) use the same file. Business details come from VITE_* environment
 * variables at build time (see docs/SEO.md); with none set, nothing pretends to be a real shop.
 */

export const SHOP_NAME = 'Alankar';
export const TITLE_SEPARATOR = ' | ';
export const DEFAULT_SITE_URL = 'http://localhost:5173';
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Strings that must never reach a visitor as if they were real (checked in dist too). */
export const PLACEHOLDER_PATTERNS = [
  /demo\s+address/i,
  /\+?91[\s-]*90000[\s-]*00000/,
  /\bexample\.com\b/i,
  /lorem\s+ipsum/i,
  /\bjohn\s+doe\b/i,
  /\bjane\s+doe\b/i,
  /coming\s+soon/i,
];

export function looksLikePlaceholder(value) {
  if (!value) return false;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(String(value)));
}

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/** Site URL and business details from an env object (import.meta.env or Vite's loadEnv). */
export function siteConfig(env = {}) {
  const siteUrl = (clean(env.VITE_SITE_URL) || DEFAULT_SITE_URL).replace(/\/+$/, '');
  const business = {
    name: clean(env.VITE_BUSINESS_NAME) || SHOP_NAME,
    phone: clean(env.VITE_BUSINESS_PHONE),
    email: clean(env.VITE_BUSINESS_EMAIL),
    street: clean(env.VITE_BUSINESS_STREET),
    city: clean(env.VITE_BUSINESS_CITY),
    region: clean(env.VITE_BUSINESS_REGION),
    postalCode: clean(env.VITE_BUSINESS_POSTAL_CODE),
    country: clean(env.VITE_BUSINESS_COUNTRY) || 'IN',
    // schema.org openingHours text, for example "Mo-Sa 10:00-20:00, Su 10:00-18:00"
    hours: clean(env.VITE_BUSINESS_HOURS),
    latitude: clean(env.VITE_BUSINESS_LATITUDE),
    longitude: clean(env.VITE_BUSINESS_LONGITUDE),
  };
  const filled = [business.phone, business.street, business.city, business.postalCode];
  const businessIsReal =
    filled.every(Boolean) &&
    ![business.phone, business.email, business.street, business.city].some(looksLikePlaceholder);
  return {
    siteUrl,
    business,
    businessIsReal,
    isLocalUrl: /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(siteUrl),
  };
}

export function absoluteUrl(config, path) {
  return `${config.siteUrl}${path === '/' ? '/' : path}`;
}

export function fullTitle(title) {
  return `${title}${TITLE_SEPARATOR}${SHOP_NAME}`;
}

const ZEN = '/for-zenotians';

/**
 * Every public page. `index: false` pages get "noindex" and stay out of the sitemap; `redirect`
 * pages only forward. `parent` builds the trail; `breadcrumbs` pages (below the top level) show it
 * and carry the matching BreadcrumbList. `og` names a 1200x630 picture in public/og.
 */
export const PAGES = [
  {
    path: '/',
    title: 'Salon, Spa and Beauty Parlor',
    description:
      'Alankar is a unisex salon, spa and beauty parlor demo: see services and prices, then send a booking request that the front desk and the stylist both confirm.',
    index: true,
    og: 'home',
    ogAlt: 'Alankar reception with the shop sign',
    label: 'Home',
  },
  {
    path: '/salon',
    title: 'Salon: Haircuts, Colour and Grooming',
    description:
      'Haircuts, colour, keratin, beard design and grooming at the Alankar salon. Compare the services and prices, pick a stylist and send a booking request online.',
    index: true,
    parent: '/',
    og: 'salon',
    ogAlt: 'The Alankar salon: styling chairs and gold-lit mirrors',
    label: 'Salon',
  },
  {
    path: '/spa',
    title: 'Spa: Massages and Relaxing Treatments',
    description:
      'Swedish and deep-tissue massage, reflexology and other calm treatments at the Alankar spa. See every treatment with its time and price, then book it online.',
    index: true,
    parent: '/',
    og: 'spa',
    ogAlt: 'The Alankar spa: a quiet treatment room',
    label: 'Spa',
  },
  {
    path: '/beauty-parlor',
    title: 'Beauty Parlor: Skin, Bridal and Nails',
    description:
      'Facials, bridal and party makeup, nails and waxing at the Alankar beauty parlor. Browse the services with prices and send a booking request in a few steps.',
    index: true,
    parent: '/',
    og: 'beauty-parlor',
    ogAlt: 'The Alankar beauty parlor: a makeup station',
    label: 'Beauty Parlor',
  },
  {
    path: '/book',
    title: 'Book an Appointment',
    description:
      'Book a salon, spa or beauty parlor visit at Alankar: sign in or create a free account, choose a service, a time and a stylist, and send your request.',
    index: false,
    redirect: true,
    parent: '/',
    label: 'Book',
  },
  {
    path: ZEN,
    title: 'For Zenotians: a Salon Platform Portfolio Project',
    description:
      'An independent portfolio project: a salon, spa and beauty parlor platform built end to end, with AIR, an AI receptionist, plus its tests and honest limits.',
    index: true,
    parent: '/',
    og: 'for-zenotians',
    ogAlt: 'For Zenotians: the Alankar portfolio project',
    label: 'For Zenotians',
  },
  {
    path: '/login',
    title: 'Sign In',
    description:
      'Sign in to Alankar as a customer to book and pay for visits, or as a receptionist, stylist or admin to run the day. Customers can also create a new account.',
    index: true,
    parent: '/',
    label: 'Login',
  },
  {
    path: '/register',
    title: 'Create a Customer Account',
    description:
      'Create a free Alankar customer account to send booking requests, pay online, see your invoices and packages, and chat with your stylist after a booking.',
    index: true,
    parent: '/',
    label: 'Create account',
  },
  {
    path: '/forgot-password',
    breadcrumbs: true,
    title: 'Forgot Your Password',
    description:
      'Forgot your Alankar password? Enter the email address of your account and we will send you a link to choose a new password. The link works only once.',
    index: false,
    parent: '/login',
    label: 'Forgot password',
  },
  {
    path: '/reset-password',
    breadcrumbs: true,
    title: 'Choose a New Password',
    description:
      'Choose a new password for your Alankar account using the link from your email. Use at least eight characters; the link stops working once it has been used.',
    index: false,
    parent: '/login',
    label: 'New password',
  },
  {
    path: '/accept-invite',
    breadcrumbs: true,
    title: 'Join the Alankar Team',
    description:
      'Accept your invitation to join the Alankar team as a receptionist or stylist: confirm your name and choose a password to open your staff account.',
    index: false,
    parent: '/login',
    label: 'Join the team',
  },
  {
    path: '/unsubscribe',
    breadcrumbs: true,
    title: 'Unsubscribe from Emails',
    description:
      'Stop marketing emails from Alankar with one click. You will still receive the messages about your own bookings, payments and account that you need.',
    index: false,
    parent: '/',
    label: 'Unsubscribe',
  },
  {
    path: '/privacy',
    breadcrumbs: true,
    title: 'Privacy Notice',
    description:
      'How Alankar handles your personal data: what is stored for your bookings, who can see it, how long it is kept, and how to export or delete your account.',
    index: true,
    parent: '/',
    label: 'Privacy notice',
  },
  {
    path: '/terms',
    breadcrumbs: true,
    title: 'Terms of Service',
    description:
      'The terms for using the Alankar website and booking service: booking requests, online payments, prices including GST, your account and fair use.',
    index: true,
    parent: '/',
    label: 'Terms of service',
  },
  {
    path: '/cancellation-policy',
    breadcrumbs: true,
    title: 'Cancellation Policy',
    description:
      'When you can cancel or move an Alankar booking for free, how prepayments are refunded, and what happens when the salon has to change your appointment.',
    index: true,
    parent: '/',
    label: 'Cancellation policy',
  },
];

/** Pages that are not real routes in the sitemap but still need a title (noindex). */
export const SPECIAL_PAGES = {
  notFound: {
    title: 'Page not found',
    description: 'This page does not exist on Alankar.',
  },
  forbidden: {
    title: 'No access',
    description: 'This page is not available for your account.',
  },
  error: {
    title: 'Something went wrong',
    description: 'Something went wrong on Alankar.',
  },
};

/** The For Zenotians sections: one page, each section with its own shareable address. */
export const ZEN_ROOT = ZEN;
export const ZEN_SECTION_PATHS = [
  `${ZEN}/about/summary`,
  `${ZEN}/about/education`,
  `${ZEN}/about/projects`,
  `${ZEN}/about/experience`,
  `${ZEN}/about/skills`,
  `${ZEN}/about/certifications`,
  `${ZEN}/about/achievements`,
  `${ZEN}/about-zenoti`,
  `${ZEN}/project`,
  `${ZEN}/air`,
  `${ZEN}/ai-intelligence`,
  `${ZEN}/mapping`,
  `${ZEN}/day`,
  `${ZEN}/quality`,
  `${ZEN}/security`,
  `${ZEN}/limitations`,
  `${ZEN}/demo`,
  `${ZEN}/contact`,
];

/** Old addresses that still work: client redirects (App.tsx) and host rules (docs/SEO.md). */
export const REDIRECTS = [
  { from: '/zenotians', to: ZEN },
  { from: '/zenotians/*', to: `${ZEN}/*` },
];

/** Areas that must never be indexed: the API and every signed-in screen. */
export const PRIVATE_PREFIXES = [
  '/api/',
  '/customer/',
  '/customer-dashboard',
  '/dashboard',
  '/appointments',
  '/schedule',
  '/customers',
  '/staff',
  '/my-day',
  '/my-appointments',
  '/my-schedule',
  '/my-hours',
  '/requests',
  '/earnings',
  '/chat',
  '/profile',
  '/notifications',
  '/pos',
  '/orders',
  '/inventory',
  '/settings',
  '/content',
  '/marketing',
  '/recommendations',
  '/reports',
  '/audit-log',
  '/security',
  '/ratings',
  '/payroll',
  '/work-hours',
  '/staff-summary',
  '/services',
  '/memberships',
  '/packages',
  '/package-requests',
  '/gift-cards',
  '/waitlist',
  '/chatbot-insights',
  '/air-activity',
  '/cash-close',
];

export function pageFor(path) {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  const exact = PAGES.find((page) => page.path === clean);
  if (exact) return exact;
  if (clean === ZEN || clean.startsWith(`${ZEN}/`)) return PAGES.find((p) => p.path === ZEN);
  return undefined;
}

export const indexablePages = () => PAGES.filter((page) => page.index && !page.redirect);

/** Breadcrumb trail for a page, Home first, the page itself last. */
export function breadcrumbTrail(path) {
  const trail = [];
  let page = pageFor(path);
  while (page) {
    trail.unshift({ label: page.label, path: page.path });
    page = page.parent ? pageFor(page.parent) : undefined;
  }
  return trail;
}

// ---------------------------------------------------------------- structured data (JSON-LD)

export function websiteSchema(config) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SHOP_NAME,
    url: absoluteUrl(config, '/'),
  };
}

export function organizationSchema(config) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: config.business.name,
    url: absoluteUrl(config, '/'),
    logo: absoluteUrl(config, '/brand/alankar-logo-512.png'),
  };
}

const BUSINESS_TYPE = {
  '/': 'BeautySalon',
  '/salon': 'HairSalon',
  '/spa': 'DaySpa',
  '/beauty-parlor': 'BeautySalon',
};

/** LocalBusiness only with real, configured details. Demo or empty details: null (never fake). */
export function localBusinessSchema(config, path) {
  const type = BUSINESS_TYPE[path];
  if (!type || !config.businessIsReal) return null;
  const b = config.business;
  const schema = {
    '@context': 'https://schema.org',
    '@type': type,
    name: b.name,
    url: absoluteUrl(config, path),
    image: absoluteUrl(config, `/og/${path === '/' ? 'home' : path.slice(1)}.png`),
    telephone: b.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: b.street,
      addressLocality: b.city,
      addressRegion: b.region || undefined,
      postalCode: b.postalCode,
      addressCountry: b.country,
    },
  };
  if (b.email) schema.email = b.email;
  if (b.hours) schema.openingHours = b.hours.split(/\s*,\s*/).filter(Boolean);
  if (b.latitude && b.longitude) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: Number(b.latitude),
      longitude: Number(b.longitude),
    };
  }
  return JSON.parse(JSON.stringify(schema));
}

export function breadcrumbSchema(config, path) {
  // Only where the page shows the same trail (components/layout/Breadcrumbs.tsx).
  if (!pageFor(path)?.breadcrumbs) return null;
  const trail = breadcrumbTrail(path);
  if (trail.length < 2) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: absoluteUrl(config, crumb.path),
    })),
  };
}

// ---------------------------------------------------------------- the head of one page

/**
 * Everything the <head> of a public page carries. `path` is the address asked for (an old
 * For Zenotians section address shares the page's canonical).
 */
export function headFor(config, path) {
  const page = pageFor(path);
  if (!page) return null;
  const canonical = absoluteUrl(config, page.path);
  const og = page.og
    ? {
        url: absoluteUrl(config, `/og/${page.og}.png`),
        width: OG_WIDTH,
        height: OG_HEIGHT,
        alt: page.ogAlt,
      }
    : {
        url: absoluteUrl(config, '/og/home.png'),
        width: OG_WIDTH,
        height: OG_HEIGHT,
        alt: 'Alankar reception with the shop sign',
      };
  const jsonLd = [];
  if (page.path === '/') jsonLd.push(websiteSchema(config), organizationSchema(config));
  const business = localBusinessSchema(config, page.path);
  if (business) jsonLd.push(business);
  const crumbs = breadcrumbSchema(config, page.path);
  if (crumbs) jsonLd.push(crumbs);
  return {
    title: fullTitle(page.title),
    description: page.description,
    canonical,
    robots: page.index ? 'index, follow' : 'noindex, follow',
    image: og,
    jsonLd,
  };
}
