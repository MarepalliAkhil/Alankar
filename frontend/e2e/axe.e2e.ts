import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn, type Who } from './helpers';
import { PUBLIC_PAGES, ROLE_PAGES } from './pages';

/**
 * Deep accessibility scan with axe-core (WCAG 2.1 A/AA). Any serious or critical
 * violation fails the run; the rule ids are printed so they can be fixed.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scan(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const worst = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    worst.map((v) => `${path}: ${v.id} (${v.impact}) x${v.nodes.length}`),
    `axe violations on ${path}`,
  ).toEqual([]);
}

test('public pages have no serious accessibility violations', async ({ page }) => {
  for (const path of PUBLIC_PAGES) await scan(page, path);
});

for (const who of Object.keys(ROLE_PAGES) as Exclude<Who, 'other'>[]) {
  test(`${who} screens have no serious accessibility violations`, async ({ browser }) => {
    const s = await signIn(browser, who);
    for (const path of ROLE_PAGES[who]) await scan(s.page, path);
    await s.context.close();
  });
}
