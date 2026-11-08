import type { Role } from '../policy/policy';

/**
 * Where the logo (the home button in the navbar and the sidebar) takes people. Change it here.
 * Visitors and customers go to the public home; staff go to their own dashboard (`home` in the
 * shared policy).
 */
export const LOGO_HOME = {
  visitor: '/',
  customer: '/',
  staff: 'dashboard',
} as const;

export function logoHomeFor(user: { role: Role; home: string } | null | undefined): string {
  if (!user) return LOGO_HOME.visitor;
  if (user.role === 'customer') return LOGO_HOME.customer;
  return LOGO_HOME.staff === 'dashboard' ? user.home : LOGO_HOME.staff;
}
