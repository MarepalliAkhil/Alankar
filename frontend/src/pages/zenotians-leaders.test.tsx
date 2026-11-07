import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as zenApi from '../api/zenotians';
import { getSession } from '../api/auth';
import * as publicApi from '../api/public';
import { site } from '../test/fixtures';
import { fullContent } from '../test/zenotians-fixture';
import { renderAt } from '../test/render';
import { initialsOf, leaderPhoto, slugOf } from './zenotians/leaders-model';

vi.mock('virtual:photo-manifest', () => ({
  default: ['zenoti-leaders/neal-singh.webp', 'zenoti-leaders/neal-singh.jpg', 'meera/meera.webp'],
}));

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

const NAMES = ['Sudheer Koneru', 'Neal Singh', 'Dheeraj Koneru', 'Anand Arvind', 'Sunil Koneru'];

beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue(null);
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getCategories).mockResolvedValue([]);
  vi.mocked(publicApi.getServices).mockResolvedValue([]);
  vi.mocked(publicApi.getTeam).mockResolvedValue([]);
  vi.mocked(zenApi.getZenotians).mockResolvedValue(JSON.parse(JSON.stringify(fullContent)));
});

describe('About Zenoti: five leaders', () => {
  it('shows exactly five cards in the right order, under the public-information label', async () => {
    renderAt('/zenotians/about-zenoti');
    const section = (await screen.findByRole('heading', { name: 'Leadership' })).closest(
      'section',
    )!;
    expect(
      within(section).getByText("Public information from Zenoti's website"),
    ).toBeInTheDocument();
    const cards = Array.from(section.querySelectorAll('article'));
    expect(cards.map((c) => c.querySelector('h3')!.textContent)).toEqual(NAMES);
    expect(cards[0]!.parentElement!.className).toContain('lg:col-span-2'); // the CEO spans the width
    expect(section.querySelector('ul')!.className).toMatch(/grid-cols-1[\s\S]*sm:grid-cols-2/);
  });

  it('gives every card 4 to 5 lines, a source link and the last-checked date', async () => {
    renderAt('/zenotians/about-zenoti');
    await screen.findByRole('heading', { name: 'Leadership' });
    for (const card of Array.from(document.querySelectorAll('article[data-leader]'))) {
      const lines = card.querySelectorAll('li');
      expect(lines.length).toBeGreaterThanOrEqual(4);
      expect(lines.length).toBeLessThanOrEqual(5);
      const links = Array.from(card.querySelectorAll('a'));
      expect(links.length).toBeGreaterThanOrEqual(1);
      for (const a of links) {
        expect(a.getAttribute('href')).toMatch(/^https:\/\/www\.zenoti\.com\//);
        expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      }
      expect(card.textContent).toContain('last checked: 2026-11-07');
    }
    expect(
      Array.from(document.querySelectorAll('article[data-leader="neal-singh"] a')).length,
    ).toBe(2);
  });

  it('shows a themed monogram without a photo and the photo when the file exists', async () => {
    renderAt('/zenotians/about-zenoti');
    await screen.findByRole('heading', { name: 'Leadership' });
    const sudheer = document.querySelector('article[data-leader="sudheer-koneru"]')!;
    const mono = sudheer.querySelector('[data-leader-avatar="monogram"]')!;
    expect(mono.textContent).toBe('SK');
    expect(mono).toHaveAttribute('aria-hidden', 'true');
    expect(sudheer.querySelector('img')).toBeNull();
    const neal = document.querySelector('article[data-leader="neal-singh"]')!;
    const img = neal.querySelector('img[data-leader-avatar="photo"]')!;
    expect(img).toHaveAttribute('src', '/photos/zenoti-leaders/neal-singh.webp');
    expect(img).toHaveAttribute('alt', '');
  });

  it('never shows the four removed names anywhere on the page', async () => {
    renderAt('/zenotians/about-zenoti');
    await screen.findByRole('heading', { name: 'Leadership' });
    for (const gone of ['Amita Tomkoria', 'Matt Baer', 'Anna Duke', 'Sachin Kamat']) {
      expect(document.body.textContent).not.toContain(gone);
    }
    expect(JSON.stringify(fullContent)).not.toMatch(/Amita|Matt Baer|Anna Duke|Sachin/);
  });
});

describe('leader helpers', () => {
  it('makes initials and slugs from names', () => {
    expect(initialsOf('Neal Singh')).toBe('NS');
    expect(initialsOf('Cher')).toBe('C');
    expect(initialsOf('')).toBe('?');
    expect(slugOf('Dheeraj Koneru')).toBe('dheeraj-koneru');
    expect(slugOf('Zoë  Ng')).toBe('zoe-ng');
  });

  it('finds a photo only inside the zenoti-leaders folder, preferring WebP', () => {
    const files = ['zenoti-leaders/anand-arvind.png', 'anand-arvind.jpg', 'zenoti-leaders/x.webp'];
    expect(leaderPhoto({ name: 'Anand Arvind', title: '' }, files)).toBe(
      '/photos/zenoti-leaders/anand-arvind.png',
    );
    expect(leaderPhoto({ name: 'Nobody', title: '' }, files)).toBeNull();
    expect(leaderPhoto({ name: 'Nobody', title: '', photo: 'x' }, files)).toBe(
      '/photos/zenoti-leaders/x.webp',
    );
  });
});
