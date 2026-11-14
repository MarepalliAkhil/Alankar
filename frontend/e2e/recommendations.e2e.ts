import { expect, test } from '@playwright/test';
import { api, expectForbiddenPage, settle, signIn } from './helpers';

/**
 * Personal recommendations and personal emails in a real browser: the customer's notice and
 * switch, the admin's results page and controls, the campaign preview, and the role checks.
 */

test('the customer sees the one-time notice and can turn suggestions off and on', async ({
  browser,
}) => {
  const { page, context } = await signIn(browser, 'customer');
  await page.goto('/customer-dashboard');
  const block = page.locator('[data-for-you]');
  await expect(block.getByRole('heading', { name: 'For you', level: 2 })).toBeVisible();
  const notice = block.getByRole('note', { name: 'About your suggestions' });
  if (await notice.isVisible()) {
    await expect(notice).toContainText('never use your gender, age, religion');
    await notice.getByRole('button', { name: 'Turn off' }).click();
  } else {
    await page.goto('/customer/profile');
    await page.getByRole('checkbox', { name: /Suggest services, rebook times/ }).uncheck();
    await page.goto('/customer-dashboard');
  }
  await expect(block.getByText(/Personal suggestions are off/)).toBeVisible();
  await block.getByRole('button', { name: 'Turn suggestions on' }).click();
  await expect(block.getByText(/Personal suggestions are off/)).toBeHidden();
  await page.goto('/customer/profile');
  await expect(page.getByRole('heading', { name: 'Personal suggestions' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'My interests' })).toBeVisible();
  await context.close();
});

test('the admin sees results, the evaluation and the controls, and can rebuild', async ({
  browser,
}) => {
  const { page, context } = await signIn(browser, 'admin');
  await page.goto('/recommendations');
  await expect(page.getByRole('heading', { name: 'Recommendations', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Recommendation results by placement' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Offline evaluation' })).toBeVisible();
  await page.getByRole('button', { name: 'Rebuild now' }).click();
  await expect(page.getByText(/^Built /)).toBeVisible();
  await settle(page);
  await context.close();
});

test('the admin previews a personal email without sending it', async ({ browser }) => {
  const { page, context } = await signIn(browser, 'admin');
  await page.goto('/marketing');
  await page.getByRole('tab', { name: 'Campaigns' }).click();
  await page.getByRole('button', { name: /New campaign/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New campaign' });
  await dialog.getByLabel('Name (only you see it)').fill(`Most booked ${Date.now()}`);
  await dialog.getByLabel('Email subject').fill('Our most booked services');
  await dialog.getByLabel('Kind of email').selectOption('most_booked');
  await dialog.getByLabel('Opening text').fill('These are booked most this season.');
  await dialog.getByRole('button', { name: 'Save draft' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Nothing is sent between 21:00 and 09:00/)).toBeVisible();
  await page.getByRole('button', { name: 'Preview and test…' }).first().click();
  const preview = page.getByRole('dialog', { name: 'Preview and test' });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Send a test to me' })).toBeVisible();
  await preview.getByRole('button', { name: 'Close', exact: true }).click();
  await context.close();
});

test('only the admin reaches the recommendation page and its API', async ({ browser }) => {
  for (const who of ['customer', 'receptionist', 'stylist'] as const) {
    const { page, context } = await signIn(browser, who);
    await expectForbiddenPage(page, '/recommendations');
    const response = await api(page, 'GET', '/api/admin/recommendations/');
    expect(response.status(), who).toBe(403);
    await context.close();
  }
  const { page, context } = await signIn(browser, 'stylist');
  const mine = await api(page, 'GET', '/api/my/recommendations/');
  expect(mine.status()).toBe(403);
  await context.close();
});
