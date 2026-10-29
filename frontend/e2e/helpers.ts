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
): Promise<Session> {
  const user = USERS[who];
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  await page.goto(`/login?role=${user.role}`);
  await page.locator('input[name=email]').fill(user.email);
  await page.locator('input[name=password]').fill(PASSWORD);
  await page
    .locator('form')
    .getByRole('button', { name: /^Sign in/ })
    .click();
  await expect(page).not.toHaveURL(/\/login/);
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

/** The page the app shows when a signed-in user opens something their role may not use. */
export async function expectForbiddenPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page).toHaveURL(/\/403$/);
  await expect(
    page
      .getByRole('heading', { name: "You don't have access to this page" })
      .or(page.getByText("You don't have access to this page"))
      .first(),
  ).toBeVisible();
}

export const TIME_BUTTON = /^\d{1,2}:\d{2} (am|pm)$/;
