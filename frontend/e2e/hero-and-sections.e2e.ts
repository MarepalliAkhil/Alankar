import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Navbar over the hero, and the For Zenotians section bar, on desktop and on the mobile projects
 * (this file runs in the chromium project and in mobile-320 ... landscape-844). Screenshots of the
 * home hero and For Zenotians at 390 px go to mobile-screens/hero/ (git-ignored).
 */

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      window.sessionStorage.setItem('alankar-splash-seen', '1');
    } catch {
      // automated browsers skip the splash anyway
    }
  });
});

const overflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const path of ['/', '/salon', '/spa', '/beauty-parlor']) {
  test(`${path}: the hero starts under the navbar, glass at the top, denser after scrolling`, async ({
    page,
  }, info) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toHaveAttribute('data-scrolled', 'false');
    // The hero's picture reaches the top edge of the window (no band above it).
    const top = await page.evaluate(() => {
      const hero = document.querySelector('[data-hero="home"], [data-division-hero]');
      const backdrop = document.querySelector('.home-backdrop');
      return Math.min(
        hero?.getBoundingClientRect().top ?? 999,
        backdrop?.getBoundingClientRect().top ?? 999,
      );
    });
    expect(top).toBeLessThanOrEqual(1);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      const axe = await new AxeBuilder({ page })
        .include('nav[aria-label="Main"]')
        .withRules(['color-contrast'])
        .analyze();
      expect(
        axe.violations.map((v) => v.id),
        `${path} ${scheme}`,
      ).toEqual([]);
    }
    await page.mouse.wheel(0, 900);
    await expect(nav).toHaveAttribute('data-scrolled', 'true');
    if (path === '/' && info.project.name === 'mobile-390') {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: 'mobile-screens/hero/home-hero-390.png' });
    }
  });
}

test('For Zenotians: no sideways scroll, and the section bar on phones', async ({ page }, info) => {
  await page.goto('/for-zenotians');
  await expect(page.locator('h1')).toHaveCount(1);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const phone = (page.viewportSize()?.width ?? 1280) < 1024;
  const bar = page.locator('[data-zen-bar]');
  if (phone) {
    await expect(bar).toBeVisible();
    await page.mouse.wheel(0, 3000);
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box?.y ?? 999).toBeLessThan(140); // stuck under the navbar
  } else {
    await expect(bar).toBeHidden();
  }
  if (info.project.name === 'mobile-390') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'mobile-screens/hero/for-zenotians-390.png', fullPage: true });
  }
});
