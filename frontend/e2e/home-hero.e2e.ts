import { expect, test, type Page } from '@playwright/test';

/**
 * The home page (Task 15B): one hero that says what the shop is, three division sections that each
 * open their own page, and no page-level horizontal scroll. Screenshots go to docs/ui-screenshots/.
 */
const SHOTS = '../docs/ui-screenshots';

async function useMode(page: Page, mode: 'light' | 'dark') {
  await page.addInitScript((m) => {
    window.localStorage.setItem('salon-display', JSON.stringify({ mode: m }));
  }, mode);
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const mode of ['light', 'dark'] as const) {
  test(`desktop home: hero and the four background sections (${mode})`, async ({ page }) => {
    await useMode(page, mode);
    await page.goto('/');
    const hero = page.locator('[data-hero="home"]');
    await expect(hero).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Book it online');
    await expect(hero.getByRole('link', { name: /Book a visit/ })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Visit details' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/home-hero-${mode}.png` });

    for (const [id, label] of [
      ['home-salon', 'Salon'],
      ['home-spa', 'Spa'],
      ['home-parlor', 'Beauty Parlor'],
    ]) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await expect(page.getByRole('link', { name: `All ${label} services` })).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/home-${id}-${mode}.png` });
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    // A division section opens its division page.
    await page.getByRole('link', { name: /^All Spa services/ }).click();
    await expect(page).toHaveURL(/\/spa$/);
  });
}

test('phone: the hero and the division sections fit the screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('[data-hero="home"]')).toBeVisible();
  await expect(page.getByRole('link', { name: /Book a visit/ }).first()).toBeVisible();
  for (const label of ['Salon', 'Spa', 'Beauty Parlor']) {
    const link = page.getByRole('link', { name: `All ${label} services` });
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
  }
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOTS}/home-hero-phone.png` });
  await context.close();
});

test('reduced motion: everything is visible at once', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('[data-hero="home"]')).toBeVisible();
  const hidden = await page.evaluate(
    () =>
      [...document.querySelectorAll('.reveal')].filter((el) => getComputedStyle(el).opacity !== '1')
        .length,
  );
  expect(hidden).toBe(0);
  await context.close();
});
