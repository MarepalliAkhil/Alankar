import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { settle, signIn, type Who } from './helpers';
import { PUBLIC_PAGES, ROLE_PAGES } from './pages';

/**
 * Deep accessibility scan with axe-core (WCAG 2.1 A/AA). Any serious or critical
 * violation fails the run; the rule ids are printed so they can be fixed.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scan(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  // Not "networkidle": a dev server on a slow machine, or a polling request, can keep it busy for
  // ever. Wait for the page itself to be drawn and the fonts to be ready, then let it settle.
  await page.waitForLoadState('load');
  await expect(page.locator('main').first()).toBeVisible();
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const worst = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  // For every violating node print the rule id, the CSS selector and the (trimmed) HTML, so the
  // failing element can be found without guessing.
  const lines = worst.flatMap((v) => [
    `${path}: ${v.id} (${v.impact}) x${v.nodes.length}`,
    ...v.nodes.map((n) => `    ${v.id} @ ${n.target.join(' ')}\n      ${n.html.slice(0, 300)}`),
  ]);
  expect(lines, `axe violations on ${path}`).toEqual([]);
}

// One test per page: a slow machine only slows the page it is on, and a failure names the page.
for (const path of PUBLIC_PAGES) {
  test(`public ${path} has no serious accessibility violations`, async ({ page }) => {
    await scan(page, path);
  });
}

for (const who of Object.keys(ROLE_PAGES) as Exclude<Who, 'other'>[]) {
  test(`${who} screens have no serious accessibility violations`, async ({ browser }) => {
    test.setTimeout(90_000 + 45_000 * ROLE_PAGES[who].length); // one sign-in + N pages
    const s = await signIn(browser, who);
    for (const path of ROLE_PAGES[who]) await scan(s.page, path);
    await s.context.close();
  });
}
