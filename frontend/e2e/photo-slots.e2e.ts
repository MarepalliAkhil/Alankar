import { expect, test } from '@playwright/test';

/**
 * Image slots never cause failed requests or console errors, whether or not the owner has put
 * photos in public/photos: missing photos are known at build time and the artwork is used.
 */
const PAGES = ['/', '/salon', '/spa', '/beauty-parlor'];

test('image slots load without failed requests or console errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('requestfailed', (r) => problems.push(`failed: ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && /\/photos\/|\/assets\/|\.svg/.test(r.url())) {
      problems.push(`${r.status()}: ${r.url()}`);
    }
  });
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const frames = page.locator('[data-art-frame]');
    expect(await frames.count()).toBeGreaterThan(0);
    // Every visible picture actually decoded (photo or artwork).
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('[data-art-frame] img')]
        .filter((img) => img.loading === 'eager' && img.complete && img.naturalWidth === 0)
        .map((img) => img.currentSrc),
    );
    expect(broken).toEqual([]);
  }
  expect(problems).toEqual([]);
});
