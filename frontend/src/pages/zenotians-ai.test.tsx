import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession } from '../api/auth';
import * as publicApi from '../api/public';
import * as zenApi from '../api/zenotians';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AI_ROWS,
  AIR_ROWS,
  AIR_TESTS,
  accuracyText,
  assignAiPictures,
} from './zenotians/ai-content';
import { planReveal } from './zenotians/reveal';
import stats from '../generated/repo-stats.json';
import { site } from '../test/fixtures';
import { renderAt } from '../test/render';
import { fullContent } from '../test/zenotians-fixture';

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

class FakeObserver {
  static all: FakeObserver[] = [];
  targets: Element[] = [];
  constructor(public callback: IntersectionObserverCallback) {
    FakeObserver.all.push(this);
  }
  observe(el: Element) {
    this.targets.push(el);
  }
  unobserve() {}
  disconnect() {
    this.targets = [];
  }
  takeRecords() {
    return [];
  }
}
function inView(el: Element) {
  for (const observer of FakeObserver.all.filter((o) => o.targets.includes(el))) {
    act(() =>
      observer.callback(
        [{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      ),
    );
  }
}
function motion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  }));
}

let scrolled: string[] = [];
beforeEach(() => {
  FakeObserver.all = [];
  scrolled = [];
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this.id);
  } as typeof Element.prototype.scrollIntoView;
  vi.mocked(getSession).mockResolvedValue(null);
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getCategories).mockResolvedValue([]);
  vi.mocked(publicApi.getServices).mockResolvedValue([]);
  vi.mocked(publicApi.getTeam).mockResolvedValue([]);
  vi.mocked(zenApi.getZenotians).mockResolvedValue(JSON.parse(JSON.stringify(fullContent)));
});
afterEach(() => vi.unstubAllGlobals());

const css = readFileSync(join(process.cwd(), 'src/pages/zenotians/zenotians-type.css'), 'utf8');
const NAV = { name: 'For Zenotians sections' };
async function open(path = '/for-zenotians') {
  renderAt(path);
  await screen.findByRole('heading', { level: 1, name: /Built for Zenotians/ });
  return screen.findByRole('navigation', NAV);
}

describe('For Zenotians: AIR and AI Alankar Intelligence', () => {
  it('lists the two entries directly below "The project", each with an icon', async () => {
    const nav = await open();
    const labels = within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent);
    const at = labels.indexOf('The project');
    expect(labels.slice(at, at + 3)).toEqual([
      'The project',
      'AIR, the AI receptionist',
      'AI Alankar Intelligence',
    ]);
    for (const name of ['AIR, the AI receptionist', 'AI Alankar Intelligence']) {
      expect(within(nav).getByRole('link', { name }).querySelector('svg')).not.toBeNull();
    }
  });

  it('scrolls to each section from the menu and highlights the entry while scrolling', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    motion(false);
    const user = userEvent.setup();
    const nav = await open();
    await user.click(within(nav).getByRole('link', { name: 'AIR, the AI receptionist' }));
    expect(scrolled.at(-1)).toBe('zen-sec-air');
    await waitFor(() => expect(document.getElementById('zen-sec-ai-intelligence')).not.toBeNull());
    inView(document.getElementById('zen-sec-ai-intelligence')!);
    expect(within(nav).getByRole('link', { name: 'AI Alankar Intelligence' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(window.location.pathname).toBe('/for-zenotians/ai-intelligence');
  });

  it('gives every row an H3, a passage and (when the file exists) a picture with alt text', async () => {
    await open('/for-zenotians/air');
    const air = await waitFor(() => {
      const found = document.getElementById('zen-sec-air');
      expect(found?.querySelectorAll('.zen-row').length).toBe(AIR_ROWS.length);
      return found!;
    });
    expect(
      within(air).getByRole('heading', { level: 2, name: 'AIR, the AI receptionist' }),
    ).toBeTruthy();
    for (const row of air.querySelectorAll('.zen-row')) {
      expect(row.querySelector('h3')?.textContent?.length).toBeGreaterThan(3);
      const text = row.querySelector('p.zen-row__text')?.textContent ?? '';
      expect(text.split(/[.!?](\s|$)/).filter((s) => s.trim().length > 2).length).toBeGreaterThan(
        1,
      );
      const img = row.querySelector('img');
      if (img) expect(img.getAttribute('alt')?.length).toBeGreaterThan(10);
    }
    // The AIR poses are in public/photos/air: the first row shows air-11-on-call.
    const first = air.querySelector('.zen-row img');
    expect(first?.getAttribute('src')).toMatch(/air-11-on-call/);
    expect(first?.getAttribute('loading')).toBe('lazy');
    expect(first?.getAttribute('width')).toBe('1024');
  });

  it('keeps a row whole when its picture file is missing or broken', async () => {
    await open('/for-zenotians/ai-intelligence');
    const ai = await waitFor(() => {
      const found = document.getElementById('zen-sec-ai-intelligence');
      expect(found?.querySelectorAll('.zen-row').length).toBe(6);
      return found!;
    });
    for (const row of ai.querySelectorAll('.zen-row')) {
      expect(row.querySelector('h3')).not.toBeNull();
      expect(row.querySelector('p.zen-row__text')?.textContent?.length).toBeGreaterThan(40);
    }
    expect(ai.textContent).toContain('planned future work and is not built');
    // A broken AIR picture disappears and its row stays.
    const air = document.getElementById('zen-sec-air')!;
    const img = await waitFor(() => {
      const found = air.querySelector('img');
      expect(found).not.toBeNull();
      return found!;
    });
    act(() => {
      img.dispatchEvent(new Event('error'));
    });
    await waitFor(() =>
      expect(air.querySelectorAll('.zen-row')[0]!.querySelector('img')).toBeNull(),
    );
    expect(air.querySelectorAll('.zen-row')[0]!.querySelector('h3')).not.toBeNull();
  });

  it('quotes only measured numbers: the AIR test count and the accuracy figures', async () => {
    expect(AIR_TESTS).toBe(stats.airTests);
    expect(AIR_TESTS).toBeGreaterThan(100);
    await open('/for-zenotians/air');
    const air = document.getElementById('zen-sec-air')!;
    await waitFor(() => expect(air.textContent).toContain(`AIR has ${AIR_TESTS} automated tests`));
    expect(within(air).getByRole('link', { name: /Zenoti: AI Receptionist/ })).toHaveAttribute(
      'href',
      'https://www.zenoti.com/platform/ai-receptionist',
    );
    const ai = document.getElementById('zen-sec-ai-intelligence')!;
    for (const m of fullContent.quality!.accuracy!) {
      expect(ai.textContent).toContain(`${m.hits} of ${m.total}`);
    }
    expect(ai.textContent).toContain('language-model mode has not been measured');
    expect(accuracyText([])).toMatch(/^Not measured yet/);
    expect(accuracyText([{ name: 'Tuning', hits: 130, total: 143 }])).toContain(
      'Tuning: 130 of 143 (90.9%)',
    );
  });

  it('is about the customer assistant AI only: six AI rows, no AIR or front-desk content', async () => {
    await open('/for-zenotians/ai-intelligence');
    const ai = await waitFor(() => {
      const found = document.getElementById('zen-sec-ai-intelligence');
      expect(found?.querySelectorAll('.zen-row').length).toBe(6);
      return found!;
    });
    expect([...ai.querySelectorAll('.zen-row h3')].map((h) => h.textContent)).toEqual([
      'Understanding natural language',
      'Finding the intent',
      'Answering from knowledge',
      'Measured, not guessed',
      'Optional language model, safely',
      'Privacy by design',
    ]);
    const text = ai.textContent ?? '';
    for (const banned of [
      /\bAIR\b/,
      /receptionist/i,
      /front desk/i,
      /booking desk/i,
      /\bdesk\b/i,
    ]) {
      expect(text).not.toMatch(banned);
    }
    for (const word of [
      'typos',
      'Hinglish',
      'Telugu',
      'BM25',
      'consent',
      'schema',
      'prompt-injection',
      'number checker',
      'spending cap',
    ]) {
      expect(text).toContain(word);
    }
    expect(text).toContain('planned future work and is not built');
    for (const row of ai.querySelectorAll('.zen-row')) {
      expect(row.querySelector('h3')).not.toBeNull();
      expect(row.querySelector('p.zen-row__text')?.textContent?.length).toBeGreaterThan(80);
      const img = row.querySelector('img');
      if (img) expect(img.getAttribute('alt')?.length).toBeGreaterThan(10);
    }
  });

  it('spreads the available AI pictures over all rows and never invents a file', () => {
    const rows = [...AI_ROWS];
    expect(assignAiPictures(rows, [])).toEqual(rows);
    const two = assignAiPictures(rows, [
      'ai-intelligence/ai-01-language.webp',
      'ai-intelligence/ai-01-language-512.webp',
      'ai-intelligence/chat-shot.png',
      'air/air-01-welcome.webp',
    ]);
    expect(two[0]!.image.slot).toBe('ai-01-language');
    const slots = two.map((r) => r.image.slot);
    expect(slots.every((s) => s === 'ai-01-language' || s === 'chat-shot')).toBe(true);
    expect(two[1]!.image.slot).toBe('chat-shot');
    expect(two[1]!.image.alt).toMatch(/chat shot/);
    // A borrowed file keeps the alt text written for it.
    const borrowed = assignAiPictures(rows, ['ai-intelligence/ai-06-privacy.webp']);
    expect(borrowed[0]!.image.slot).toBe('ai-06-privacy');
    expect(borrowed[0]!.image.alt).toBe(rows[rows.length - 1]!.image.alt);
  });

  it('lays the rows out in two columns from 768 px and stacked on phones', () => {
    expect(css).toMatch(/\.zen-type \.zen-row \{[^}]*grid-template-areas: 'title' 'image' 'text';/);
    expect(css).toMatch(
      /@media \(min-width: 768px\) \{\s*\.zen-type \.zen-row \{[^}]*grid-template-areas: 'title image' 'text image';/,
    );
    expect(css).toMatch(
      /\.zen-row__image\[data-kind='screenshot'\] img \{[^}]*aspect-ratio: 4 \/ 3;/,
    );
    expect(css).toMatch(/\.zen-row__image img \{[^}]*aspect-ratio: 1 \/ 1;/);
  });

  it('slides each row in as it enters, and simply shows it with reduced motion', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    motion(false);
    await open('/for-zenotians/air');
    const list = await waitFor(() => {
      const found = document.querySelector('#zen-sec-air .zen-rows');
      expect(found?.getAttribute('data-row-motion')).toBe('on');
      return found!;
    });
    const row = list.querySelector('.zen-row')!;
    expect(row.hasAttribute('data-shown')).toBe(false);
    inView(row);
    expect(row.hasAttribute('data-shown')).toBe(true);
    expect(css).toMatch(/translateX\(-24px\)/);
    expect(css).toMatch(/translateX\(24px\)/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.zen-type \.zen-rows\[data-row-motion\]/,
    );
  });

  it('turns the row motion off with reduced motion', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    motion(true);
    await open('/for-zenotians/air');
    await waitFor(() => expect(document.querySelector('#zen-sec-air .zen-rows')).not.toBeNull());
    expect(document.querySelector('#zen-sec-air .zen-rows')?.hasAttribute('data-row-motion')).toBe(
      false,
    );
  });

  it('mentions AIR first in the overview, with a Meet AIR button that jumps to it', async () => {
    const user = userEvent.setup();
    await open();
    const overview = document.getElementById('zen-sec-overview')!;
    expect(within(overview).getByText(/Standout feature: AIR/)).toBeTruthy();
    await user.click(within(overview).getByRole('link', { name: 'Meet AIR' }));
    expect(scrolled.at(-1)).toBe('zen-sec-air');
  });
});

describe('For Zenotians: layout fixes', () => {
  it('has exactly one H1, and the entrance plan always reveals the headline', async () => {
    await open();
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    const stage = document.querySelector('[data-zen-page]') as HTMLElement;
    const plan = planReveal(stage, true).map((p) => p.el);
    expect(plan).toContain(document.querySelector('h1'));
  });

  it('wraps the numbers into 180 px columns and never breaks a label inside a word', async () => {
    await open();
    const grid = document.querySelector('.zen-numbers') as HTMLElement;
    expect(grid.className).toContain('grid-cols-[repeat(auto-fit,minmax(180px,1fr))]');
    for (const label of grid.querySelectorAll('.zen-number-label')) {
      expect(label.className).not.toMatch(/break-all|break-words/);
    }
    expect(css).toMatch(
      /\.zen-type \.zen-number-label \{\s*overflow-wrap: normal;\s*word-break: normal;/,
    );
    expect(css).not.toMatch(/break-all/);
  });

  it('puts section headings on one larger, bold scale with a small gap to their content', () => {
    expect(css).toMatch(/\.zen-type h2\.text-3xl \{[^}]*font-weight: 700;/);
    expect(css).toMatch(
      /\.zen-type h3\.text-xl \{[^}]*font-weight: 700;[^}]*margin-bottom: 0\.875rem;/,
    );
  });
});
