import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Amendment 2: the home page has ONE full-window background that changes with the section in view
 * (Alankar, Salon, Spa, Parlor); every other page has a full-window background chosen by route
 * (docs/IMAGE_SLOTS.md); booking follows the division; only the booking and division pages have a
 * framed header picture; nothing shifts the layout; text stays AA over every photo.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const chapterOf = (page: Page) => page.locator('[data-home-backdrop]').getAttribute('data-chapter');
const currentSlot = (page: Page) =>
  page
    .locator('[data-home-layer][data-current="true"] [data-art-frame]')
    .getAttribute('data-art-frame');
const backdrop = (page: Page) => page.locator('[data-page-backdrop]');
const decoded = (page: Page, selector: string) =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll<HTMLImageElement>(sel)].every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    selector,
  );

async function axe(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const worst = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    worst.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

const SECTIONS = [
  ['home-alankar', '1', 'shopBackground'],
  ['home-salon', '2', 'salonBackground'],
  ['home-spa', '3', 'spaBackground'],
  ['home-parlor', '4', 'parlorBackground'],
] as const;

test('home: no half-visible duplicate photo and no right-hand photo card', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-hero="home"]')).toBeVisible();
  await expect(page.locator('[data-hero="home"] img')).toHaveCount(0);
  await expect(page.locator('[data-hero="home"] [data-art-frame]')).toHaveCount(0);
  await expect(page.locator('[data-hero="home"] .shape-arch')).toHaveCount(0);
  await expect(page.locator('[data-hero="home"]')).toContainText(
    'Your stylist and the front desk both say yes before anything is final.',
  );
  await expect(page.locator('[data-home-backdrop]')).toHaveCount(1);
});

test('home: at four scroll positions the background is Alankar, Salon, Spa, Parlor in order', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const nav = page.getByRole('navigation', { name: 'Home sections' });
  const seen: string[] = [];
  for (const [id, chapter, slot] of SECTIONS) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.evaluate((target) => {
      const el = document.getElementById(target)!;
      window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top);
    }, id);
    await expect.poll(() => chapterOf(page)).toBe(chapter);
    await expect.poll(() => currentSlot(page)).toBe(slot);
    seen.push((await currentSlot(page)) ?? '');
    // the side indicator agrees
    await expect(nav.locator('[aria-current]')).toHaveCount(1);
    await expect(nav.locator('[aria-current]')).toHaveAttribute('aria-label', slotLabel(chapter));
  }
  expect(seen).toEqual(['shopBackground', 'salonBackground', 'spaBackground', 'parlorBackground']);
  // only the current and the next picture are loaded
  expect(await page.locator('[data-home-layer] img').count()).toBeLessThanOrEqual(3);
});

const slotLabel = (chapter: string) => ['Alankar', 'Salon', 'Spa', 'Parlor'][Number(chapter) - 1]!;

test('home: the side indicator jumps on click and on the keyboard', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Home sections' });
  await nav.getByRole('button', { name: 'Parlor' }).click();
  await expect.poll(() => chapterOf(page)).toBe('4');
  await nav.getByRole('button', { name: 'Spa' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => chapterOf(page)).toBe('3');
  await nav.getByRole('button', { name: 'Salon' }).focus();
  await page.keyboard.press('Space');
  await expect.poll(() => chapterOf(page)).toBe('2');
});

test('home: division sections show real services and booking buttons', async ({ page }) => {
  await page.goto('/');
  for (const [id, label] of [
    ['home-salon', 'Book salon'],
    ['home-spa', 'Book spa'],
    ['home-parlor', 'Book beauty parlor'],
  ] as const) {
    const section = page.locator(`#${id}`);
    await expect(section.getByRole('link', { name: label })).toBeVisible();
    expect(await section.locator('ul li').count()).toBeGreaterThan(0);
  }
  await expect(page.getByText('Independent portfolio project')).toBeVisible();
});

test('home: with reduced motion nothing zooms', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  const name = await page
    .locator('.home-zoom')
    .first()
    .evaluate((e) => getComputedStyle(e).animationName);
  expect(name).toBe('none');
  await context.close();
});

for (const scheme of ['light', 'dark'] as const) {
  for (const transparency of ['glass', 'reduced'] as const) {
    test(`home: axe over each of the four photos (${scheme}, ${transparency})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        colorScheme: scheme,
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();
      if (transparency === 'reduced') {
        await page.addInitScript(() =>
          window.localStorage.setItem(
            'salon-display',
            JSON.stringify({ reduceTransparency: true }),
          ),
        );
      }
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      for (const [id, chapter] of SECTIONS) {
        await page.evaluate((target) => {
          const el = document.getElementById(target)!;
          window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top);
        }, id);
        await expect.poll(() => chapterOf(page)).toBe(chapter);
        await page.waitForTimeout(1300); // the crossfade has finished
        await axe(page, `home ${id} ${scheme} ${transparency}`);
      }
      await context.close();
    });
  }
}

test('other pages: the Alankar reception photo, no header strip, nothing but a background', async ({
  browser,
}) => {
  const s = await signIn(browser, 'customer', { width: 1280, height: 800 });
  for (const path of [
    '/customer-dashboard',
    '/customer/appointments',
    '/customer/chat',
    '/customer/wallet',
    '/customer/packages',
    '/customer/shop',
    '/customer/orders',
    '/customer/invoices',
    '/customer/profile',
  ]) {
    await s.page.goto(path);
    await expect(backdrop(s.page), path).toHaveAttribute('data-page-backdrop', 'shopBackground');
    await expect(s.page.locator('[data-home-backdrop]')).toHaveCount(0);
    await expect(s.page.locator('[data-page-hero]')).toHaveCount(0);
    await expect(s.page.locator('[data-booking-header]')).toHaveCount(0);
    expect(await decoded(s.page, '[data-page-backdrop] img')).toBe(true);
    // a background, not a second picture: blurred and decorative
    const filter = await s.page
      .locator('[data-page-backdrop] .art-photo')
      .first()
      .evaluate((e) => getComputedStyle(e).filter);
    expect(filter).toMatch(/blur\(10px\)/);
    await expect(s.page.locator('[data-page-backdrop] img').first()).toHaveAttribute('alt', '');
  }
  await s.context.close();
});

test('staff, login, register and For Zenotians also wear the Alankar photo (staff blur more)', async ({
  browser,
}) => {
  const admin = await signIn(browser, 'admin', { width: 1280, height: 800 });
  for (const path of ['/dashboard', '/payroll', '/inventory']) {
    await admin.page.goto(path);
    await expect(backdrop(admin.page), path).toHaveAttribute(
      'data-page-backdrop',
      'shopBackground',
    );
    await expect(backdrop(admin.page)).toHaveAttribute('data-blur', 'strong');
    await expect(admin.page.locator('[data-page-hero]')).toHaveCount(0);
  }
  await admin.context.close();
  const guest = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await guest.newPage();
  for (const path of ['/login', '/register', '/zenotians']) {
    await page.goto(path);
    await expect(backdrop(page), path).toHaveAttribute('data-page-backdrop', 'shopBackground');
  }
  await guest.close();
});

test('division pages wear their own background; the profile page uses only the Alankar photo', async ({
  page,
  browser,
}) => {
  for (const [path, slot] of [
    ['/salon', 'salonBackground'],
    ['/spa', 'spaBackground'],
    ['/beauty-parlor', 'parlorBackground'],
  ] as const) {
    await page.goto(path);
    await expect(backdrop(page), path).toHaveAttribute('data-page-backdrop', slot);
  }
  const s = await signIn(browser, 'customer', { width: 1280, height: 800 });
  await s.page.goto('/customer/profile');
  await expect(s.page.locator('main [data-art-frame]')).toHaveCount(0);
  await expect(backdrop(s.page)).toHaveAttribute('data-page-backdrop', 'shopBackground');
  await s.context.close();
});

test('booking: switching Salon, Spa, Parlor and All changes the background, tint and header', async ({
  browser,
}) => {
  const s = await signIn(browser, 'customer', { width: 1280, height: 800 });
  const { page } = s;
  await page.goto('/customer/book');
  const chips = page.getByRole('group', { name: 'Division' });
  for (const [label, slot, theme, header] of [
    ['Salon', 'salonBackground', 'salon', 'salon'],
    ['Spa', 'spaBackground', 'spa', 'spa'],
    ['Beauty Parlor', 'parlorBackground', 'parlor', 'beauty-parlor'],
    ['All', 'shopBackground', null, 'all'],
  ] as const) {
    await chips.getByRole('button', { name: label }).click();
    await expect(backdrop(page).last(), label).toHaveAttribute('data-page-backdrop', slot);
    if (theme) await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('[data-booking-header]')).toHaveAttribute(
      'data-booking-header',
      header,
    );
    // the framed header is a different picture or crop from the background
    const headerImg = page.locator('[data-booking-header] img');
    const backgroundImg = page.locator('[data-page-backdrop] img').last();
    const [h, b] = await Promise.all([
      headerImg.getAttribute('src'),
      backgroundImg.getAttribute('src'),
    ]);
    const pos = await page
      .locator('[data-booking-header] [data-art-frame]')
      .evaluate((e) => e.style.getPropertyValue('--art-pos'));
    expect(h !== b || pos !== '50% 50%').toBe(true);
    expect(await decoded(page, '[data-booking-header] img')).toBe(true);
  }
  await s.context.close();
});

for (const scheme of ['light', 'dark'] as const) {
  for (const reducedTransparency of [false, true]) {
    test(`booking and an Alankar page: axe over each photo (${scheme}, ${reducedTransparency ? 'reduced transparency' : 'glass'})`, async ({
      browser,
    }) => {
      const s = await signIn(
        browser,
        'customer',
        { width: 1280, height: 800 },
        { colorScheme: scheme, reducedTransparency },
      );
      const { page } = s;
      await page.goto('/customer/book');
      const chips = page.getByRole('group', { name: 'Division' });
      for (const label of ['Salon', 'Spa', 'Beauty Parlor', 'All']) {
        await chips.getByRole('button', { name: label }).click();
        await page.waitForTimeout(1000); // the crossfade has finished
        await axe(page, `booking ${label} ${scheme} ${reducedTransparency}`);
      }
      await page.goto('/customer/wallet');
      await axe(page, `wallet ${scheme} ${reducedTransparency}`);
      await s.context.close();
    });
  }
}

test('booking and staff pages do not shift the layout', async ({ browser }) => {
  const s = await signIn(browser, 'customer', { width: 375, height: 700 });
  await s.page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[]) {
        if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await s.page.goto('/customer/book');
  await s.page.waitForLoadState('networkidle');
  const cls = await s.page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  expect(cls).toBeLessThan(0.1);
  await s.context.close();
});
