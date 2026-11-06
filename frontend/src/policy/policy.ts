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
  /** Small heading the sidebar files this item under. */
  group: string;
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

/** True when `path` matches a policy route; `:name` segments match one non-empty segment. */
export function matchesRoute(pattern: string, path: string): boolean {
  const want = pattern.split('/');
  const got = cleanPath(path).split('/');
  if (want.length !== got.length) return false;
  return want.every((part, i) => (part.startsWith(':') ? got[i] !== '' : part === got[i]));
}

const listed = (routes: string[], path: string) =>
  routes.some((route) => matchesRoute(route, path));

export const roleLabel = (role: Role) => policy.roles[role].label;
export const homeFor = (role: Role) => policy.roles[role].home;
export const menuFor = (role: Role): MenuItem[] => policy.roles[role].menu;

/** Where the profile button in the sidebar leads. Customers' profile page is in their menu. */
export const profilePathFor = (role: Role) =>
  role === 'customer' ? '/customer/profile' : '/profile';

/** The full list of notifications (the bell's "See all notifications" link). */
export const notificationsPathFor = (role: Role) =>
  role === 'customer' ? '/customer/notifications' : '/notifications';

export interface MenuGroup {
  heading: string;
  items: MenuItem[];
}

/**
 * The sidebar menu: the policy menu split under its headings (in order of first appearance).
 * Profile is left out because it has its own button at the bottom of the sidebar.
 */
export function menuGroupsFor(role: Role): MenuGroup[] {
  const groups: MenuGroup[] = [];
  for (const item of menuFor(role)) {
    if (item.path === profilePathFor(role)) continue;
    let group = groups.find((entry) => entry.heading === item.group);
    if (!group) {
      group = { heading: item.group, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

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
  return listed(routesFor(role), path);
}

export function canCall(role: Role | null | undefined, action: string): boolean {
  if (policy.public.api.includes(action)) return true;
  return !!role && policy.roles[role].api.includes(action);
}

export function menuItemFor(role: Role, path: string): MenuItem | undefined {
  return menuFor(role).find((item) => item.path === cleanPath(path));
}

export function rolesForPath(path: string): Role[] {
  return ROLES.filter((role) => listed(routesFor(role), path));
}

/** Every signed-in path (all four roles share one layout), each listed once. */
export function rolePaths(): { all: string[] } {
  const all = new Set<string>();
  for (const role of ROLES) routesFor(role).forEach((path) => all.add(path));
  return { all: [...all] };
}
