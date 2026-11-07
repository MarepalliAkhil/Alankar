import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as zenApi from '../api/zenotians';
import { getSession } from '../api/auth';
import * as publicApi from '../api/public';
import { buildMenu, groupMenu } from './zenotians/model';
import { ReducedMotionNote } from './zenotians/ReducedMotionNote';
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
afterEach(() => vi.unstubAllGlobals());

const NAV = { name: 'For Zenotians sections' };

describe('For Zenotians sidebar: groups', () => {
  it('has no heading for Overview and Contact, "About" and "The project" between them', () => {
    const groups = groupMenu(buildMenu(fullContent));
    expect(groups.map((g) => g.heading)).toEqual([null, 'About', 'The project', null]);
    expect(groups.map((g) => g.entries.map((e) => e.label))).toEqual([
      ['Overview'],
      ['About me', 'About Zenoti'],
      [
        'A day at Alankar',
        'The project',
        'How it maps to Zenoti',
        'Quality evidence',
        'Security and privacy',
        'Limitations',
      ],
      ['Contact'],
    ]);
  });

  it('keeps the menu order the same as before, whatever the grouping', () => {
    const flat = buildMenu(fullContent).map((e) => e.label);
    const grouped = groupMenu(buildMenu(fullContent)).flatMap((g) => g.entries.map((e) => e.label));
    expect(grouped).toEqual(flat);
  });

  it('hides a group when all of its sections are hidden', () => {
    const bare = clone(fullContent);
    bare.mapping = [];
    bare.project = {};
    bare.story = {};
    bare.quality = {};
    bare.security = {};
    bare.limitations = {};
    const groups = groupMenu(buildMenu(bare));
    expect(groups.map((g) => g.heading)).not.toContain('The project');
    expect(groups.map((g) => g.heading)).toContain('About');
    const noAbout = clone(bare);
    noAbout.zenoti = {};
    noAbout.resume = {
      ...noAbout.resume,
      summary: '',
      education: [],
      projects: [],
      experience: [],
    };
    noAbout.resume!.skills = [];
    noAbout.resume!.certifications = [];
    expect(groupMenu(buildMenu(noAbout)).map((g) => g.heading)).not.toContain('About');
  });
});

describe('For Zenotians sidebar: rows', () => {
  it('shows the headings in sentence case and a decorative icon on every top-level item', async () => {
    renderAt('/zenotians/day');
    const nav = await screen.findByRole('navigation', NAV);
    expect(within(nav).getByText('About')).toBeInTheDocument();
    expect(within(nav).getByText('The project', { selector: 'p' })).toBeInTheDocument();
    const rows = within(nav).getAllByRole('link').concat(within(nav).getAllByRole('button'));
    expect(rows.length).toBeGreaterThanOrEqual(9);
    for (const row of rows) {
      const icon = row.querySelector('svg');
      expect(icon, row.textContent ?? '').not.toBeNull();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(row.className).toContain('min-h-11');
      expect(row.className).toContain('rounded-[12px]');
      expect(row.className).toContain('tracking-normal');
      expect(row.className).toContain('font-medium');
      expect(row.className).not.toMatch(/tracking-(wide|wider|widest)|uppercase/);
      expect(row.querySelector('.break-words')).not.toBeNull(); // long labels wrap
    }
  });

  it('marks the active item with an accent fill and a bar, and weight 600', async () => {
    renderAt('/zenotians/project');
    const nav = await screen.findByRole('navigation', NAV);
    const active = within(nav).getByRole('link', { current: 'page' });
    expect(active).toHaveTextContent('The project');
    expect(active.className).toContain('bg-primary-soft');
    expect(active.className).toContain('before:bg-primary');
    expect(active.className).toContain('font-semibold');
    const idle = within(nav).getByRole('link', { name: 'Limitations' });
    expect(idle.className).not.toContain('before:bg-primary');
  });

  it('keeps keyboard focus visible and a hover state on every row', async () => {
    renderAt('/zenotians');
    const nav = await screen.findByRole('navigation', NAV);
    for (const row of within(nav).getAllByRole('link')) {
      expect(row.className).toContain('focus-visible:shadow-focus');
      expect(row.className).toContain('hover:bg-primary-soft');
    }
  });

  it('opens About me only while one of its sub-routes is active', async () => {
    const user = userEvent.setup();
    renderAt('/zenotians/day');
    const nav = await screen.findByRole('navigation', NAV);
    const toggle = within(nav).getByRole('button', { name: 'About me' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(nav).queryByRole('link', { name: 'Summary' })).not.toBeInTheDocument();
    await user.click(toggle);
    await waitFor(() =>
      expect(within(nav).getByRole('button', { name: 'About me' })).toHaveAttribute(
        'aria-expanded',
        'true',
      ),
    );
    expect(within(nav).getByRole('link', { name: 'Summary', current: 'page' })).toBeInTheDocument();
  });

  it('lists the sub-items in order with 15 px text, 38 px rows and a guide line', async () => {
    renderAt('/zenotians/about/education');
    const nav = await screen.findByRole('navigation', NAV);
    const list = nav.querySelector('#zen-about-menu') as HTMLElement;
    expect(list.className).toContain('border-l');
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'Summary',
      'Education',
      'Projects',
      'Experience',
      'Skills',
      'Certifications',
    ]);
    for (const link of links) {
      expect(link.className).toContain('text-[15px]');
      expect(link.className).toContain('min-h-[38px]');
    }
    expect(within(list).getByRole('link', { name: 'Education' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(list).getByRole('link', { name: 'Education' }).className).toContain(
      'bg-primary-soft',
    );
  });

  it('is sticky and scrolls inside itself with a limited height', async () => {
    renderAt('/zenotians');
    await screen.findByRole('navigation', NAV);
    const bar = document.querySelector('[data-zen-sidebar]') as HTMLElement;
    expect(bar.className).toContain('overflow-y-auto');
    expect(bar.className).toContain('overflow-x-hidden');
    expect(bar.className).toContain('lg:max-h-[calc(100dvh-6.5rem)]');
    expect(bar.className).toContain('zen-scroll');
    expect(bar.parentElement!.className).toContain('lg:sticky');
    const css = readFileSync(join(process.cwd(), 'src/pages/zenotians/zenotians-type.css'), 'utf8');
    expect(css).toMatch(/\.zen-scroll \{[^}]*scrollbar-width: thin/);
  });

  it('uses the same menu inside the phone drawer', async () => {
    const user = userEvent.setup();
    renderAt('/zenotians/about/skills');
    await screen.findByRole('navigation', NAV);
    await user.click(screen.getByRole('button', { name: /Sections/ }));
    const dialog = await screen.findByRole('dialog');
    const nav = within(dialog).getByRole('navigation', NAV);
    expect(within(nav).getByText('The project', { selector: 'p' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Skills', current: 'page' })).toBeInTheDocument();
    expect(dialog.querySelector('.zen-type')).not.toBeNull();
  });
});

describe('For Zenotians content: no Aviatrix', () => {
  it('shows exactly three certifications and no Aviatrix on the Certifications page', async () => {
    renderAt('/zenotians/about/certifications');
    await screen.findByRole('heading', { level: 1, name: 'Certifications' });
    const items = document.querySelectorAll('#zen-content ul.card-grid > li');
    expect(items).toHaveLength(3);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/aviatrix/i);
    expect(text).toContain('Cisco Networking Essentials');
    expect(text).toContain('Red Hat System Administration II (RH134)');
    expect(text).toContain('Cambridge Linguaskill General');
  });

  it('has no Aviatrix on the Summary page and keeps the Projects page unchanged', async () => {
    const summary = renderAt('/zenotians/about/summary');
    await screen.findByRole('heading', { level: 1, name: 'Summary' });
    expect(document.body.textContent).not.toMatch(/aviatrix/i);
    expect(document.body.textContent).toContain('Red Hat RH134, Cisco)');
    summary.unmount();
    renderAt('/zenotians/about/projects');
    await screen.findByRole('heading', { level: 1, name: 'Projects' });
    const items = document.querySelectorAll('#zen-content ul.card-grid > li');
    expect(items).toHaveLength(3);
    expect(document.body.textContent).toContain('W.A.N.D.');
  });

  it('does not appear anywhere in the page code, fixtures, or editor', () => {
    const dirs = ['src/pages/zenotians', 'src/test', 'src/api', 'src/components/admin/content'];
    const hits: string[] = [];
    for (const dir of dirs) {
      for (const file of readdirSync(join(process.cwd(), dir))) {
        if (!/\.(ts|tsx|css|json)$/.test(file) || file === 'zenotians-sidebar.test.tsx') continue;
        const text = readFileSync(join(process.cwd(), dir, file), 'utf8');
        if (/aviatrix/i.test(text)) hits.push(`${dir}/${file}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('the development note about reduced motion', () => {
  const reduce = (on: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: on && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));

  it('says why nothing animates, and can be dismissed', async () => {
    reduce(true);
    const user = userEvent.setup();
    render(<ReducedMotionNote />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(
      'Animations are off because your system has Reduce motion turned on',
    );
    await user.click(within(note).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('is not shown when the system does not ask for reduced motion', () => {
    reduce(false);
    render(<ReducedMotionNote />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('is development only: it checks import.meta.env.DEV', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/pages/zenotians/ReducedMotionNote.tsx'),
      'utf8',
    );
    expect(source).toContain('import.meta.env.DEV');
  });

  it('puts the state on the page root: reduced when the system asks for it', async () => {
    reduce(true);
    renderAt('/zenotians');
    await screen.findByRole('navigation', NAV);
    await act(async () => undefined);
    expect(document.querySelector('.zen-stage')).toHaveAttribute('data-reveal', 'reduced');
    expect(screen.getByRole('note')).toBeInTheDocument();
  });
});
