import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession } from '../api/auth';
import * as publicApi from '../api/public';
import { site } from '../test/fixtures';
import { fullContent } from '../test/zenotians-fixture';
import { renderAt } from '../test/render';
import { unauthorized, userFor } from '../test/session';
import { SITE } from './head';
import { headFor } from './seo-data.js';

vi.mock('../api/auth', () => ({
  ensureCsrf: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  registerCustomer: vi.fn(),
  verifyOtp: vi.fn(),
  resendOtp: vi.fn(),
  needsOtp: () => false,
  needsTwoFactor: () => false,
  verifyTwoFactor: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
  checkInvite: vi.fn(() => new Promise(() => {})),
  acceptInvite: vi.fn(),
}));
vi.mock('../api/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/public')>()),
  getSite: vi.fn(),
  getCategories: vi.fn(),
  getServices: vi.fn(),
  getTeam: vi.fn(),
  getPolicyPage: vi.fn(),
}));
vi.mock('../api/zenotians', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/zenotians')>()),
  getZenotians: vi.fn(),
}));
vi.mock('../api/booking', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/booking')>()),
  listMyAppointments: vi.fn().mockResolvedValue([]),
}));

beforeEach(async () => {
  vi.mocked(getSession).mockRejectedValue(unauthorized);
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getCategories).mockResolvedValue([]);
  vi.mocked(publicApi.getServices).mockResolvedValue([]);
  vi.mocked(publicApi.getTeam).mockResolvedValue([]);
  vi.mocked(publicApi.getPolicyPage).mockResolvedValue({
    key: 'privacy',
    title: 'Privacy notice',
    body: 'We keep only what we need.',
  } as never);
  const zen = await import('../api/zenotians');
  vi.mocked(zen.getZenotians).mockResolvedValue(fullContent);
});

const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href');
const robots = () =>
  document.head.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';
const h1s = () => document.querySelectorAll('h1');

const PUBLIC = [
  '/',
  '/salon',
  '/spa',
  '/beauty-parlor',
  '/for-zenotians',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/unsubscribe',
  '/privacy',
  '/terms',
  '/cancellation-policy',
];

describe('every public page: title, canonical, robots and one H1', () => {
  it.each(PUBLIC)('%s', async (path) => {
    renderAt(path);
    const head = headFor(SITE, path)!;
    await waitFor(() => expect(document.title).toBe(head.title));
    expect(canonical()).toBe(head.canonical);
    expect(robots()).toBe(head.robots);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      head.description,
    );
    await waitFor(() => expect(h1s()).toHaveLength(1));
  });
});

describe('breadcrumbs', () => {
  it('shows a Breadcrumb navigation below the top level, with matching structured data', async () => {
    renderAt('/forgot-password');
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.textContent).toContain('Home');
    expect(nav.textContent).toContain('Login');
    await waitFor(() =>
      expect(
        document.head.querySelector('script[type="application/ld+json"]')?.textContent,
      ).toContain('BreadcrumbList'),
    );
  });

  it('has no breadcrumbs on a top-level page', async () => {
    renderAt('/login');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });
});

describe('noindex pages', () => {
  it('signed-in pages: "Page | Alankar", noindex, nofollow, no canonical', async () => {
    vi.mocked(getSession).mockResolvedValue(userFor('customer'));
    renderAt('/customer/appointments');
    await waitFor(() => expect(robots()).toBe('noindex, nofollow'));
    expect(document.title).toMatch(/^.+ \| Alankar$/);
    expect(canonical()).toBeUndefined();
    expect(document.head.querySelector('meta[property="og:title"]')).toBeNull();
  });

  it('the designed 404: title, noindex, one H1 and the way back', async () => {
    renderAt('/no-such-page');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
    expect(document.title).toBe('Page not found | Alankar');
    expect(robots()).toBe('noindex, nofollow');
    const nav = screen.getByRole('navigation', { name: 'Main pages' });
    for (const name of ['Home', 'Salon', 'Spa', 'Beauty Parlor', 'Book']) {
      expect(within(nav).getByRole('link', { name })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: /Search the site/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ask our assistant/ })).toBeTruthy();
  });
});

describe('old addresses', () => {
  it('sends /zenotians/... to the same place under /for-zenotians', async () => {
    renderAt('/zenotians/contact');
    await waitFor(() => expect(canonical()).toBe(`${SITE.siteUrl}/for-zenotians`));
  });

  it('/book sends a guest to the customer sign-in for booking', async () => {
    renderAt('/book');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
  });
});
