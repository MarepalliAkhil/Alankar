import type { Who } from './helpers';

/** Every section of the For Zenotians page has its own URL. */
export const ZENOTIANS_PAGES = [
  '/for-zenotians',
  '/for-zenotians/about/summary',
  '/for-zenotians/about/education',
  '/for-zenotians/about/projects',
  '/for-zenotians/about/experience',
  '/for-zenotians/about/skills',
  '/for-zenotians/about/certifications',
  '/for-zenotians/about-zenoti',
  '/for-zenotians/day',
  '/for-zenotians/project',
  '/for-zenotians/air',
  '/for-zenotians/ai-intelligence',
  '/for-zenotians/mapping',
  '/for-zenotians/quality',
  '/for-zenotians/security',
  '/for-zenotians/limitations',
  '/for-zenotians/contact',
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
    '/customer/profile',
  ],
  receptionist: [
    '/dashboard',
    '/appointments',
    '/customers',
    '/pos',
    '/inventory',
    '/air-activity',
  ],
  stylist: ['/my-day', '/requests', '/my-appointments', '/my-schedule'],
  admin: [
    '/dashboard',
    '/audit-log',
    '/ratings',
    '/reports',
    '/payroll',
    '/staff',
    '/air-activity',
    '/recommendations',
    '/marketing',
  ],
};
