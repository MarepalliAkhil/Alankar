/**
 * Coupons at payment (docs/COUPONS.md) in a real browser: the customer sees the coupons they can
 * use, applies one (the total and the live region change, nothing moves), removes it, gets a
 * plain message for an expired code, and pays the lower amount. Also axe and a 390 px phone.
 * Named z-* so it runs after the full-workflow day (it books its own visit).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { api, bookThroughSteps, signIn, type Session } from './helpers';

test.describe.configure({ mode: 'serial' });

const SUFFIX = Date.now().toString(36).slice(-4).toUpperCase();
const SAVE = `E2E10${SUFFIX}`;
const OLD = `E2EOLD${SUFFIX}`;
const FLAT = `E2EF20${SUFFIX}`;
const BIG = `E2EBIG${SUFFIX}`;
const HIDDEN = `E2EHID${SUFFIX}`;

let customer: Session;
let desk: Session;
let stylist: Session;
let admin: Session;
let payUrl = '';

test.beforeAll(async ({ browser }) => {
  customer = await signIn(browser, 'customer');
  desk = await signIn(browser, 'receptionist');
  stylist = await signIn(browser, 'stylist');
  admin = await signIn(browser, 'admin');
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  for (const body of [
    { code: SAVE, name: 'Ten percent', kind: 'percent', value: '10', max_discount: '200' },
    { code: FLAT, name: 'Twenty off', kind: 'flat', value: '20' },
    { code: BIG, name: 'Big order', kind: 'flat', value: '500', min_bill: '99999' },
    { code: HIDDEN, name: 'Private', kind: 'flat', value: '30', listed: false },
    {
      code: OLD,
      name: 'Old offer',
      kind: 'percent',
      value: '20',
      starts_on: '2026-01-01',
      ends_on: yesterday,
    },
  ]) {
    const made = await api(admin.page, 'POST', '/api/admin/marketing/coupons/', body);
    expect(made.status(), await made.text()).toBe(201);
  }
});

test.afterAll(async () => {
  for (const s of [customer, desk, stylist, admin]) await s?.context.close();
});

test('a booking waits for payment', async () => {
  const page = customer.page;
  await page.goto('/customer/book');
  await page.getByRole('link', { name: "Book Men's Haircut" }).click();
  await bookThroughSteps(page, {
    dateIndex: 5,
    stylist: 'Rahul · Senior Hair Stylist',
    time: '3:00 pm',
  });
  await expect(page.getByRole('heading', { name: 'Request sent' })).toBeVisible({
    timeout: 30_000,
  });
  await desk.page.goto('/appointments');
  await desk.page.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await desk.page.getByRole('dialog').getByRole('button', { name: 'Accept request' }).click();
  await expect(desk.page.getByText('You accepted')).toBeVisible();
  await stylist.page.goto('/requests');
  await stylist.page.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await expect(
    stylist.page.getByText('Both sides accepted, so the booking is made.'),
  ).toBeVisible();
  await page.goto('/customer/appointments');
  await page.getByRole('link', { name: 'Pay now' }).first().click();
  await expect(page).toHaveURL(/\/customer\/pay\//);
  payUrl = page.url();
});

test('coupon cards: apply, switch, remove, reasons, private code, then pay', async () => {
  const page = customer.page;
  await page.goto(payUrl);
  const total = page.getByTestId('pay-total');
  const full = (await total.textContent()) ?? '';
  const list = page.getByRole('list', { name: 'Coupons for this payment' });
  await expect(list.locator(`[data-coupon="${SAVE}"]`)).toBeVisible();
  await expect(list.locator(`[data-coupon="${FLAT}"]`)).toBeVisible();
  await expect(list.locator(`[data-coupon="${OLD}"]`)).toHaveCount(0); // expired: never listed
  await expect(list.locator(`[data-coupon="${HIDDEN}"]`)).toHaveCount(0); // not listed
  // Greyed with the exact reason.
  const big = list.locator(`[data-coupon="${BIG}"]`);
  await expect(big).toHaveAttribute('data-state', 'unavailable');
  await expect(big).toContainText(/Add Rs [\d,]+ more to use this/);
  await expect(list.getByText('Best for you')).toHaveCount(1);

  const box = await list.boundingBox();
  await list.getByRole('button', { name: new RegExp(`^Apply ${SAVE}`) }).click();
  const savePressed = list.getByRole('button', { name: new RegExp(`^${SAVE}, applied`) });
  await expect(savePressed).toHaveAttribute('aria-pressed', 'true');
  await expect(total).not.toHaveText(full);
  // Switching: tap another card, the first is removed automatically.
  await list.getByRole('button', { name: new RegExp(`^Apply ${FLAT}`) }).click();
  await expect(list.getByRole('button', { name: new RegExp(`^${FLAT}, applied`) })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(list.locator('button[aria-pressed="true"]')).toHaveCount(1);
  const after = await list.boundingBox();
  expect(Math.abs((after?.y ?? 0) - (box?.y ?? 0))).toBeLessThan(2); // the list did not move
  await expect(page.getByText(/Total to pay:/)).toHaveCount(1); // the live region

  await page.getByRole('button', { name: `Remove coupon ${FLAT}` }).click();
  await expect(page.getByText('Coupon removed. The full price is back.')).toBeVisible();
  await expect(total).toHaveText(full);

  await page.getByLabel('Have a private code?').fill(OLD.toLowerCase());
  await page.getByRole('button', { name: 'Apply typed coupon code' }).click();
  await expect(page.getByRole('alert')).toHaveText(`${OLD} has expired.`);
  await page.getByLabel('Have a private code?').fill('NOSUCHCODE');
  await page.getByRole('button', { name: 'Apply typed coupon code' }).click();
  await expect(page.getByRole('alert')).toHaveText('That coupon code is not valid.');

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${width} px`).toBeLessThanOrEqual(0);
    const cards = list.locator('li');
    const a = await cards.nth(0).boundingBox();
    const b = await cards.nth(1).boundingBox();
    expect(Math.abs((a?.x ?? 0) - (b?.x ?? 1))).toBeLessThan(2); // one column on phones
    expect(a?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await list.getByRole('button', { name: new RegExp(`^Apply ${SAVE}`) }).click();
  await expect(page.getByRole('button', { name: `Remove coupon ${SAVE}` })).toBeVisible();
  await page.screenshot({ path: 'mobile-screens/customer/pay-coupon-390.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole('button', { name: /^Pay ₹/ }).click();
  await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible();
  await page.goto('/customer/appointments');
  await expect(page.getByText(new RegExp(`${SAVE} \\(-`)).first()).toBeVisible();
});

test('the front desk sees the coupon read-only and the admin report counts it', async () => {
  const report = await api(admin.page, 'GET', '/api/admin/marketing/coupons/report/');
  const body = (await report.json()) as { coupons: { code: string; uses: number }[] };
  expect(body.coupons.find((c) => c.code === SAVE)?.uses).toBe(1);
  const denied = await api(desk.page, 'POST', '/api/admin/marketing/coupons/', {
    code: 'DESK10',
    name: 'Desk',
    kind: 'percent',
    value: '10',
  });
  expect(denied.status()).toBe(403);
});
