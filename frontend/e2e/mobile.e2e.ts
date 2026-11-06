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
    await s.page
      .getByRole('button', { name: 'Next: Time' })
      .waitFor({ timeout: 30_000 })
      .catch(async () => {
        // Say what the page showed instead (for example a rating that must be given first).
        const text = (await s.page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 400);
        throw new Error(
          `The booking sheet did not open at ${s.page.url()}. The page says: ${text}`,
        );
      });
    await s.page.getByRole('button', { name: 'Next: Time' }).click();
    await expect(s.page.getByLabel('Date')).toBeVisible();
    // "Send booking request" only exists on the last step.
    await expect(s.page.getByRole('button', { name: 'Send booking request' })).toBeHidden();
    await s.context.close();
  });
});
