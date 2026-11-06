import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '../../api/auth';
import { menuFor, profilePathFor, ROLES, type Role } from '../../policy/policy';
import { SessionContext, type SessionValue } from '../../session/session-context';
import { customerTour } from '../tour/tours';
import { Sidebar } from './Sidebar';

function userFor(role: Role): SessionUser {
  return {
    id: 'u1',
    email: `${role}@example.com`,
    full_name: 'Test Person',
    role,
    home: '/x',
  } as SessionUser;
}

function renderOnly(role: Role) {
  const value = {
    status: 'authenticated',
    user: userFor(role),
    signOut: vi.fn(),
  } as unknown as SessionValue;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={value}>
        <MemoryRouter>
          <Sidebar role={role} collapsed={false} placement="side" onToggle={() => {}} />
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

function show(role: Role, collapsed = false, signOut = vi.fn().mockResolvedValue(undefined)) {
  const value = {
    status: 'authenticated',
    user: userFor(role),
    signOut,
  } as unknown as SessionValue;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={value}>
        <MemoryRouter>
          <Sidebar role={role} collapsed={collapsed} placement="side" onToggle={() => {}} />
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return signOut;
}

describe('the sidebar (one navigation for every role)', () => {
  for (const role of ROLES) {
    it(`shows the ${role} exactly their own menu items under headings`, () => {
      show(role);
      const nav = screen.getByRole('navigation', { name: 'Main menu' });
      const expected = menuFor(role)
        .filter((item) => item.path !== profilePathFor(role))
        .map((item) => item.label);
      const policyPaths = new Set(menuFor(role).map((item) => item.path));
      const links = within(nav).getAllByRole('link');
      const menuLinks = links.filter(
        (link) =>
          policyPaths.has(link.getAttribute('href') ?? '') &&
          link.getAttribute('href') !== profilePathFor(role),
      );
      // Profile is the first row of the Account group, for every role.
      expect(within(nav).getByRole('link', { name: 'Profile' })).toHaveAttribute(
        'href',
        profilePathFor(role),
      );
      expect(menuLinks.map((link) => link.textContent).sort()).toEqual([...expected].sort());
      // Every link goes to a page of this role (the Account rows jump inside the profile page).
      for (const link of links) {
        const href = (link.getAttribute('href') ?? '').split('#')[0];
        expect([...policyPaths, '/', profilePathFor(role)]).toContain(href);
      }
      expect(within(nav).getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(2);
    });
  }

  it('never shows a menu item from another role', () => {
    show('stylist');
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    for (const label of ['Payroll', 'POS / Billing', 'Cash Close', 'Staff', 'Book']) {
      expect(within(nav).queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
  });

  it('keeps everything from the old profile dropdown, under Account, without duplicates', () => {
    show('customer');
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    for (const label of ['Profile', 'Trusted devices', 'Privacy & data']) {
      expect(within(nav).getAllByRole('link', { name: label })).toHaveLength(1);
    }
    expect(within(nav).getAllByRole('button', { name: /^Search/ })).toHaveLength(1);
    expect(within(nav).getByRole('radiogroup', { name: 'Appearance' })).toBeInTheDocument();
    for (const mode of ['Device setting', 'Light', 'Dark']) {
      expect(within(nav).getByRole('radio', { name: mode })).toBeInTheDocument();
    }
  });

  it('puts the groups in the agreed order: Search, role pages, Account, Help and display', () => {
    show('customer');
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    const headings = within(nav)
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(headings.slice(-2)).toEqual(['Account', 'Help and display']);
    const search = within(nav).getByRole('button', { name: /^Search/ });
    const firstLink = within(nav).getAllByRole('link')[0];
    // Search comes before the first page link.
    expect(
      search.compareDocumentPosition(firstLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('has no notifications row in the menu (the bell floats outside it)', () => {
    for (const role of ROLES) {
      const { unmount } = renderOnly(role);
      expect(screen.queryByRole('button', { name: /^Notifications/ })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('offers Take the tour to customers only', () => {
    show('stylist');
    expect(screen.queryByRole('button', { name: 'Take the tour' })).not.toBeInTheDocument();
  });

  it('opens a profile menu with exactly Profile and Log out, and Escape closes it', async () => {
    const user = userEvent.setup();
    const signOut = show('receptionist');
    await user.click(screen.getByRole('button', { name: /Account menu/ }));
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Profile', 'Log out']);
    expect(items[0]).toHaveAttribute('href', '/profile');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Account menu/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(signOut).toHaveBeenCalled();
  });

  it('collapsed: icons only, but every item keeps its name for screen readers', () => {
    show('stylist', true);
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    expect(within(nav).getByRole('link', { name: 'My Day' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Requests' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand menu' })).toBeInTheDocument();
  });

  it('has a real control for every spotlight target of the customer tour', () => {
    show('customer');
    const targets = new Set(customerTour.steps.flatMap((step) => step.targets));
    targets.delete('menu-button'); // the phone menu button lives in the app shell
    for (const target of targets) {
      expect(document.querySelector(`[data-tour="${target}"]`), target).toBeTruthy();
    }
  });
});
