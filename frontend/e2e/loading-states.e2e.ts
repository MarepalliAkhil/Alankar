import { expect, test, type Page, type Route } from '@playwright/test';
import { PASSWORD, USERS } from './helpers';

/**
 * Submit buttons react at once. The sign-in and registration requests are held back for 2 seconds
 * so we can see (and screenshot) the button spinner and, after 800 ms, the glass overlay.
 * Screenshots go to docs/ui-screenshots/ for review.
 */
const SHOTS = '../docs/ui-screenshots';
const DELAY_MS = 2000;

function slow(route: Route, then: () => Promise<void>) {
  return new Promise<void>((done) => {
    setTimeout(() => {
      void then().finally(done);
    }, DELAY_MS);
  });
}

async function useMode(page: Page, mode: 'light' | 'dark') {
  await page.addInitScript((m) => {
    window.localStorage.setItem('salon-display', JSON.stringify({ mode: m }));
  }, mode);
}

for (const mode of ['light', 'dark'] as const) {
  test(`login shows a spinner at once and an overlay when slow (${mode})`, async ({ page }) => {
    await useMode(page, mode);
    // A wrong password: the request goes to the real server (after the delay) and fails, so we
    // also see the button come back with the usual message. Nothing is changed on the server.
    await page.route('**/api/auth/login/', (route) => slow(route, () => route.continue()));
    await page.goto(`/login?role=customer`);
    await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
    await page.locator('input[name=email]').fill(USERS.customer.email);
    await page.locator('input[name=password]').fill(`${PASSWORD}-wrong`);
    const button = page.locator('form').getByRole('button', { name: /^Sign in|Loading/ });
    const before = await button.boundingBox();
    await button.click();

    const busy = page.locator('form button[aria-busy="true"]');
    await expect(busy).toBeVisible({ timeout: 300 });
    await expect(busy).toBeDisabled();
    await expect(busy).toContainText('Signing in');
    await expect(busy.locator('.spinner')).toBeVisible();
    const during = await busy.boundingBox();
    expect(Math.round(during?.width ?? 0)).toBe(Math.round(before?.width ?? 0));
    await page.screenshot({ path: `${SHOTS}/login-loading-${mode}.png` });

    await expect(page.getByTestId('busy-overlay')).toBeVisible({ timeout: 1500 });
    await page.waitForTimeout(400); // let the overlay finish fading in
    await page.screenshot({ path: `${SHOTS}/login-slow-overlay-${mode}.png` });

    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('form button[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByTestId('busy-overlay')).toHaveCount(0);
    await expect(page.locator('form').getByRole('button', { name: /^Sign in/ })).toBeEnabled();
  });

  test(`register shows a spinner at once and an overlay when slow (${mode})`, async ({ page }) => {
    await useMode(page, mode);
    // Never reaches the server: answered here after the delay, as a generic failure.
    await page.route('**/api/auth/register/', (route) =>
      slow(route, () =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'We could not create the account. Try again.' }),
        }),
      ),
    );
    await page.goto('/register');
    await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
    await page.locator('input[name=name]').fill('Loading Test');
    await page.locator('input[name=email]').fill('loading-test@e2e.example.com');
    await page.locator('input[name=phone]').fill('9876543210');
    await page.locator('input[name=password]').fill(PASSWORD);
    await page.locator('input[name=confirmPassword]').fill(PASSWORD);
    await page.locator('input[name=consent]').check();
    const button = page.locator('form button[type=submit]');
    await button.click();

    const busy = page.locator('form button[aria-busy="true"]');
    await expect(busy).toBeVisible({ timeout: 300 });
    await expect(busy).toBeDisabled();
    await expect(busy).toContainText('Creating your account');
    await page.screenshot({ path: `${SHOTS}/register-loading-${mode}.png`, fullPage: true });

    await expect(page.getByTestId('busy-overlay')).toBeVisible({ timeout: 1500 });
    await page.waitForTimeout(400); // let the overlay finish fading in
    await page.screenshot({ path: `${SHOTS}/register-slow-overlay-${mode}.png`, fullPage: true });

    await expect(page.locator('form button[aria-busy="true"]')).toHaveCount(0, { timeout: 8000 });
    await expect(page.getByTestId('busy-overlay')).toHaveCount(0);
    await expect(button).toBeEnabled();
  });
}
