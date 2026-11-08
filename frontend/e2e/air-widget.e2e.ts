import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settle, signIn } from './helpers';

/**
 * AIR Task 2: the "AI Alankar Intelligence" chat with AIR, the virtual receptionist.
 * Runs in basic mode (no AI key): nothing here sends a booking request or places an order.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const WIDTHS = [320, 375, 768, 1280];

async function openChat(page: Page) {
  await page.getByRole('button', { name: 'Open AI Alankar Intelligence' }).click();
  const dialog = page.getByRole('dialog', { name: 'AI Alankar Intelligence' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('AIR · virtual receptionist')).toBeVisible();
  return dialog;
}

async function noSideways(page: Page, label: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, `${label}: page scrolls sideways by ${over}px`).toBeLessThanOrEqual(0);
  const box = await page.getByRole('dialog').boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box && box.x >= 0 && box.x + box.width <= width, `${label}: chat fits the screen`).toBe(
    true,
  );
}

for (const width of WIDTHS) {
  test(`the chat fits a ${width}px screen and has no serious axe violations`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width, height: 720 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForLoadState('load');
    await settle(page);
    await openChat(page);
    await noSideways(page, `${width}px`);
    const result = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(TAGS)
      .analyze();
    const worst = result.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} x${v.nodes.length}`);
    expect(worst).toEqual([]);
    await context.close();
  });
}

test('a customer gets real slot chips and a summary card in basic mode, nothing is sent', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const s = await signIn(browser, 'customer', { width: 375, height: 740 });
  await s.page.goto('/customer/appointments');
  const dialog = await openChat(s.page);
  // Every tap waits for the server's answer before looking at the screen again.
  const tap = async (button: import('@playwright/test').Locator) => {
    await Promise.all([
      s.page.waitForResponse((r) => r.url().includes('/api/air/chat/'), { timeout: 30_000 }),
      button.click(),
    ]);
    await expect(dialog.getByRole('status')).toHaveCount(0); // the reply is drawn
  };
  await tap(dialog.getByRole('button', { name: 'Book a haircut' }));
  // Answer each follow-up with its first chip until the summary card appears (or nothing is free).
  // "Change" is never tapped here: it would (correctly) retire the card.
  const card = dialog.getByRole('region', { name: 'Booking summary' });
  for (let step = 0; step < 5 && !(await card.isVisible()); step += 1) {
    const choices = dialog
      .getByRole('list', { name: 'Choices' })
      .getByRole('button')
      .filter({ hasNotText: /^Change$/ });
    if ((await choices.count()) === 0) break;
    await tap(choices.first());
  }
  if (await card.isVisible()) {
    await expect(card.getByText(/incl\. GST/)).toBeVisible();
    await expect(card.getByRole('button', { name: 'Send request' })).toBeEnabled();
    await expect(card.getByText(/Not booked yet/)).toBeVisible();
    await noSideways(s.page, 'customer 375px');
    await card.getByRole('button', { name: 'Change' }).click(); // releases the hold; nothing sent
  }
  await s.context.close();
});

test('staff do not get the chat at all', async ({ browser }) => {
  const s = await signIn(browser, 'receptionist');
  await expect(s.page.getByRole('button', { name: /AI Alankar Intelligence/ })).toHaveCount(0);
  await s.context.close();
});
