import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signIn, type Who } from './helpers';

/**
 * The logo splash (docs/BRAND_LOGO.md). Every other test runs without it; these turn it on with
 * localStorage "alankar-splash" = "force" (automated browsers are otherwise skipped).
 */
const CAP_MS = 3000;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => window.localStorage.setItem('alankar-splash', 'force'));
});

const splash = (page: Page) => page.getByTestId('splash');

async function waitForSplashEnd(page: Page) {
  await expect(splash(page)).toHaveCount(0, { timeout: CAP_MS + 1500 });
}

test('shows on the first visit and ends by itself within the cap', async ({ page }) => {
  const started = Date.now();
  await page.goto('/');
  await expect(splash(page)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Welcome to' })).toHaveCount(1);
  await waitForSplashEnd(page);
  // Page load plus the splash: never far past the cap.
  expect(Date.now() - started).toBeLessThan(CAP_MS + 4000);
  await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
  await expect(page.locator('[data-brand-mark="navbar"]')).toBeVisible();
});

test('does not play again on the next navigation or a reload in the same session', async ({
  page,
}) => {
  await page.goto('/');
  await waitForSplashEnd(page);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Salon' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/salon/);
  await expect(splash(page)).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState('load');
  await expect(splash(page)).toHaveCount(0);
});

test('plays on whichever public page the visitor lands on', async ({ page }) => {
  await page.goto('/login');
  await expect(splash(page)).toBeVisible();
});

test('can be skipped with the Skip button, a click and Escape', async ({ browser }) => {
  for (const how of ['button', 'click', 'escape'] as const) {
    const context = await browser.newContext();
    await context.addInitScript(() => window.localStorage.setItem('alankar-splash', 'force'));
    const page = await context.newPage();
    await page.goto('/');
    await expect(splash(page)).toBeVisible();
    if (how === 'button') {
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Skip' })).toBeFocused();
      await page.keyboard.press('Enter');
    } else if (how === 'click') {
      await page.mouse.click(20, 200);
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(splash(page)).toHaveCount(0, { timeout: 1000 });
    await context.close();
  }
});

test('never plays with reduced motion, or when landing on a portal page', async ({ browser }) => {
  const reduced = await browser.newContext({ reducedMotion: 'reduce' });
  await reduced.addInitScript(() => window.localStorage.setItem('alankar-splash', 'force'));
  const page = await reduced.newPage();
  await page.goto('/');
  await page.waitForLoadState('load');
  await expect(splash(page)).toHaveCount(0);
  await expect(page.locator('[data-brand-mark="navbar"]')).toBeVisible();
  await reduced.close();

  const portal = await browser.newContext();
  await portal.addInitScript(() => window.localStorage.setItem('alankar-splash', 'force'));
  const second = await portal.newPage();
  await second.goto('/desk'); // a staff address: redirected to sign in, still no splash
  await second.waitForLoadState('load');
  await expect(splash(second)).toHaveCount(0);
  await portal.close();
});

test('the logo link goes home', async ({ page }) => {
  await page.goto('/spa');
  await waitForSplashEnd(page);
  const link = page.getByRole('link', { name: /^Alankar home$/ });
  await link.first().click();
  await expect(page).toHaveURL(/\/$/);
});

for (const width of [320, 390, 768]) {
  test(`nothing scrolls sideways at ${width}px, during and after the splash`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(splash(page)).toBeVisible();
    const during = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(during).toBeLessThanOrEqual(0);
    await waitForSplashEnd(page);
    const after = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(after).toBeLessThanOrEqual(0);
  });
}

/** Records every layout shift, and how much of it touched the navbar (where the logo lands). */
async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number; __clsNav: number };
    w.__cls = 0;
    w.__clsNav = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
        sources?: { node?: Node | null }[];
      }[]) {
        if (entry.hadRecentInput) continue;
        w.__cls += entry.value;
        const inNav = (entry.sources ?? []).some(
          (src) => src.node instanceof Element && !!src.node.closest('header'),
        );
        if (inNav) w.__clsNav += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

async function shifts(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __cls: number; __clsNav: number };
    return { all: w.__cls, nav: w.__clsNav };
  });
}

test('the splash adds no layout shift (CLS added under 0.01)', async ({ page, browser }) => {
  // The same page without the splash (automated browsers do not get it unless forced): whatever
  // the page itself shifts while its content loads is the baseline.
  const plain = await browser.newContext();
  const without = await plain.newPage();
  await watchShifts(without);
  await without.goto('/');
  await without.waitForLoadState('load');
  await without.waitForTimeout(4000);
  const baseline = await shifts(without);
  await plain.close();

  await watchShifts(page);
  await page.goto('/');
  await waitForSplashEnd(page);
  await page.waitForTimeout(1000);
  const withSplash = await shifts(page);
  expect(withSplash.nav).toBeLessThan(0.01); // the logo lands without moving the navbar
  expect(withSplash.all - baseline.all).toBeLessThan(0.01);
});

test('the splash overlay has no serious accessibility violations', async ({ page }) => {
  // "hold" keeps the splash up (automated browsers only) while axe reads it. Pausing the clock
  // instead would also stop axe's own timers.
  await page.addInitScript(() => window.localStorage.setItem('alankar-splash', 'hold'));
  await page.goto('/');
  await expect(splash(page)).toBeVisible();
  await page.waitForTimeout(1500); // drawn and filled
  const result = await new AxeBuilder({ page })
    .include('[data-testid="splash"]')
    .withTags(TAGS)
    .analyze();
  const worst = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(worst.map((v) => v.id)).toEqual([]);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(splash(page)).toHaveCount(0);
});

test('the navbar logo has no accessibility violations for visitors', async ({ page }) => {
  await page.goto('/');
  await waitForSplashEnd(page);
  const result = await new AxeBuilder({ page })
    .include('nav[aria-label="Main"]')
    .withTags(TAGS)
    .withRules(['label-content-name-mismatch'])
    .analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
});

for (const who of ['customer', 'receptionist', 'stylist', 'admin'] as Who[]) {
  test(`the sidebar logo has no accessibility violations for ${who}`, async ({ browser }) => {
    const s = await signIn(browser, who);
    const brandLink = s.page.locator('[data-brand-link="sidebar"]').first();
    await expect(brandLink).toBeVisible();
    await expect(brandLink).toHaveAccessibleName(/^Alankar home$/);
    const result = await new AxeBuilder({ page: s.page })
      .include('[data-brand-link="sidebar"]')
      .withTags(TAGS)
      .analyze();
    const worst = result.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(worst.map((v) => v.id)).toEqual([]);
    await expect(s.page.getByTestId('splash')).toHaveCount(0);
    await s.context.close();
  });
}
