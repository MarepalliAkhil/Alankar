import { expect, test, type Page } from '@playwright/test';
import { signIn, type Who } from './helpers';
import { PUBLIC_PAGES, ROLE_PAGES } from './pages';

/** Phone width (iPhone SE class). Nothing may scroll sideways and taps must stay reachable. */
const PHONE = { width: 375, height: 667 };

async function fits(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, `${path}: page scrolls sideways by ${over}px`).toBeLessThanOrEqual(0);
}

test.describe('phone width', () => {
  test.use({ viewport: PHONE });

  test('public pages fit a phone screen', async ({ page }) => {
    for (const path of PUBLIC_PAGES) await fits(page, path);
  });

  for (const who of Object.keys(ROLE_PAGES) as Exclude<Who, 'other'>[]) {
    test(`${who} screens fit a phone screen`, async ({ browser }) => {
      const s = await signIn(browser, who, PHONE);
      for (const path of ROLE_PAGES[who]) await fits(s.page, path);
      await s.context.close();
    });
  }

  test('a customer can start a booking on a phone', async ({ browser }) => {
    const s = await signIn(browser, 'customer', PHONE);
    await s.page.goto('/customer/book');
    await s.page.getByRole('link', { name: "Book Men's Haircut" }).click();
    await expect(s.page.getByLabel('Date')).toBeVisible();
    await expect(s.page.getByRole('button', { name: 'Send booking request' })).toBeVisible();
    await s.context.close();
  });
});
