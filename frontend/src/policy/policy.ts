/**
 * Role policy: the SAME file the backend enforces (shared/policy.json).
 * Menus, route guards and "what arrives when" all come from here. Anything not listed is denied.
 */
import raw from '../../../shared/policy.json';

export const ROLES = ['customer', 'receptionist', 'stylist', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export interface MenuItem {
  id: string;
  label: string;
  path: string;
  description: string;
  task: string;
  status: 'available' | 'planned';
}

interface RolePolicy {
  label: string;
  home: string;
  api: string[];
  routes: string[];
  menu: MenuItem[];
}

interface PolicyFile {
  version: number;
  actions: Record<string, string>;
  public: { api: string[]; routes: string[] };
  roles: Record<Role, RolePolicy>;
}

export const policy = raw as unknown as PolicyFile;

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

const cleanPath = (path: string) => path.split(/[?#]/)[0] || '/';

export const roleLabel = (role: Role) => policy.roles[role].label;
export const homeFor = (role: Role) => policy.roles[role].home;
export const menuFor = (role: Role): MenuItem[] => policy.roles[role].menu;

export function routesFor(role: Role): string[] {
  const spec = policy.roles[role];
  return [...spec.menu.map((item) => item.path), ...spec.routes];
}

export function isPublicRoute(path: string): boolean {
  return policy.public.routes.includes(cleanPath(path));
}

/** Deny by default: a role may open a path only if the policy lists it (or it is public). */
export function canAccess(role: Role | null | undefined, path: string): boolean {
  if (isPublicRoute(path)) return true;
  if (!role) return false;
  return routesFor(role).includes(cleanPath(path));
}

export function canCall(role: Role | null | undefined, action: string): boolean {
  if (policy.public.api.includes(action)) return true;
  return !!role && policy.roles[role].api.includes(action);
}

export function menuItemFor(role: Role, path: string): MenuItem | undefined {
  return menuFor(role).find((item) => item.path === cleanPath(path));
}

export function rolesForPath(path: string): Role[] {
  return ROLES.filter((role) => routesFor(role).includes(cleanPath(path)));
}

/** All role paths grouped by layout: customer pages live inside the public site. */
export function rolePaths(): { customer: string[]; staff: string[] } {
  const customer = routesFor('customer');
  const staff = new Set<string>();
  for (const role of ROLES) {
    if (role === 'customer') continue;
    routesFor(role).forEach((path) => staff.add(path));
  }
  return { customer, staff: [...staff] };
}
