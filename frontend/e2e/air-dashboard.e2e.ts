import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settle, signIn } from './helpers';

/**
 * AIR Task 3: the AIR Activity page (receptionist and admin) and the receptionist's AIR popup.
 * Works with an empty AIR log too (the page then shows zeros and "nothing needs you").
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function serious(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  if (include) builder.include(include);
  const result = await builder.analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} x${v.nodes.length}`);
}

/** Signing in already showed (and so used up) the once-per-login popup: forget that, then load. */
async function freshLoad(page: Page, path: string) {
  await page.evaluate(() => {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith('air-popup-shown:'))
      .forEach((key) => window.localStorage.removeItem(key));
  });
  await page.goto(path);
}

async function noSideways(page: Page, label: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, `${label}: page scrolls sideways by ${over}px`).toBeLessThanOrEqual(0);
}

test('the receptionist sees the AIR popup once, can close and reopen it, and it is accessible', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const s = await signIn(
    browser,
    'receptionist',
    { width: 1280, height: 800 },
    {
      airPopup: true,
      reducedMotion: true,
    },
  );
  await freshLoad(s.page, '/dashboard');
  const popup = s.page.getByRole('dialog', { name: /While you were away|A quiet session/ });
  await expect(popup).toBeVisible({ timeout: 30_000 });
  await expect(popup.getByText(/Since your last session AIR/).first()).toBeVisible();
  expect(await popup.textContent()).not.toMatch(/\d{10}|@/); // no phone numbers or emails
  expect(await serious(s.page, '[data-air-popup]')).toEqual([]);

  // The picture: the file really downloaded is sharp enough and never stretched.
  const img = popup.locator('[data-air-pose] img');
  if (await img.count()) {
    const probe = await img.evaluate(async (el: HTMLImageElement) => {
      await el.decode().catch(() => undefined);
      const fresh = new Image(); // the real pixels of the chosen file (never naturalWidth+srcset)
      fresh.src = el.currentSrc;
      await fresh.decode();
      const box = el.getBoundingClientRect();
      return {
        src: el.currentSrc,
        real: fresh.naturalWidth,
        realH: fresh.naturalHeight,
        css: box.width,
        cssH: box.height,
        dpr: window.devicePixelRatio,
        fit: getComputedStyle(el).objectFit,
      };
    });
    expect(probe.src).toMatch(/\/photos\/air\/air-.*\.webp$/);
    expect(probe.real).toBe(probe.realH); // square file
    expect(probe.fit).toBe('contain'); // never stretched
    expect(probe.real * 1.25).toBeGreaterThanOrEqual(probe.css * probe.dpr);
  }

  await s.page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await s.page.reload();
  await settle(s.page);
  await expect(
    s.page.getByRole('dialog', { name: /While you were away|A quiet session/ }),
  ).toBeHidden();
  await s.page.getByRole('button', { name: /Open AIR/ }).click();
  await expect(
    s.page.getByRole('dialog', { name: /While you were away|A quiet session/ }),
  ).toBeVisible();
  await s.context.close();
});

test('on a phone the popup is a bottom sheet and the page fits 320 px', async ({ browser }) => {
  test.setTimeout(120_000);
  const s = await signIn(
    browser,
    'receptionist',
    { width: 320, height: 700 },
    {
      airPopup: true,
      reducedMotion: true,
    },
  );
  await freshLoad(s.page, '/air-activity');
  const popup = s.page.locator('[data-air-popup]');
  await expect(popup).toBeVisible({ timeout: 30_000 });
  await expect(popup).toHaveAttribute('data-layout', 'sheet');
  const box = await popup.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 320).toBe(true);
  await s.page.keyboard.press('Escape');
  await expect(s.page.getByRole('heading', { name: 'AIR Activity' })).toBeVisible();
  await settle(s.page);
  await noSideways(s.page, '/air-activity at 320 px');
  await s.context.close();
});

for (const who of ['receptionist', 'admin'] as const) {
  test(`${who}: AIR Activity has the needs-you list, charts with tables and no serious axe issues`, async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const s = await signIn(browser, who, { width: 1280, height: 900 }, { reducedMotion: true });
    await s.page.goto('/air-activity');
    await expect(s.page.getByRole('heading', { name: 'AIR Activity' })).toBeVisible();
    await expect(s.page.getByRole('heading', { name: /Needs you/ })).toBeVisible({
      timeout: 30_000,
    });
    for (const title of [
      'Actions by hour',
      'Booking funnel',
      'Payment links',
      'Stylist responses',
    ]) {
      // The table sits in a "Show the numbers as a table" fold (present, not always open). A
      // chart with nothing to show (an empty range) shows a "No ..." message instead of a table.
      const card = s.page.getByRole('region', { name: title }).first();
      await expect(
        card.locator('table').or(card.getByRole('heading', { name: /^No / })),
      ).toHaveCount(1);
    }
    await expect(
      s.page.getByRole('table', { name: 'What AIR did' }).or(s.page.getByText('Nothing here')),
    ).toBeVisible();
    const settingsTab = s.page.getByRole('tab', { name: 'AIR settings' });
    if (who === 'admin') {
      await settingsTab.click();
      await expect(s.page.getByText(/AI key configured/)).toBeVisible();
      await expect(s.page.getByLabel('Stylist timeout (minutes)')).toBeVisible();
    } else {
      await expect(settingsTab).toHaveCount(0);
    }
    await settle(s.page);
    expect(await serious(s.page)).toEqual([]);
    await s.context.close();
  });
}

test('customers and stylists have no AIR Activity page', async ({ browser }) => {
  for (const who of ['customer', 'stylist'] as const) {
    const s = await signIn(browser, who);
    await s.page.goto('/air-activity');
    await expect(s.page.getByRole('heading', { name: 'AIR Activity' })).toHaveCount(0);
    await s.context.close();
  }
});
