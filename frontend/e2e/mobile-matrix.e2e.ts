import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { readFileSync } from 'node:fs';
import { settle, signIn, type Who } from './helpers';

/**
 * EVERY PAGE ON MOBILE (docs/MOBILE_AUDIT.md). Runs once per device project (mobile-320,
 * mobile-360, mobile-390, tablet-768, landscape-844; see playwright.config.ts):
 *
 *   npx playwright test --project=mobile-320 --project=mobile-360 --project=mobile-390
 *     --project=tablet-768 --project=landscape-844 --reporter=line
 *
 * For every route of every role (read from shared/policy.json, so new pages are included) it
 * checks: nothing scrolls sideways, no tappable control smaller than 44 x 44 px (exceptions
 * below), no serious or critical axe violation; and it saves a full-page screenshot to
 * mobile-screens/<role>/<route>-<device>.png. Problems are collected per route and reported
 * together at the end of each test, so one bad page never hides the others.
 *
 * The logo splash is skipped with the existing session flag (alankar-splash-seen).
 */

const SHOTS = 'mobile-screens';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const MIN_TARGET = 44;

/**
 * Not counted as too small (documented in docs/MOBILE_AUDIT.md):
 *  - links inside running text (WCAG 2.5.8 "inline" exception);
 *  - a checkbox or radio whose label is the 44 px target;
 *  - the "Skip to content" link (off screen until focused);
 *  - anything marked data-touch-exempt (none today);
 *  - chart internals (SVG) and controls inside aria-hidden or inert areas.
 */
const EXEMPT_SELECTOR = '[data-touch-exempt], .recharts-wrapper *, a[href="#main"]';

interface Policy {
  public: { routes: string[] };
  roles: Record<string, { home: string; routes: string[]; menu: { path: string }[] }>;
}

const policy: Policy = JSON.parse(readFileSync('../shared/policy.json', 'utf8'));
const NEEDS_DATA = /:id\b/; // pages for one record need an id: covered by the overlay tests

function routesFor(role: Exclude<Who, 'other'> | 'visitor'): string[] {
  if (role === 'visitor') return policy.public.routes.filter((r) => !NEEDS_DATA.test(r));
  const entry = policy.roles[role]!;
  const all = [entry.home, ...entry.menu.map((m) => m.path), ...entry.routes];
  return [...new Set(all.map((r) => r.split('#')[0]!))].filter((r) => r && !NEEDS_DATA.test(r));
}

function deviceOf(info: TestInfo): BrowserContextOptions {
  const use = info.project.use as BrowserContextOptions & { browserName?: string };
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = use;
  return { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent };
}

function slug(route: string): string {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/[/:?#=&]+/g, '_');
}

async function skipSplash(page: Page) {
  await page.addInitScript(() => {
    try {
      window.sessionStorage.setItem('alankar-splash-seen', '1');
    } catch {
      // no storage: automated browsers skip the splash anyway
    }
  });
}

/** Everything wrong with the page that is on screen now (empty when it is fine). */
async function problemsOn(page: Page, label: string): Promise<string[]> {
  const found: string[] = [];
  const over = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth - window.innerWidth;
  });
  if (over > 1) found.push(`${label}: scrolls sideways by ${over}px`);

  const small = await page.evaluate(
    ({ min, exempt }) => {
      const selector = [
        'a[href]',
        'button',
        '[role="button"]',
        '[role="tab"]',
        '[role="menuitem"]',
        '[role="radio"]',
        '[role="checkbox"]',
        '[role="switch"]',
        'input:not([type="hidden"])',
        'select',
        'textarea',
        'summary',
      ].join(',');
      const out: string[] = [];
      const inlineInText = (el: Element) => {
        if (el.tagName !== 'A') return false;
        if (getComputedStyle(el).display !== 'inline') return false;
        const parent = el.parentElement;
        const text = (parent?.textContent ?? '').trim();
        return text.length > (el.textContent ?? '').trim().length + 1;
      };
      for (const el of Array.from(document.querySelectorAll(selector))) {
        if (el.closest('[aria-hidden="true"], [inert]') || el.matches(exempt)) continue;
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (!box.width || !box.height || style.visibility === 'hidden') continue;
        if (style.position === 'absolute' && box.width <= 1 && box.height <= 1) continue; // sr-only
        if (inlineInText(el)) continue;
        if (el.matches('input[type="checkbox"], input[type="radio"]')) {
          const label =
            el.closest('label') ?? (el.id && document.querySelector(`label[for="${el.id}"]`));
          if (label) {
            const lb = (label as Element).getBoundingClientRect();
            if (lb.height >= min) continue;
          }
        }
        if (box.width < min - 0.5 || box.height < min - 0.5) {
          const name =
            el.getAttribute('aria-label') ||
            (el.textContent ?? '').trim().slice(0, 40) ||
            el.getAttribute('name') ||
            el.tagName.toLowerCase();
          out.push(
            `${el.tagName.toLowerCase()} "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`,
          );
        }
      }
      return out;
    },
    { min: MIN_TARGET, exempt: EXEMPT_SELECTOR },
  );
  if (small.length)
    found.push(`${label}: targets under ${MIN_TARGET}px: ${small.slice(0, 12).join('; ')}`);

  const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const worst = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of worst) {
    found.push(
      `${label}: axe ${v.id} (${v.impact}) @ ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(', ')}`,
    );
  }
  return found;
}

async function shoot(page: Page, role: string, name: string, info: TestInfo) {
  const dir = `${SHOTS}/${role}`; // Playwright creates the folders
  await page.screenshot({ path: `${dir}/${name}-${info.project.name}.png`, fullPage: true });
}

async function open(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState('load');
  await expect(page.locator('main').first()).toBeVisible();
  await settle(page);
}

function report(problems: string[]) {
  expect(problems, problems.join('\n')).toEqual([]);
}

// ------------------------------------------------------------------ every route, every role

test('visitor: every public page', async ({ browser }, info) => {
  const routes = routesFor('visitor');
  test.setTimeout(60_000 + routes.length * 40_000);
  const context = await browser.newContext(deviceOf(info));
  const page = await context.newPage();
  await skipSplash(page);
  const problems: string[] = [];
  for (const route of routes) {
    await open(page, route);
    problems.push(...(await problemsOn(page, route)));
    await shoot(page, 'visitor', slug(route), info);
  }
  await context.close();
  report(problems);
});

for (const who of ['customer', 'receptionist', 'stylist', 'admin'] as const) {
  test(`${who}: every page in the menu`, async ({ browser }, info) => {
    const routes = routesFor(who);
    test.setTimeout(120_000 + routes.length * 40_000);
    const s = await signIn(browser, who, undefined, { device: deviceOf(info) });
    await skipSplash(s.page);
    const problems: string[] = [];
    for (const route of routes) {
      await open(s.page, route);
      problems.push(...(await problemsOn(s.page, `${who} ${route}`)));
      await shoot(s.page, who, slug(route), info);
    }
    await s.context.close();
    report(problems);
  });
}

// ------------------------------------------------------------------ overlays and flows

test('visitor: menu drawer, chat widget and the logo splash', async ({ browser }, info) => {
  test.setTimeout(180_000);
  const problems: string[] = [];
  const context = await browser.newContext(deviceOf(info));
  const page = await context.newPage();
  await skipSplash(page);
  await open(page, '/');

  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible()) {
    await menu.click();
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
    problems.push(...(await problemsOn(page, 'menu drawer')));
    await shoot(page, 'visitor', 'overlay-menu-drawer', info);
    await page.keyboard.press('Escape');
  }

  await page.getByRole('button', { name: /^Open AI/ }).click();
  await expect(page.getByRole('button', { name: 'Close chat' })).toBeVisible();
  problems.push(...(await problemsOn(page, 'chat widget')));
  await shoot(page, 'visitor', 'overlay-chat-widget', info);
  await context.close();

  // The logo splash (forced and held on screen, see e2e/splash.e2e.ts).
  const fresh = await browser.newContext(deviceOf(info));
  const splashPage = await fresh.newPage();
  await splashPage.addInitScript(() => window.localStorage.setItem('alankar-splash', 'hold'));
  await splashPage.goto('/');
  await expect(splashPage.getByTestId('splash')).toBeVisible();
  await splashPage.waitForTimeout(1500);
  await shoot(splashPage, 'visitor', 'overlay-splash', info);
  const over = await splashPage.evaluate(
    () => (document.scrollingElement ?? document.documentElement).scrollWidth - window.innerWidth,
  );
  if (over > 1) problems.push(`splash: scrolls sideways by ${over}px`);
  await fresh.close();
  report(problems);
});

test('customer: booking steps, the guided tour and the app menu', async ({ browser }, info) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  const s = await signIn(browser, 'customer', undefined, { device: deviceOf(info) });
  const page = s.page;
  await skipSplash(page);

  await open(page, '/customer/book');
  await page.getByRole('link', { name: "Book Men's Haircut" }).click();
  problems.push(...(await problemsOn(page, 'booking: service')));
  await shoot(page, 'customer', 'booking-1-service', info);
  await page.getByRole('button', { name: 'Next: Time' }).click();
  problems.push(...(await problemsOn(page, 'booking: time')));
  await shoot(page, 'customer', 'booking-2-time', info);

  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible()) {
    await menu.click();
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
    problems.push(...(await problemsOn(page, 'app menu drawer')));
    await shoot(page, 'customer', 'overlay-menu-drawer', info);
    await page.keyboard.press('Escape');
  }

  // Below 1024 px the sidebar (with "Take the tour") lives in the menu drawer.
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Take the tour' }).click();
  const card = page.locator('[data-tour-card]');
  await expect(card).toBeVisible();
  problems.push(...(await problemsOn(page, 'tour card')));
  await shoot(page, 'customer', 'overlay-tour', info);
  await s.context.close();
  report(problems);
});

test('receptionist: the AIR popup', async ({ browser }, info) => {
  test.setTimeout(180_000);
  const s = await signIn(browser, 'receptionist', undefined, {
    device: deviceOf(info),
    airPopup: true,
  });
  await skipSplash(s.page);
  await open(s.page, '/dashboard');
  const problems: string[] = [];
  const dialog = s.page.getByRole('dialog', { name: 'While you were away' });
  if (await dialog.isVisible({ timeout: 15_000 }).catch(() => false)) {
    problems.push(...(await problemsOn(s.page, 'AIR popup')));
    await shoot(s.page, 'receptionist', 'overlay-air-popup', info);
  }
  await s.context.close();
  report(problems);
});
