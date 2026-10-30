import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as zenApi from '../api/zenotians';
import { getSession } from '../api/auth';
import * as publicApi from '../api/public';
import { buildMenu, yearsSince } from './zenotians/model';
import { site } from '../test/fixtures';
import { fullContent } from '../test/zenotians-fixture';
import { renderAt } from '../test/render';

vi.mock('../api/auth', () => ({
  ensureCsrf: vi.fn().mockResolvedValue(undefined),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  needsOtp: () => false,
  needsTwoFactor: () => false,
}));
vi.mock('../api/zenotians', () => ({ getZenotians: vi.fn() }));
vi.mock('../api/public', () => ({
  getSite: vi.fn(),
  getCategories: vi.fn(),
  getServices: vi.fn(),
  getTeam: vi.fn(),
  getPolicyPage: vi.fn(),
}));

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue(null);
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getCategories).mockResolvedValue([]);
  vi.mocked(publicApi.getServices).mockResolvedValue([]);
  vi.mocked(publicApi.getTeam).mockResolvedValue([]);
  vi.mocked(zenApi.getZenotians).mockResolvedValue(clone(fullContent));
});

const ROUTES = [
  '/zenotians',
  '/zenotians/about/summary',
  '/zenotians/about/education',
  '/zenotians/about/projects',
  '/zenotians/about/experience',
  '/zenotians/about/skills',
  '/zenotians/about/certifications',
  '/zenotians/about-zenoti',
  '/zenotians/project',
  '/zenotians/mapping',
  '/zenotians/decisions',
  '/zenotians/vision',
] as const;

describe('For Zenotians: structure', () => {
  it.each(ROUTES)('renders %s with a heading and some content', async (path) => {
    renderAt(path);
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent?.trim().length).toBeGreaterThan(0);
    const main = document.getElementById('zen-content')!;
    expect(main.textContent!.trim().length).toBeGreaterThan(40);
  });

  it('keeps the About me sub-menu in the resume order', () => {
    const about = buildMenu(fullContent).find((e) => e.id === 'about');
    expect(about?.children?.map((c) => c.label)).toEqual([
      'Summary',
      'Education',
      'Projects',
      'Experience',
      'Skills',
      'Certifications',
    ]);
    expect(about?.children?.map((c) => c.path)).toEqual([
      '/zenotians/about/summary',
      '/zenotians/about/education',
      '/zenotians/about/projects',
      '/zenotians/about/experience',
      '/zenotians/about/skills',
      '/zenotians/about/certifications',
    ]);
  });

  it('lists the menu in the specified order and hides sections with no content', () => {
    expect(buildMenu(fullContent).map((e) => e.label)).toEqual([
      'Overview',
      'About me',
      'About Zenoti',
      'The project',
      'How it maps to Zenoti',
      'Engineering decisions',
      'Future vision (AI assistants)',
      'Contact',
    ]);
  });

  it('shows Achievements and Try the demo only when they have content', () => {
    const filled = clone(fullContent);
    filled.resume!.achievements = [{ title: 'Won something', detail: '' }];
    filled.demo = {
      logins: [{ role: 'admin', email: 'owner@demo.example.com', password: 'x' }],
      guide: ['Book as the customer.'],
    };
    const menu = buildMenu(filled);
    expect(menu.map((e) => e.id)).toContain('demo');
    expect(menu.find((e) => e.id === 'about')?.children?.at(-1)?.label).toBe('Achievements');
  });

  it('removes every empty section from the menu', () => {
    const bare = clone(fullContent);
    bare.zenoti = {};
    bare.project = {};
    bare.mapping = [];
    bare.decisions = [];
    bare.vision = {};
    bare.resume = { contacts: [] };
    expect(buildMenu(bare).map((e) => e.id)).toEqual(['overview']);
  });

  it('shows the sidebar menu and the footer line', async () => {
    renderAt('/zenotians');
    const nav = await screen.findByRole('navigation', { name: 'For Zenotians sections' });
    expect(within(nav).getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Try the demo' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Independent portfolio project, not affiliated with Zenoti'),
    ).toBeInTheDocument();
  });

  it('expands About me in the sidebar and highlights the active item', async () => {
    const user = userEvent.setup();
    renderAt('/zenotians/about/skills');
    const nav = await screen.findByRole('navigation', { name: 'For Zenotians sections' });
    const toggle = within(nav).getByRole('button', { name: 'About me' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(nav).getByRole('link', { name: 'Skills' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(nav).queryByRole('link', { name: 'Skills' })).not.toBeInTheDocument();
  });

  it('sends a visitor from a hidden section to the overview', async () => {
    renderAt('/zenotians/demo');
    expect(
      await screen.findByRole('heading', { level: 1, name: /Built for Zenotians/ }),
    ).toBeInTheDocument();
    renderAt('/zenotians/about/achievements');
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 1, name: /Built for Zenotians/ }).length).toBe(
        2,
      ),
    );
  });

  it('shows a not-published state when nothing has content', async () => {
    vi.mocked(zenApi.getZenotians).mockResolvedValue({});
    renderAt('/zenotians');
    expect(await screen.findByText('This page is not published')).toBeInTheDocument();
  });
});

describe('For Zenotians: content rules', () => {
  it('never shows the phone number while its switch is off', async () => {
    renderAt('/zenotians/about/summary');
    await screen.findByText('AKHIL MAREPALLI');
    expect(document.body.textContent).not.toContain('9000000000');
    expect(screen.getByRole('link', { name: /Email/ })).toHaveAttribute(
      'href',
      'mailto:akhil@example.com',
    );
  });

  it('shows the phone number only when it is switched on', async () => {
    const on = clone(fullContent);
    on.resume!.contacts!.find((c) => c.key === 'phone')!.public = true;
    vi.mocked(zenApi.getZenotians).mockResolvedValue(on);
    renderAt('/zenotians/contact');
    expect(await screen.findByText('+91-9000000000')).toBeInTheDocument();
  });

  it('opens every outside link with rel noopener', async () => {
    renderAt('/zenotians/about-zenoti');
    await screen.findByRole('heading', { level: 1, name: 'About Zenoti' });
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]'));
    expect(links.length).toBeGreaterThan(3);
    for (const link of links) expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('opens project and certificate links with rel noopener too', async () => {
    renderAt('/zenotians/about/projects');
    await screen.findByText('W.A.N.D.');
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]'))
      expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('gives each Zenoti fact a source link and the last-checked date', async () => {
    renderAt('/zenotians/about-zenoti');
    await screen.findByRole('heading', { level: 1, name: 'About Zenoti' });
    expect(screen.getAllByText(/last checked: 2026-10-30/).length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText(/Their page is undated/)).toBeInTheDocument();
    expect(screen.getByText(/years in business/)).toBeInTheDocument();
  });

  it('hides the overview buttons until their links are set', async () => {
    renderAt('/zenotians');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Watch demo')).not.toBeInTheDocument();
    expect(screen.queryByText('View code on GitHub')).not.toBeInTheDocument();
    expect(screen.queryByText('Download resume')).not.toBeInTheDocument();
  });

  it('shows an overview button once its link is set', async () => {
    const set = clone(fullContent);
    set.overview!.github_url = 'https://github.com/x/repo';
    vi.mocked(zenApi.getZenotians).mockResolvedValue(set);
    renderAt('/zenotians');
    expect(await screen.findByText('View code on GitHub')).toBeInTheDocument();
  });

  it('computes years in business from the founding year', () => {
    expect(yearsSince(2010, new Date('2026-10-30'))).toBe(16);
    expect(yearsSince(2010, new Date('2031-01-01'))).toBe(21);
  });

  it('states that this section is a concept and that no AI is used today', async () => {
    renderAt('/zenotians/vision');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Future vision, not built' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Alankar today uses no AI/)).toBeInTheDocument();
  });

  it('shows the demo section with the simulation note when logins are filled in', async () => {
    const demo = clone(fullContent);
    demo.demo = {
      logins: [{ role: 'admin', email: 'o@demo.example.com', password: 'pw' }],
      guide: ['Step.'],
    };
    vi.mocked(zenApi.getZenotians).mockResolvedValue(demo);
    renderAt('/zenotians/demo');
    expect(await screen.findByText('o@demo.example.com')).toBeInTheDocument();
    expect(screen.getByText(/Payments and messages are simulated/)).toBeInTheDocument();
  });
});
