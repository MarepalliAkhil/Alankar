import {
  expect,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

/** Accounts created by `manage.py e2e_prepare` (all fictional, example.com addresses). */
export const PASSWORD = 'E2e-Pass-2026!';
export const USERS = {
  admin: { role: 'admin', email: 'admin@e2e.example.com', name: 'Ela Admin' },
  receptionist: { role: 'receptionist', email: 'desk@e2e.example.com', name: 'Dev Desk' },
  stylist: { role: 'stylist', email: 'stylist@e2e.example.com', name: 'Sana Stylist' },
  customer: { role: 'customer', email: 'customer@e2e.example.com', name: 'Chitra Customer' },
  other: { role: 'customer', email: 'other@e2e.example.com', name: 'Omar Other' },
} as const;

export type Who = keyof typeof USERS;

export interface Session {
  context: BrowserContext;
  page: Page;
}

/** Opens a fresh browser context (own cookies) and signs in through the real login form. */
export async function signIn(
  browser: Browser,
  who: Who,
  viewport?: { width: number; height: number },
  options: {
    tour?: boolean;
    colorScheme?: 'light' | 'dark';
    reducedTransparency?: boolean;
    reducedMotion?: boolean;
  } = {},
): Promise<Session> {
  const user = USERS[who];
  const context = await browser.newContext({
    ...(viewport ? { viewport } : {}),
    ...(options.colorScheme ? { colorScheme: options.colorScheme } : {}),
    ...(options.reducedMotion ? { reducedMotion: 'reduce' as const } : {}),
  });
  if (options.reducedTransparency) {
    await context.addInitScript(() =>
      window.localStorage.setItem('salon-display', JSON.stringify({ reduceTransparency: true })),
    );
  }
  const page = await context.newPage();
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) {
      failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    }
  });
  // The server hashes passwords on purpose slowly, so on a busy machine a sign-in can take a
  // while: wait generously. A sign-in that ends back on /login is tried again (up to three times);
  // if the login page is not shown at all on a retry, the earlier attempt had in fact succeeded.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto(`/login?role=${user.role}`);
    const form = page.locator('input[name=email]');
    const shown = await form
      .waitFor({ timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (attempt > 1 && !shown) {
      if (!new URL(page.url()).pathname.startsWith('/login')) break;
    }
    await form.fill(user.email);
    await page.locator('input[name=password]').fill(PASSWORD);
    await page
      .locator('form')
      .getByRole('button', { name: /^Sign in/ })
      .click();
    await page
      .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 })
      .catch(() => undefined);
    await page.waitForLoadState('load');
    await page.waitForTimeout(1200); // a bounce back to /login happens just after the first paint
    if (!new URL(page.url()).pathname.startsWith('/login')) break;
    if (attempt === 3) {
      throw new Error(
        `Sign in as ${who} ended on ${page.url()} after 3 tries. Failed API calls: ${
          failed.join(', ') || 'none'
        }`,
      );
    }
  }
  if (user.role === 'customer' && !options.tour) {
    // The first-run tour invite is not what these tests are about: record "not now" on the server.
    await api(page, 'PUT', '/api/auth/tours/', { key: 'tour:customer', status: 'skipped' });
    await page.reload();
  }
  return { context, page };
}

/** Calls the API from inside a signed-in context (cookies and the CSRF header are added). */
export async function api(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<APIResponse> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'csrftoken')?.value ?? '';
  return page.request.fetch(path, {
    method,
    data: data === undefined ? undefined : JSON.stringify(data),
    headers: { 'X-CSRFToken': csrf, 'Content-Type': 'application/json' },
  });
}

/**
 * The page the app shows when a signed-in user opens something their role may not use.
 * The first address in a session is opened for real (a full page load, like typing it into the
 * address bar). The following ones are opened from inside the app (history + popstate), which
 * runs the same route guard without paying for a full reload of the development server each
 * time: eleven cold loads of a dev server were what made this check run past its time.
 */
export async function expectForbiddenPage(page: Page, path: string): Promise<void> {
  const inApp = new URL(page.url()).origin.startsWith('http');
  if (inApp) {
    await page.evaluate((to) => {
      window.history.pushState({}, '', to);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
  } else {
    await page.goto(path);
  }
  await expect(page).toHaveURL(/\/403$/);
  await expect(
    page
      .getByRole('heading', { name: "You don't have access to this page" })
      .or(page.getByText("You don't have access to this page"))
      .first(),
  ).toBeVisible();
}

export const TIME_BUTTON = /^\d{1,2}:\d{2} (am|pm)$/;

/**
 * The guided booking form (Service, Time, Details, Review): starts on the Service step and moves
 * forward one step at a time, like a customer. `time` picks the slot; `dateIndex` the date option.
 */
export async function bookThroughSteps(
  page: Page,
  options: { dateIndex: number; stylist: string; time: string; send?: boolean },
): Promise<void> {
  await page.getByRole('button', { name: 'Next: Time' }).click();
  await page.getByLabel('Date').selectOption({ index: options.dateIndex });
  await page.getByLabel('Stylist', { exact: true }).selectOption({ label: options.stylist });
  await page.getByRole('button', { name: options.time }).click();
  await page.getByRole('button', { name: 'Next: Details' }).click();
  await page.getByRole('button', { name: 'Next: Review' }).click();
  await page.getByLabel('I accept the cancellation policy.').check();
  if (options.send !== false) {
    await page.getByRole('button', { name: 'Send booking request' }).click();
  }
}

/**
 * Waits until the page has finished drawing: fonts ready and every finite animation or colour
 * transition has ended (a scan that runs half-way through a fade reads blended colours and
 * reports contrast problems that are not there). Never throws: after the wait, whatever is on
 * screen is what gets checked.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every(
            (a) =>
              a.playState !== 'running' ||
              a.effect?.getComputedTiming().iterations === Infinity ||
              a.effect?.getComputedTiming().endTime === 0,
          ),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(200);
}
