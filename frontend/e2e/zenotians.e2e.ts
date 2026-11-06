import { expect, test } from '@playwright/test';
import { ZENOTIANS_PAGES } from './pages';

/** Task 9: the For Zenotians page in a real browser (seeded content from the migration). */

test('every section opens, has a heading and a title of its own, and logs no errors', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  const titles = new Set<string>();
  for (const path of ZENOTIANS_PAGES) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.locator('#zen-content')).not.toBeEmpty();
    titles.add(await page.title());
  }
  expect(titles.size).toBe(ZENOTIANS_PAGES.length);
  expect(problems).toEqual([]);
});

test('the phone number from the resume is not on the page and links are safe', async ({ page }) => {
  for (const path of ['/zenotians/about/summary', '/zenotians/contact']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await page.content()).not.toContain('9063946939');
  }
  const bad = await page.$$eval(
    'a[target="_blank"]',
    (links) => links.filter((l) => !(l.getAttribute('rel') ?? '').includes('noopener')).length,
  );
  expect(bad).toBe(0);
});

test('share tags are set for each section', async ({ page }) => {
  await page.goto('/zenotians/mapping');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /How it maps/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary');
});

test('About me opens from the keyboard and the active item is marked', async ({ page }) => {
  await page.goto('/zenotians');
  const toggle = page.getByRole('button', { name: 'About me' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('link', { name: 'Education' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/zenotians\/about\/education$/);
  await expect(page.getByRole('link', { name: 'Education' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('on a phone the sections open in a drawer and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto('/zenotians');
  await page.getByRole('button', { name: 'Sections' }).click();
  const drawer = page.getByRole('dialog', { name: 'For Zenotians' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('link', { name: 'The project' }).click();
  await expect(page).toHaveURL(/\/zenotians\/project$/);
  await expect(drawer).toBeHidden();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
});

test('the old Future vision address goes to the overview and nothing mentions it', async ({
  page,
}) => {
  await page.goto('/zenotians/vision');
  await expect(page).toHaveURL(/\/zenotians$/);
  await expect(page.getByText(/Future vision/i)).toHaveCount(0);
});

test('A day at Alankar: seven chapters, each with a picture and a note on the code', async ({
  page,
}) => {
  await page.goto('/zenotians/day');
  await expect(page.getByRole('heading', { level: 1, name: 'A day at Alankar' })).toBeVisible();
  await expect(page.locator('svg[role="img"]')).toHaveCount(7);
  await expect(page.getByText('What’s behind this')).toHaveCount(7);
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByText('Chapter 2 of 7')).toBeVisible();
  await page.getByRole('group', { name: 'Story controls' }).press('ArrowRight');
  await expect(page.getByText('Chapter 3 of 7')).toBeVisible();
  await page.getByRole('button', { name: /Play the 90-second walkthrough/ }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});

test('Limitations lists what it does today and what is out of scope', async ({ page }) => {
  await page.goto('/zenotians/limitations');
  await expect(page.getByRole('heading', { level: 1, name: 'Limitations' })).toBeVisible();
  await expect(page.getByText('What it does today').first()).toBeVisible();
  await expect(page.getByText('What is out of scope').first()).toBeVisible();
});
