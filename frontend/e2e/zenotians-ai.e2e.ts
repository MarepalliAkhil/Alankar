import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * For Zenotians: the AIR and AI Alankar Intelligence sections and the layout fixes, in a real
 * browser. Screenshots go to mobile-screens/zenotians/ (git-ignored).
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

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function rows(page: Page, section: string) {
  const list = page.locator(`#zen-sec-${section} .zen-row`);
  await expect(list.first()).toBeVisible();
  return list;
}

test('the two menu entries sit directly below "The project" and follow scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/for-zenotians');
  const menu = page.getByRole('navigation', { name: 'For Zenotians sections' });
  await expect(menu.getByRole('link', { name: 'AI Alankar Intelligence' })).toBeVisible();
  const labels = (await menu.getByRole('link').allTextContents()).map((t) => t.trim());
  const at = labels.indexOf('The project');
  expect(labels.slice(at, at + 3)).toEqual([
    'The project',
    'AIR, the AI receptionist',
    'AI Alankar Intelligence',
  ]);
  await menu.getByRole('link', { name: 'AIR, the AI receptionist' }).click();
  await expect(page).toHaveURL(/\/for-zenotians\/air$/);
  await page.locator('#zen-sec-ai-intelligence').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.getElementById('zen-sec-ai-intelligence')!.scrollIntoView());
  await expect(menu.getByRole('link', { name: 'AI Alankar Intelligence' })).toHaveAttribute(
    'aria-current',
    'location',
  );
});

test('rows are two columns at 1280 px, with a picture and alt text', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/for-zenotians/air');
  const list = await rows(page, 'air');
  const count = await list.count();
  expect(count).toBe(9);
  for (let i = 0; i < count; i += 1) {
    const row = list.nth(i);
    await row.scrollIntoViewIfNeeded();
    await expect(row.locator('h3')).toBeVisible();
    await expect(row.locator('.zen-row__text')).toBeVisible();
    const img = row.locator('img');
    if ((await img.count()) > 0) {
      expect((await img.getAttribute('alt'))?.length ?? 0).toBeGreaterThan(10);
      const title = await row.locator('h3').boundingBox();
      const picture = await row.locator('.zen-row__image').boundingBox();
      expect(picture!.x).toBeGreaterThan(title!.x + title!.width / 2); // picture on the right
      const natural = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
      expect(natural).toBeGreaterThan(0);
    }
  }
});

test('AI Alankar Intelligence has six AI rows and no AIR content', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/for-zenotians/ai-intelligence');
  const list = await rows(page, 'ai-intelligence');
  await expect(list).toHaveCount(6);
  await expect(list.locator('h3')).toHaveText([
    'Understanding natural language',
    'Finding the intent',
    'Answering from knowledge',
    'Measured, not guessed',
    'Optional language model, safely',
    'Privacy by design',
  ]);
  const text = (await page.locator('#zen-sec-ai-intelligence').innerText()) ?? '';
  expect(text).not.toMatch(/\bAIR\b|receptionist|front desk|booking desk/i);
  for (let i = 0; i < 6; i += 1) {
    const row = list.nth(i);
    await row.scrollIntoViewIfNeeded();
    await expect(row.locator('.zen-row__text')).toBeVisible();
    const img = row.locator('img');
    if ((await img.count()) > 0) {
      expect((await img.getAttribute('alt'))?.length ?? 0).toBeGreaterThan(10);
      expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    }
  }
});

test('rows stack at 390 px (heading, picture, words) and nothing scrolls sideways at 320 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/for-zenotians/air');
  const row = (await rows(page, 'air')).first();
  await row.scrollIntoViewIfNeeded();
  const title = await row.locator('h3').boundingBox();
  const picture = await row.locator('.zen-row__image').boundingBox();
  const text = await row.locator('.zen-row__text').boundingBox();
  expect(picture!.y).toBeGreaterThan(title!.y);
  expect(text!.y).toBeGreaterThan(picture!.y);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'mobile-screens/zenotians/for-zenotians-390.png', fullPage: true });
  await page.locator('#zen-sec-air').screenshot({ path: 'mobile-screens/zenotians/air-390.png' });
  await page
    .locator('#zen-sec-ai-intelligence')
    .screenshot({ path: 'mobile-screens/zenotians/ai-intelligence-390.png' });
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of ['/for-zenotians', '/for-zenotians/air', '/for-zenotians/ai-intelligence']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await overflow(page), path).toBeLessThanOrEqual(0);
  }
});

test('the rows slide in as they enter, and simply appear with reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/for-zenotians');
  const list = page.locator('#zen-sec-air .zen-rows');
  await expect(list).toHaveAttribute('data-row-motion', 'on');
  await page.locator('#zen-sec-air').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.getElementById('zen-sec-air')!.scrollIntoView());
  await expect(list.locator('.zen-row').first()).toHaveAttribute('data-shown', '');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/for-zenotians/air');
  await expect(page.locator('#zen-sec-air .zen-rows')).not.toHaveAttribute('data-row-motion', 'on');
  const opacity = await page
    .locator('#zen-sec-air .zen-row__text')
    .first()
    .evaluate((el) => getComputedStyle(el).opacity);
  expect(opacity).toBe('1');
});

test('exactly one visible H1 and no tall gap above the paragraph', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/for-zenotians');
  const h1 = page.locator('h1');
  await expect(h1).toHaveCount(1);
  await expect(h1).toBeVisible();
  // The words of the headline finish their entrance and end fully visible.
  await expect
    .poll(() =>
      h1.evaluate((el) =>
        Math.min(
          ...Array.from(el.querySelectorAll('.zen-word')).map((w) =>
            Number(getComputedStyle(w).opacity),
          ),
        ),
      ),
    )
    .toBe(1);
});

test('the numbers never break a label inside a word', async ({ page }) => {
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/for-zenotians');
    const labels = page.locator('.zen-numbers .zen-number-label.font-semibold');
    await expect(labels.first()).toBeVisible();
    const broken = await labels.evaluateAll((els) =>
      els
        .filter((el) => {
          // A label whose longest word is wider than its box would be broken inside the word.
          return el.scrollWidth > el.clientWidth + 1;
        })
        .map((el) => el.textContent),
    );
    expect(broken, `${width}px`).toEqual([]);
    const wrap = await labels.first().evaluate((el) => getComputedStyle(el).overflowWrap);
    expect(wrap).toBe('normal');
  }
});

test('axe is clean on the two new sections', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/for-zenotians/air');
    await page.waitForLoadState('networkidle');
    const axe = await new AxeBuilder({ page })
      .include('#zen-sec-air')
      .include('#zen-sec-ai-intelligence')
      .include('#zen-sec-overview')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(
      axe.violations.map((v) => `${v.id}: ${v.help}`),
      `${width}px`,
    ).toEqual([]);
  }
});
