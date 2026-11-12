import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Production polish (SEO): the 404 page, the share tags in the raw HTML of each public page (read
 * without running JavaScript, as WhatsApp, LinkedIn and search engines do), no <img> without alt,
 * and axe still clean. The raw-HTML check reads the built files: run `npm run build` first.
 */

const MAIN = ['/', '/salon', '/spa', '/beauty-parlor', '/for-zenotians'];
const dist = join(process.cwd(), 'dist');

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      window.sessionStorage.setItem('alankar-splash-seen', '1');
    } catch {
      // automated browsers skip the splash anyway
    }
  });
});

test('the 404 page: designed, noindex, with the way back', async ({ page }) => {
  await page.goto('/no-such-page-here');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expect(page).toHaveTitle('Page not found | Alankar');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const nav = page.getByRole('navigation', { name: 'Main pages' });
  for (const name of ['Home', 'Salon', 'Spa', 'Beauty Parlor', 'Book']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
});

test('share tags and structured data are in the raw HTML of each public page', () => {
  test.skip(!existsSync(join(dist, 'index.html')), 'run npm run build first');
  for (const route of MAIN) {
    const file = route === '/' ? join(dist, 'index.html') : join(dist, route, 'index.html');
    const html = readFileSync(file, 'utf8');
    expect(html, route).toMatch(/<title>[^<]+ \| Alankar<\/title>/);
    for (const needle of [
      'name="description"',
      'rel="canonical"',
      'property="og:title"',
      'property="og:description"',
      'property="og:image"',
      'property="og:image:width" content="1200"',
      'property="og:image:height" content="630"',
      'property="og:image:alt"',
      'name="twitter:card" content="summary_large_image"',
    ]) {
      expect(html, `${route}: ${needle}`).toContain(needle);
    }
    expect(html).not.toMatch(/Vite|vite\.svg/);
  }
  expect(readFileSync(join(dist, 'index.html'), 'utf8')).toContain('"@type":"WebSite"');
});

test('the tab shows the page title, never a framework name', async ({ page }) => {
  for (const route of MAIN) {
    await page.goto(route);
    await expect(page).toHaveTitle(/^.+ \| Alankar$/);
  }
});

test('every image on the public pages has an alt attribute, and axe is clean', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of [...MAIN, '/login', '/privacy']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const missing = await page.locator('img:not([alt])').count();
    expect(missing, `${route}: img without alt`).toBe(0);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
    expect(
      serious.map((v) => `${v.id}: ${v.help}`),
      route,
    ).toEqual([]);
  }
});
