import { expect, test } from '@playwright/test';

/** Task 11c: each division page in its own theme, light and dark, with screenshots. */
const SHOTS = '../docs/ui-screenshots';
const PAGES = [
  { path: '/salon', label: 'Salon', theme: 'salon' },
  { path: '/spa', label: 'Spa', theme: 'spa' },
  { path: '/beauty-parlor', label: 'Beauty Parlor', theme: 'parlor' },
];

for (const mode of ['light', 'dark'] as const) {
  for (const width of [1280, 375]) {
    test(`division pages in their themes (${mode}, ${width}px)`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript((m) => {
        window.localStorage.setItem('salon-display', JSON.stringify({ mode: m }));
      }, mode);
      const page = await context.newPage();
      for (const division of PAGES) {
        await page.goto(division.path);
        await expect(page.getByRole('heading', { level: 1, name: division.label })).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', division.theme);
        await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
        await expect(
          page.getByRole('button', { name: /see details and book/i }).first(),
        ).toBeVisible();
        // The service list can be filtered and reset.
        await page.getByRole('button', { name: 'Kids', exact: true }).click();
        await page.getByRole('button', { name: 'All', exact: true }).click();
        await page.waitForTimeout(300);
        await page.screenshot({
          path: `${SHOTS}/division-${division.theme}-${width}-${mode}.png`,
          fullPage: width < 400,
        });
      }
      // Pages outside the divisions wear the division viewed last (here the Beauty Parlor).
      await page.goto('/register');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'parlor');
      await context.close();
    });
  }
}
