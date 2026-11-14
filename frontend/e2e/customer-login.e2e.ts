/**
 * Customers always land on their dashboard after signing in (any next / returnTo is ignored);
 * a booking started before signing in becomes a "Continue your booking" card; signed-in customers
 * never see /login or /register; staff keep their own rule; no open redirect.
 */
import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, signIn } from './helpers';

async function signInAt(page: Page, path: string, email: string) {
  await page.goto(path);
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(PASSWORD);
  await page
    .locator('form')
    .getByRole('button', { name: /^Sign in/ })
    .click();
}

test('a customer from a booking link lands on the dashboard and can continue', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const sheet = '/customer/book?service=mens-haircut';
  await signInAt(
    page,
    `/login?role=customer&next=${encodeURIComponent(sheet)}`,
    'customer@e2e.example.com',
  );
  await expect(page).toHaveURL(/\/customer-dashboard$/, { timeout: 45_000 });
  const card = page.getByRole('region', { name: 'Continue your booking' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('link', { name: /Continue/ }).first()).toHaveAttribute(
    'href',
    /\/customer\/(book\?service=mens-haircut|pay\/)/,
  );
  // Signed in: /login and /register go straight to the dashboard.
  for (const path of ['/login?next=%2Fcustomer%2Finvoices', '/register']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/customer-dashboard$/);
  }
  await context.close();
});

test('a customer is never sent to an outside or other address', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAt(
    page,
    `/login?role=customer&next=${encodeURIComponent('https://evil.example.com/x')}`,
    'other@e2e.example.com',
  );
  await expect(page).toHaveURL(/127\.0\.0\.1|localhost/);
  await expect(page).toHaveURL(/\/customer-dashboard$/, { timeout: 45_000 });
  await context.close();
});

test('staff keep their rule: a page their role may open', async ({ browser }) => {
  const { page, context } = await signIn(browser, 'admin');
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: "You're signed in" })).toBeVisible();
  await context.close();
});
