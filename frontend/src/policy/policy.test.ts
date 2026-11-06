import { describe, expect, it } from 'vitest';
import {
  ROLES,
  canAccess,
  matchesRoute,
  canCall,
  homeFor,
  menuFor,
  menuGroupsFor,
  profilePathFor,
  policy,
  rolePaths,
  rolesForPath,
} from './policy';

describe('role policy (shared with the backend)', () => {
  it('has a home inside every role menu', () => {
    for (const role of ROLES) {
      expect(menuFor(role).map((item) => item.path)).toContain(homeFor(role));
    }
  });

  it('allows only listed routes (deny by default)', () => {
    expect(canAccess('customer', '/customer-dashboard')).toBe(true);
    expect(canAccess('customer', '/dashboard')).toBe(false);
    expect(canAccess('customer', '/staff')).toBe(false);
    expect(canAccess('admin', '/staff')).toBe(true);
    expect(canAccess('admin', '/cash-close')).toBe(false);
    expect(canAccess('receptionist', '/schedule')).toBe(true);
    expect(canAccess('receptionist', '/cash-close')).toBe(true);
    expect(canAccess('customer', '/cash-close')).toBe(false);
    expect(canAccess('receptionist', '/staff')).toBe(false);
    expect(canAccess('receptionist', '/chat')).toBe(false);
    expect(canAccess('stylist', '/my-day')).toBe(true);
    expect(canAccess('stylist', '/dashboard')).toBe(false);
    expect(canAccess('admin', '/chat')).toBe(false);
    expect(canAccess(null, '/dashboard')).toBe(false);
    expect(canAccess(undefined, '/made-up')).toBe(false);
  });

  it('treats public routes as open to everyone, ignoring query strings', () => {
    for (const role of [...ROLES, null]) {
      expect(canAccess(role, '/login?role=admin')).toBe(true);
      expect(canAccess(role, '/')).toBe(true);
    }
  });

  it('mirrors API permissions', () => {
    expect(canCall('admin', 'staff.invites.create')).toBe(true);
    expect(canCall('receptionist', 'staff.invites.create')).toBe(false);
    expect(canCall(null, 'auth.login')).toBe(true);
    expect(canCall(null, 'auth.me')).toBe(false);
  });

  it('only customers and stylists have a chat menu; admins and receptionists never do', () => {
    expect(rolesForPath('/chat')).toEqual(['stylist']);
    expect(rolesForPath('/chat/abc')).toEqual(['stylist']);
    expect(rolesForPath('/customer/chat/abc')).toEqual(['customer']);
    expect(rolesForPath('/customer/chat')).toEqual(['customer']);
  });

  it('lists every signed-in path once, for the one shared layout', () => {
    const { all } = rolePaths();
    expect(all).toEqual(expect.arrayContaining(['/customer-dashboard', '/dashboard', '/my-day']));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain('/profile');
  });

  it('files every menu item under a heading, and Profile has its own button', () => {
    for (const role of ROLES) {
      for (const item of menuFor(role)) expect(item.group.length).toBeGreaterThan(0);
      const shown = menuGroupsFor(role).flatMap((group) => group.items.map((item) => item.path));
      expect(shown).not.toContain(profilePathFor(role));
      const hidden = menuFor(role).filter((item) => !shown.includes(item.path));
      expect(hidden.every((item) => item.path === profilePathFor(role))).toBe(true);
    }
  });

  it('gives every planned item a description and the task it arrives in', () => {
    for (const role of ROLES) {
      for (const item of policy.roles[role].menu) {
        expect(item.description.length).toBeGreaterThan(10);
        expect(item.task).toMatch(/^Task \d+[a-z]?(-\d+)?$/);
      }
    }
  });

  it('matches parameter routes such as the payment page', () => {
    expect(matchesRoute('/customer/pay/:id', '/customer/pay/abc-123')).toBe(true);
    expect(matchesRoute('/customer/pay/:id', '/customer/pay/')).toBe(false);
    expect(matchesRoute('/customer/pay/:id', '/customer/pay/a/b')).toBe(false);
    expect(canAccess('customer', '/customer/pay/abc-123?link=tok')).toBe(true);
    expect(canAccess('receptionist', '/customer/pay/abc-123')).toBe(false);
    expect(canAccess(null, '/customer/pay/abc-123')).toBe(false);
  });
});
