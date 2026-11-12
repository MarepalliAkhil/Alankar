import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession } from '../../api/auth';
import * as publicApi from '../../api/public';
import css from '../../design/index.css?raw';
import { site } from '../../test/fixtures';
import { renderAt } from '../../test/render';

vi.mock('../../api/auth', () => ({
  ensureCsrf: vi.fn().mockResolvedValue(undefined),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  needsOtp: () => false,
  needsTwoFactor: () => false,
}));
vi.mock('../../api/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/public')>()),
  getSite: vi.fn(),
  getCategories: vi.fn(),
  getServices: vi.fn(),
  getTeam: vi.fn(),
  getPolicyPage: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue(null);
  vi.mocked(publicApi.getSite).mockResolvedValue(site);
  vi.mocked(publicApi.getCategories).mockResolvedValue([]);
  vi.mocked(publicApi.getServices).mockResolvedValue([]);
  vi.mocked(publicApi.getTeam).mockResolvedValue([]);
  vi.mocked(publicApi.getPolicyPage).mockResolvedValue({
    key: 'privacy',
    title: 'Privacy notice',
    body: 'Text.',
  } as never);
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
});

const bar = () => screen.getByRole('navigation', { name: 'Main' });

describe('navbar and hero: one scene', () => {
  it('lets the hero start under the navbar on hero pages (home and the divisions)', async () => {
    for (const path of ['/', '/salon', '/spa', '/beauty-parlor']) {
      const { unmount } = renderAt(path);
      const main = document.getElementById('main')!;
      expect(main.className).toContain('under-nav');
      unmount();
    }
    renderAt('/privacy');
    expect(document.getElementById('main')!.className).not.toContain('under-nav');
    expect(css).toMatch(/\.under-nav \{\s*margin-top: calc\(-1 \* var\(--nav-total\)\);/);
    expect(css).toMatch(/--nav-total: calc\(4rem \+ max\(0\.5rem, env\(safe-area-inset-top\)\)\);/);
  });

  it('has no solid background at the top of the hero, and a denser one after scrolling', async () => {
    renderAt('/');
    const nav = bar();
    expect(nav.className).toContain('glass-bar');
    expect(nav.className).not.toMatch(/\bbg-(surface|background|canvas)\b/);
    expect(nav.getAttribute('data-scrolled')).toBe('false');
    // The base glass recipe is translucent (a fill colour that is not the solid one).
    expect(css).toMatch(
      /\.glass-bar,\s*\.glass-photo \{[^}]*background-color: var\(--glass-fill-photo\)/,
    );
    await act(async () => {
      Object.defineProperty(window, 'scrollY', { value: 600, configurable: true, writable: true });
      window.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(nav.getAttribute('data-scrolled')).toBe('true');
    expect(css).toMatch(
      /\.glass-bar\[data-scrolled='true'\] \{\s*background-color: color-mix\(in srgb, var\(--glass-fill-solid\) 78%, transparent\);/,
    );
  });

  it('is solid with reduced transparency (the system setting or the visitor toggle)', () => {
    expect(css).toMatch(
      /\[data-transparency='reduced'\] \.glass-bar,\s*\[data-transparency='reduced'\] \.glass-photo \{\s*background-color: var\(--glass-fill-solid\);/,
    );
    expect(css).toMatch(
      /\[data-transparency='reduced'\] \.glass-bar\[data-scrolled='true'\] \{\s*background-color: var\(--glass-fill-solid\);/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-transparency: reduce\) \{\s*\.glass-bar\[data-scrolled='true'\] \{\s*background-color: var\(--glass-fill-solid\);/,
    );
  });

  it('keeps the navbar clear of the phone notch (safe area at the top)', () => {
    renderAt('/');
    const header = bar().closest('header')!;
    expect(header.className).toContain('pt-[max(theme(spacing.sm),env(safe-area-inset-top))]');
  });
});
