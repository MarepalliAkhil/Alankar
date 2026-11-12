import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ZENOTIANS_PAGES } from './pages';

/**
 * The For Zenotians page in a real browser (seeded content from the migration). It is ONE page:
 * every section address opens the same page at that section, with one title and one H1.
 */

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      window.sessionStorage.setItem('alankar-splash-seen', '1');
    } catch {
      // automated browsers skip the splash anyway
    }
  });
});

test('every section address opens the one page at that section, and logs no errors', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  const titles = new Set<string>();
  for (const path of ZENOTIANS_PAGES) {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('#zen-content')).not.toBeEmpty();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/for-zenotians$/);
    titles.add(await page.title());
  }
  expect(titles.size).toBe(1);
  expect(problems).toEqual([]);
});

test('the phone number from the resume is not on the page and links are safe', async ({ page }) => {
  await page.goto('/for-zenotians');
  await page.waitForLoadState('networkidle');
  expect(await page.content()).not.toContain('9063946939');
  const bad = await page.$$eval(
    'a[target="_blank"]',
    (links) => links.filter((l) => !(l.getAttribute('rel') ?? '').includes('noopener')).length,
  );
  expect(bad).toBe(0);
});

test('share tags are the page’s own on every section address', async ({ page }) => {
  await page.goto('/for-zenotians/mapping');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    /For Zenotians/,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );
});

test('About me opens from the keyboard and the active item is marked', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/for-zenotians');
  const menu = page.getByRole('navigation', { name: 'For Zenotians sections' });
  const toggle = menu.getByRole('button', { name: 'About me' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await menu.getByRole('link', { name: 'Education' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/for-zenotians\/about\/education$/);
  await expect(menu.getByRole('link', { name: 'Education' })).toHaveAttribute(
    'aria-current',
    'location',
  );
  await expect(page.locator('#zen-about-education h3')).toBeFocused();
});

test('scrolling moves the menu and the address without adding history entries', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/for-zenotians');
  const before = await page.evaluate(() => window.history.length);
  await page.locator('#zen-sec-limitations').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.getElementById('zen-sec-limitations')!.scrollIntoView());
  await expect(page).toHaveURL(/\/for-zenotians\/limitations$/);
  await expect(
    page
      .getByRole('navigation', { name: 'For Zenotians sections' })
      .getByRole('link', { name: 'Limitations' }),
  ).toHaveAttribute('aria-current', 'location');
  expect(await page.evaluate(() => window.history.length)).toBe(before);
});

test('on a phone: the sticky section bar, Next and Previous, the drawer, no sideways scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/for-zenotians');
  const bar = page.locator('[data-zen-bar]');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('1 of');
  await bar.getByRole('button', { name: /^Next:/ }).click();
  await expect(bar).toContainText('2 of');
  await page.mouse.wheel(0, 2400);
  await expect(bar).toBeVisible(); // sticky under the navbar
  await bar.getByRole('button', { name: /^Sections:/ }).click();
  const drawer = page.getByRole('dialog', { name: 'For Zenotians' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('link', { name: 'The project' }).click();
  await expect(page).toHaveURL(/\/for-zenotians\/project$/);
  await expect(drawer).toBeHidden();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
});

test('the old addresses still work', async ({ page }) => {
  await page.goto('/for-zenotians/vision');
  await expect(page).toHaveURL(/\/for-zenotians$/);
  await expect(page.getByText(/Future vision/i)).toHaveCount(0);
  await page.goto('/zenotians/limitations');
  await expect(page).toHaveURL(/\/for-zenotians\/limitations$/);
  await expect(page.locator('#zen-sec-limitations')).toBeInViewport({ ratio: 0.1 });
});

test('A day at Alankar: seven chapters, each with a picture and a note on the code', async ({
  page,
}) => {
  await page.goto('/for-zenotians/day');
  const day = page.locator('#zen-sec-day');
  await expect(day.getByRole('heading', { level: 2, name: 'A day at Alankar' })).toBeVisible();
  await expect(day.locator('svg[role="img"]')).toHaveCount(7);
  await expect(day.getByText('What’s behind this')).toHaveCount(7);
  await day.getByRole('button', { name: 'Next chapter' }).click();
  await expect(day.getByText('Chapter 2 of 7')).toBeVisible();
  await day.getByRole('group', { name: 'Story controls' }).press('ArrowRight');
  await expect(day.getByText('Chapter 3 of 7')).toBeVisible();
  await day.getByRole('button', { name: /Play the 90-second walkthrough/ }).click();
  await expect(day.getByRole('button', { name: 'Pause' })).toBeVisible();
});

test('Limitations lists what it does today and what is out of scope', async ({ page }) => {
  await page.goto('/for-zenotians/limitations');
  const limits = page.locator('#zen-sec-limitations');
  await expect(limits.getByRole('heading', { level: 2, name: 'Limitations' })).toBeVisible();
  await expect(limits.getByText('What it does today').first()).toBeVisible();
  await expect(limits.getByText('What is out of scope').first()).toBeVisible();
});

test('axe is clean on the one page', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/for-zenotians');
  await page.waitForLoadState('networkidle');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
