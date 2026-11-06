import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { api, signIn } from './helpers';

/** Task 15D and 17E: the first-run guided tour with Meera for customers (server-side progress, a11y, phone). */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function freshCustomer(browser: import('@playwright/test').Browser, width: number) {
  const s = await signIn(
    browser,
    'customer',
    { width, height: width < 500 ? 720 : 800 },
    { tour: true },
  );
  await api(s.page, 'DELETE', '/api/auth/tours/?key=tour:customer');
  await s.page.reload();
  return s;
}

async function axe(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const worst = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    worst.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

test('desktop: starts by itself, walks the real sidebar items with Meera, ends with a celebration', async ({
  browser,
}) => {
  const { page, context } = await freshCustomer(browser, 1280);
  const card = page.locator('[data-tour-card]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Chapter 1 of 7');
  await expect(card.locator('[data-meera="wave"]')).toBeVisible();
  await expect(card.locator('[data-dot]')).toHaveCount(7);
  await axe(page, 'chapter 1');
  // The card docks bottom-left of the content, never over the sidebar.
  const box = await card.boundingBox();
  const side = await page.locator('aside').first().boundingBox();
  expect(box && side && box.x >= side.x + side.width).toBe(true);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(card.getByRole('heading', { name: 'Pick a service' })).toBeVisible();
  await expect(card.locator('[data-meera="point"]')).toBeVisible();
  await expect(page.locator('.tour-spot')).toBeVisible();
  await axe(page, 'chapter 2');
  for (let i = 2; i < 7; i++) await page.getByRole('button', { name: 'Next' }).click();
  await expect(card).toContainText('Chapter 7 of 7');
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(card.locator('[data-meera="celebrate"]')).toBeVisible();
  await axe(page, 'finale');
  await page.getByRole('button', { name: 'Book your first visit' }).click();
  await expect(page).toHaveURL(/\/customer\/book/);
  await expect(card).toHaveCount(0);
  // Completion is stored on the server: it does not start again.
  const read = page.waitForResponse(
    (r) => r.url().includes('/api/auth/tours/') && r.request().method() === 'GET',
  );
  await page.reload();
  await read;
  await expect(page.getByRole('button', { name: 'Take the tour' })).toBeVisible();
  await expect(card).toHaveCount(0);
  await context.close();
});

test('"Not now" is remembered on the server, Escape closes, and the tour can be restarted', async ({
  browser,
}) => {
  const { page, context } = await freshCustomer(browser, 1280);
  // Wait until the answer has reached the server before reloading (a reload cancels a request in
  // flight), then wait for the page to have read it back.
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/auth/tours/') && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Not now' }).click();
  await saved;
  const read = page.waitForResponse(
    (r) => r.url().includes('/api/auth/tours/') && r.request().method() === 'GET',
  );
  await page.reload();
  await read;
  await expect(page.locator('[data-tour-card]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Take the tour' }).click();
  await expect(page.locator('[data-tour-card]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-tour-card]')).toHaveCount(0);
  await context.close();
});

test('Skip leaves the tour', async ({ browser }) => {
  const { page, context } = await freshCustomer(browser, 1280);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('[data-tour-card]')).toHaveCount(0);
  await context.close();
});

test('phone: a bottom sheet, the menu drawer opens and the real item is highlighted', async ({
  browser,
}) => {
  const { page, context } = await freshCustomer(browser, 375);
  const card = page.locator('[data-tour-card]');
  await expect(card).toBeVisible();
  const first = await card.boundingBox();
  expect(first && first.y + first.height).toBeGreaterThan(700); // docked to the bottom edge
  await axe(page, 'phone chapter 1');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(card.getByRole('heading', { name: 'Pick a service' })).toBeVisible();
  await expect(page.locator('.tour-spot')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await axe(page, 'phone chapter 2');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0);
  await context.close();
});

for (const width of [375, 768, 1280]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`card layout at ${width}px (${scheme}): inside the window, stage keeps its shape, nothing overlaps`, async ({
      browser,
    }) => {
      const s = await signIn(
        browser,
        'customer',
        { width, height: width < 500 ? 720 : 800 },
        { tour: true, colorScheme: scheme },
      );
      const { page, context } = s;
      await api(page, 'DELETE', '/api/auth/tours/?key=tour:customer');
      await page.reload();
      const card = page.locator('[data-tour-card]');
      await expect(card).toBeVisible();
      for (let chapter = 1; chapter <= 7; chapter++) {
        await expect(card).toContainText(`Chapter ${chapter} of 7`);
        // reduced motion is not forced here: wait for the typing to finish before measuring
        await expect(card.locator('[data-bubble]')).toHaveAttribute('data-state', 'done', {
          timeout: 8000,
        });
        const box = (await card.boundingBox())!;
        const vp = page.viewportSize()!;
        expect(box.x).toBeGreaterThanOrEqual(-0.5);
        expect(box.y).toBeGreaterThanOrEqual(-0.5);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
        expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);
        if (width <= 640)
          expect(Math.round(box.width)).toBe(vp.width); // a full-width sheet
        else expect(box.width).toBeLessThanOrEqual(520.5);
        // no horizontal overflow on the page
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(
          0,
        );
        // the stage keeps its 4:5 shape (Meera's picture or the glass "M" circle)
        const stage = (await card.locator('[data-meera-stage]').boundingBox())!;
        expect(Math.abs(stage.width / stage.height - 0.8)).toBeLessThan(0.02);
        expect(stage.width).toBeGreaterThanOrEqual(119);
        expect(stage.width).toBeLessThanOrEqual(201);
        // the bubble text is never clipped
        const clipped = await card
          .locator('[data-bubble]')
          .evaluate((e) => e.scrollHeight > e.clientHeight + 1);
        expect(clipped).toBe(false);
        // buttons are at least 40 px high and never overlap each other
        const buttons = await card.getByRole('button').all();
        const rects = [];
        for (const b of buttons) {
          const r = (await b.boundingBox())!;
          expect(r.height).toBeGreaterThanOrEqual(39.5);
          rects.push(r);
        }
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i]!;
            const b = rects[j]!;
            const overlap =
              a.x < b.x + b.width &&
              b.x < a.x + a.width &&
              a.y < b.y + b.height &&
              b.y < a.y + a.height;
            expect(overlap, `buttons ${i} and ${j} at chapter ${chapter}`).toBe(false);
          }
        }
        if (chapter < 7) await page.getByRole('button', { name: 'Next' }).click();
      }
      await axe(page, `layout ${width} ${scheme}`);
      await context.close();
    });
  }
}

test('speaking dots appear before the line, a connector links the bubble to the real control, reduced motion is instant and static', async ({
  browser,
}) => {
  const { page, context } = await freshCustomer(browser, 1280);
  const card = page.locator('[data-tour-card]');
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(card).toContainText('Chapter 2 of 7');
  await expect(card.locator('[data-bubble]')).toHaveAttribute('data-state', 'typing');
  await expect(card.locator('[data-typing]')).toBeVisible();
  await expect(card.locator('[data-bubble]')).not.toHaveAttribute('data-state', 'typing');
  await expect(card.locator('[data-speech]')).toBeVisible();
  // a target is visible, so the dotted connector is drawn (the spotlight stays)
  const line = page.locator('[data-tour-connector] line');
  await expect(line).not.toHaveAttribute('visibility', 'hidden');
  await expect(page.locator('.tour-spot')).toBeVisible();
  // the card sits in the corner farthest from the target, not over it
  const spot = (await page.locator('.tour-spot').boundingBox())!;
  const box = (await card.boundingBox())!;
  const overlap =
    spot.x < box.x + box.width &&
    box.x < spot.x + spot.width &&
    spot.y < box.y + box.height &&
    box.y < spot.y + spot.height;
  expect(overlap).toBe(false);
  await context.close();
});

test('reduced motion: the line is shown at once and the connector is static', async ({
  browser,
}) => {
  const s = await signIn(
    browser,
    'customer',
    { width: 1280, height: 800 },
    { tour: true, reducedMotion: true },
  );
  await api(s.page, 'DELETE', '/api/auth/tours/?key=tour:customer');
  await s.page.reload();
  const card = s.page.locator('[data-tour-card]');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-bubble]')).toHaveAttribute('data-state', 'done');
  await expect(card.locator('[data-typing]')).toHaveCount(0);
  const animation = await s.page
    .locator('[data-tour-connector] line')
    .evaluate((e) => getComputedStyle(e).animationName);
  expect(animation).toBe('none');
  await s.context.close();
});

test('page tips show once and stay dismissed', async ({ browser }) => {
  const { page, context } = await freshCustomer(browser, 1280);
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/auth/tours/') && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Not now' }).click();
  await saved;
  await api(page, 'DELETE', '/api/auth/tours/?key=tip:booking');
  await page.goto('/customer/book');
  const tip = page.locator('[data-page-tip="booking"]');
  await expect(tip).toBeVisible();
  await tip.getByRole('button', { name: /Dismiss tip/ }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Book an appointment/ })).toBeVisible();
  await expect(tip).toHaveCount(0);
  await context.close();
});
