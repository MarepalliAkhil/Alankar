import type { Who } from './helpers';

/** Public pages anyone can open. */
export const PUBLIC_PAGES = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/zenotians',
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
  stylist: ['/my-day'],
  admin: ['/dashboard', '/audit-log', '/ratings', '/reports', '/payroll', '/staff'],
};
