import type { Who } from './helpers';

/** Every section of the For Zenotians page has its own URL. */
export const ZENOTIANS_PAGES = [
  '/zenotians',
  '/zenotians/about/summary',
  '/zenotians/about/education',
  '/zenotians/about/projects',
  '/zenotians/about/experience',
  '/zenotians/about/skills',
  '/zenotians/about/certifications',
  '/zenotians/about-zenoti',
  '/zenotians/day',
  '/zenotians/project',
  '/zenotians/mapping',
  '/zenotians/decisions',
  '/zenotians/quality',
  '/zenotians/security',
  '/zenotians/limitations',
  '/zenotians/questions',
  '/zenotians/contact',
];

/** Public pages anyone can open. */
export const PUBLIC_PAGES = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  ...ZENOTIANS_PAGES,
  '/privacy',
  '/terms',
  '/cancellation-policy',
];

/** A few real screens per role (all exist in the app; no placeholders). */
export const ROLE_PAGES: Record<Exclude<Who, 'other'>, string[]> = {
  customer: [
    '/customer-dashboard',
    '/customer/book',
    '/customer/appointments',
    '/customer/invoices',
  ],
  receptionist: ['/dashboard', '/appointments', '/customers', '/pos', '/inventory'],
  stylist: ['/my-day', '/requests', '/my-appointments', '/my-schedule'],
  admin: ['/dashboard', '/audit-log', '/ratings', '/reports', '/payroll', '/staff'],
};
