import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession } from '../api/auth';
import * as publicApi from '../api/public';
import * as zenApi from '../api/zenotians';
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

/** A stand-in IntersectionObserver the test can drive ("this element is now on screen"). */
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

function scrollTo(selector: string) {
  const el = document.querySelector(selector)!;
  const observer = FakeObserver.all.find((o) => o.targets.includes(el));
  expect(observer, `nobody watches ${selector}`).toBeTruthy();
  act(() =>
    observer!.callback(
      [{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry],
      observer as unknown as IntersectionObserver,
    ),
  );
}

let scrolled: { id: string; behavior?: string }[] = [];
function reduceMotion(on: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: on && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  FakeObserver.all = [];
  scrolled = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  reduceMotion(false);
  Element.prototype.scrollIntoView = function (this: Element, options?: ScrollIntoViewOptions) {
    scrolled.push({ id: this.id, behavior: options?.behavior });
  } as typeof Element.prototype.scrollIntoView;
  vi.mocked(getSession).mockResolvedValue(null);
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getCategories).mockResolvedValue([]);
  vi.mocked(publicApi.getServices).mockResolvedValue([]);
  vi.mocked(publicApi.getTeam).mockResolvedValue([]);
  vi.mocked(zenApi.getZenotians).mockResolvedValue(JSON.parse(JSON.stringify(fullContent)));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const NAV = { name: 'For Zenotians sections' };
const page = async (path = '/for-zenotians') => {
  renderAt(path);
  await screen.findByRole('heading', { level: 1, name: /Built for Zenotians/ });
  return screen.findByRole('navigation', NAV);
};

describe('For Zenotians as one page', () => {
  it('stacks every section in menu order, one H1 for the page and H2 section titles', async () => {
    await page();
    const order = Array.from(document.querySelectorAll('[data-zen-section]')).map(
      (s) => (s as HTMLElement).dataset.zenSection,
    );
    expect(order).toEqual([
      'overview',
      'about',
      'about-zenoti',
      'day',
      'project',
      'air',
      'ai-intelligence',
      'mapping',
      'quality',
      'security',
      'limitations',
      'contact',
    ]);
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'About Zenoti' })).toBeTruthy(),
    );
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'About me' })).toBeTruthy();
  });

  it('highlights the section on screen while scrolling and keeps the URL with replaceState', async () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    const nav = await page();
    scrollTo('#zen-sec-mapping');
    expect(within(nav).getByRole('link', { name: 'How it maps to Zenoti' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(replace.mock.calls.at(-1)?.[2]).toBe('/for-zenotians/mapping');
    scrollTo('[data-zen-about="skills"]');
    expect(within(nav).getByRole('link', { name: 'Skills' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(replace.mock.calls.at(-1)?.[2]).toBe('/for-zenotians/about/skills');
    expect(push).not.toHaveBeenCalled();
  });

  it('scrolls smoothly to a section from the menu and moves focus to its heading', async () => {
    const user = userEvent.setup();
    const nav = await page();
    await screen.findByRole('heading', { level: 2, name: 'Limitations' });
    await user.click(within(nav).getByRole('link', { name: 'Limitations' }));
    expect(scrolled.at(-1)).toEqual({ id: 'zen-sec-limitations', behavior: 'smooth' });
    expect(document.activeElement?.textContent).toBe('Limitations');
    expect(within(nav).getByRole('link', { name: 'Limitations' })).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  it('moves with Next and Previous on the section bar, and the "Next:" link at the end of a section', async () => {
    const user = userEvent.setup();
    await page();
    const bar = document.querySelector('[data-zen-bar]') as HTMLElement;
    expect(within(bar).getByRole('button', { name: /Sections: Overview, 1 of 12/ })).toBeTruthy();
    await user.click(within(bar).getByRole('button', { name: 'Next: About me' }));
    expect(scrolled.at(-1)?.id).toBe('zen-sec-about');
    expect(within(bar).getByRole('button', { name: /2 of 12/ })).toBeTruthy();
    await user.click(within(bar).getByRole('button', { name: 'Previous: Overview' }));
    expect(scrolled.at(-1)?.id).toBe('zen-sec-overview');
    const overview = document.getElementById('zen-sec-overview')!;
    await user.click(within(overview).getByRole('link', { name: /Next: About me/ }));
    expect(scrolled.at(-1)?.id).toBe('zen-sec-about');
    for (const button of within(bar).getAllByRole('button')) {
      expect(button.className).toMatch(/h-11|min-h-11/);
    }
  });

  it('Page Down and Page Up move between sections', async () => {
    await page();
    fireEvent.keyDown(window, { key: 'PageDown' });
    expect(scrolled.at(-1)?.id).toBe('zen-sec-about');
    fireEvent.keyDown(window, { key: 'PageDown' });
    expect(scrolled.at(-1)?.id).toBe('zen-sec-about-zenoti');
    fireEvent.keyDown(window, { key: 'PageUp' });
    expect(scrolled.at(-1)?.id).toBe('zen-sec-about');
  });

  it.each([
    ['/for-zenotians/contact', 'zen-sec-contact'],
    ['/for-zenotians/about/skills', 'zen-about-skills'],
    ['/zenotians/quality', 'zen-sec-quality'],
  ])('opens %s at its section, instantly', async (path, id) => {
    await page(path);
    await waitFor(() => expect(scrolled.map((s) => s.id)).toContain(id));
    expect(scrolled.find((s) => s.id === id)?.behavior).toBe('auto');
  });

  it('jumps instantly with reduced motion', async () => {
    reduceMotion(true);
    const user = userEvent.setup();
    const nav = await page();
    await screen.findAllByRole('heading', { level: 2, name: 'Contact' });
    await user.click(within(nav).getByRole('link', { name: 'Contact' }));
    expect(scrolled.at(-1)).toEqual({ id: 'zen-sec-contact', behavior: 'auto' });
  });

  it('turns on proximity snap for this page only', async () => {
    const { unmount } = renderAt('/for-zenotians');
    await screen.findByRole('heading', { level: 1, name: /Built for Zenotians/ });
    expect(document.documentElement.classList.contains('zen-snap')).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains('zen-snap')).toBe(false);
    const css = (await import('../design/index.css?raw')).default;
    expect(css).toMatch(/html\.zen-snap \{\s*scroll-snap-type: y proximity;/);
    expect(css).not.toMatch(/scroll-snap-type: y mandatory/);
    expect(css).toMatch(/\.zen-section \{\s*min-height: 100dvh;/);
  });
});
