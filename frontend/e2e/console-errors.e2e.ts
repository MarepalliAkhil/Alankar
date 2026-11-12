import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { settle, signIn, type Who } from './helpers';

/**
 * Production polish: every route for every role (and the 404 page) loads with no console error,
 * no uncaught page error, no failed request (4xx/5xx, except the 404 page itself) and no React
 * warning. Routes come from shared/policy.json, so new pages are included automatically.
 */

interface Policy {
  public: { routes: string[] };
  roles: Record<string, { home: string; routes: string[]; menu: { path: string }[] }>;
}
const policy: Policy = JSON.parse(readFileSync('../shared/policy.json', 'utf8'));
const NEEDS_DATA = /:id\b/;

function routesFor(role: Exclude<Who, 'other'> | 'visitor'): string[] {
  if (role === 'visitor') return policy.public.routes.filter((r) => !NEEDS_DATA.test(r));
  const entry = policy.roles[role]!;
  const all = [entry.home, ...entry.menu.map((m) => m.path), ...entry.routes];
  return [...new Set(all.map((r) => r.split('#')[0]!))].filter((r) => r && !NEEDS_DATA.test(r));
}

/** Collects every problem the page reports while `run` executes. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error') problems.push(`console error: ${text}`);
    else if (message.type() === 'warning' && /^Warning: |React|act\(/.test(text))
      problems.push(`React warning: ${text}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? '';
    // Leaving a page cancels its pending requests: not a failure of the page.
    if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(failure)) return;
    problems.push(`request failed: ${request.method()} ${request.url()} (${failure})`);
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    problems.push(`HTTP ${status}: ${response.request().method()} ${response.url()}`);
  });
  return problems;
}

async function visitAll(page: Page, routes: string[], problems: string[]) {
  const report: string[] = [];
  for (const route of routes) {
    problems.length = 0;
    await page.goto(route);
    await settle(page);
    await page.waitForTimeout(300);
    if (problems.length) report.push(`${route}\n    ${problems.join('\n    ')}`);
  }
  return report;
}

test('visitor: every public page and the 404 page are clean', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext();
  await context.addInitScript(() => {
    try {
      window.sessionStorage.setItem('alankar-splash-seen', '1');
    } catch {
      // automated browsers skip the splash anyway
    }
  });
  const page = await context.newPage();
  const problems = watch(page);
  const report = await visitAll(page, routesFor('visitor'), problems);

  problems.length = 0;
  await page.goto('/this-page-does-not-exist');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await settle(page);
  if (problems.length) report.push(`/this-page-does-not-exist\n    ${problems.join('\n    ')}`);
  await context.close();
  expect(report, report.join('\n')).toEqual([]);
});

for (const role of ['customer', 'receptionist', 'stylist', 'admin'] as const) {
  test(`${role}: every page in the menu is clean`, async ({ browser }) => {
    test.setTimeout(300_000);
    const s = await signIn(browser, role);
    const problems = watch(s.page);
    const report = await visitAll(s.page, routesFor(role), problems);
    await s.context.close();
    expect(report, report.join('\n')).toEqual([]);
  });
}
