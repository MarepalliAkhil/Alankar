/**
 * The whole salon day through four separate browser sessions (customer, receptionist, stylist,
 * admin), with the "you may not do this" checks in between. Runs top to bottom; each step needs
 * the one before it, so if one fails the rest are skipped.
 */
import { expect, test } from '@playwright/test';
import { api, expectForbiddenPage, signIn, TIME_BUTTON, USERS, type Session } from './helpers';

test.describe.configure({ mode: 'serial' });

let customer: Session;
let desk: Session;
let stylist: Session;
let admin: Session;
let other: Session;
let futureAppointmentId = '';
let invoiceNumber = '';

test.beforeAll(async ({ browser }) => {
  customer = await signIn(browser, 'customer');
  desk = await signIn(browser, 'receptionist');
  stylist = await signIn(browser, 'stylist');
  admin = await signIn(browser, 'admin');
  other = await signIn(browser, 'other');
});

test.afterAll(async () => {
  for (const s of [customer, desk, stylist, admin, other]) await s?.context.close();
});

test('each role lands on its own home page', async () => {
  await expect(customer.page).toHaveURL(/\/customer-dashboard$/);
  await expect(desk.page).toHaveURL(/\/dashboard$/);
  await expect(stylist.page).toHaveURL(/\/my-day$/);
  await expect(admin.page).toHaveURL(/\/dashboard$/);
  for (const [s, who] of [
    [customer, 'customer'],
    [desk, 'receptionist'],
    [stylist, 'stylist'],
    [admin, 'admin'],
  ] as const) {
    const me = await api(s.page, 'GET', '/api/auth/me/');
    expect(me.status()).toBe(200);
    expect((await me.json()).role).toBe(who);
  }
});

test('customer asks for a haircut a few days ahead', async () => {
  const page = customer.page;
  await page.goto('/customer/book');
  await page.getByRole('link', { name: "Book Men's Haircut" }).click();
  await page.getByLabel('Date').selectOption({ index: 3 });
  await page
    .getByLabel('Stylist', { exact: true })
    .selectOption({ label: 'Rahul · Senior Hair Stylist' });
  await page.getByRole('button', { name: '10:00 am' }).click();
  await page.getByLabel('I accept the cancellation policy.').check();
  await page.getByRole('button', { name: 'Send booking request' }).click();
  await expect(page).toHaveURL(/\/customer\/appointments$/);
  await expect(page.getByText('Booking request sent')).toBeVisible();
  await expect(page.getByText('Waiting for the salon to confirm.')).toBeVisible();
});

test('receptionist confirms it with a stylist and time', async () => {
  const page = desk.page;
  await page.goto('/appointments');
  await expect(page.getByRole('tab', { name: /^New requests \(1\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Stylist').selectOption({ label: 'Rahul (requested)' });
  await dialog.getByRole('button', { name: '10:00 am' }).click();
  await dialog.getByRole('button', { name: 'Confirm and send payment link' }).click();
  await expect(page.getByText(`Payment link emailed to ${USERS.customer.email}.`)).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Awaiting payment \(1\)/ })).toBeVisible();
});

test('customer pays online (test payment) and the booking is scheduled', async () => {
  const page = customer.page;
  await page.goto('/customer/appointments');
  await page.getByRole('link', { name: 'Pay now' }).click();
  await expect(page).toHaveURL(/\/customer\/pay\/[0-9a-f-]{36}$/);
  futureAppointmentId = page.url().split('/').pop() ?? '';
  await page.getByRole('button', { name: /^Pay ₹/ }).click();
  await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible();
});

test('a visit that is not today cannot be checked in', async () => {
  const page = desk.page;
  await page.goto('/appointments');
  await page.getByRole('tab', { name: /^Scheduled/ }).click();
  await expect(page.getByRole('button', { name: 'Move to…' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check in' })).toHaveCount(0);
  const forced = await api(page, 'POST', `/api/desk/appointments/${futureAppointmentId}/check-in/`);
  expect(forced.status()).toBe(400);
});

test('people cannot open or call what their role does not allow', async () => {
  // Customer
  await expectForbiddenPage(customer.page, '/appointments');
  await expectForbiddenPage(customer.page, '/pos');
  await expectForbiddenPage(customer.page, '/audit-log');
  expect((await api(customer.page, 'GET', '/api/desk/appointments/')).status()).toBe(403);
  expect((await api(customer.page, 'GET', '/api/audit/')).status()).toBe(403);
  // Stylist
  await expectForbiddenPage(stylist.page, '/pos');
  await expectForbiddenPage(stylist.page, '/payroll');
  expect((await api(stylist.page, 'POST', '/api/desk/pos/checkout/', {})).status()).toBe(403);
  expect((await api(stylist.page, 'GET', '/api/staff/')).status()).toBe(403);
  // Receptionist
  await expectForbiddenPage(desk.page, '/audit-log');
  await expectForbiddenPage(desk.page, '/payroll');
  await expectForbiddenPage(desk.page, '/staff');
  expect((await api(desk.page, 'GET', '/api/audit/')).status()).toBe(403);
  expect((await api(desk.page, 'GET', '/api/staff/')).status()).toBe(403);
  // Signed-out visitors are sent to sign in, and the API says 401.
  const guest = await customer.context.browser()!.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto('/customer/appointments');
  await expect(guestPage).toHaveURL(/\/login/);
  expect((await guest.request.get('/api/my/appointments/')).status()).toBe(401);
  await guest.close();
});

test("another customer cannot see this customer's booking or invoice", async () => {
  const stolen = await api(other.page, 'GET', `/api/my/appointments/${futureAppointmentId}/`);
  expect(stolen.status()).toBe(404);
  const cancel = await api(
    other.page,
    'POST',
    `/api/my/appointments/${futureAppointmentId}/cancel/`,
  );
  expect(cancel.status()).toBe(404);
  const list = await (await api(other.page, 'GET', '/api/my/appointments/')).json();
  expect(JSON.stringify(list)).not.toContain(futureAppointmentId);
  await other.page.goto(`/customer/pay/${futureAppointmentId}`);
  await expect(other.page.getByRole('heading', { name: 'Payment received' })).toHaveCount(0);
});

test('receptionist books a walk-in for today and checks the guest in', async () => {
  const page = desk.page;
  await page.goto('/customers');
  await page.getByRole('link', { name: USERS.customer.name }).click();
  await page
    .getByRole('button', { name: /Book a visit/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Service').selectOption({ label: "Men's Haircut" });
  await dialog.getByRole('button', { name: TIME_BUTTON }).first().click();
  await dialog.getByLabel('Stylist').selectOption({ label: 'Rahul' });
  await dialog.getByRole('button', { name: 'Book visit' }).click();
  await expect(page.getByText('Visit booked')).toBeVisible();

  await page.goto('/appointments');
  await page.getByRole('tab', { name: /^Scheduled/ }).click();
  await page.getByRole('button', { name: 'Check in' }).click();
  await expect(page.getByRole('button', { name: 'Check in' })).toHaveCount(0);
});

test('stylist starts and completes the service', async () => {
  const page = stylist.page;
  await page.goto('/my-day');
  await page.getByRole('link', { name: 'Open visit' }).click();
  await page.getByRole('button', { name: 'Start service' }).click();
  await expect(page.getByText('Service started')).toBeVisible();
  await page.getByRole('button', { name: 'Complete service' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel("Men's Haircut")).toBeChecked();
  await dialog.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(page.getByText('Service completed')).toBeVisible();
});

test('receptionist bills the visit with a retail item and takes cash', async () => {
  const page = desk.page;
  await page.goto('/pos');
  await page.getByRole('button', { name: `Bill ${USERS.customer.name}` }).click();
  const dialog = page.getByRole('dialog');
  const product = dialog.getByLabel('Add a product');
  const comb = await product
    .locator('option', { hasText: 'Wide-tooth Comb' })
    .getAttribute('value');
  await product.selectOption(comb!);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByRole('button', { name: 'Fill remaining' }).click();
  await dialog.getByRole('button', { name: 'Complete bill' }).click();
  const issued = page.getByText(/^Invoice INV-\d{4}-\d{5} issued$/);
  await expect(issued).toBeVisible();
  invoiceNumber = ((await issued.textContent()) ?? '').replace(/^Invoice (\S+) issued$/, '$1');
  expect(invoiceNumber).toMatch(/^INV-\d{4}-\d{5}$/);
  await expect(page.getByText('₹420.00').first()).toBeVisible();
});

test('billing the same visit again is refused and stock went down by one', async () => {
  const invoices = await (await api(desk.page, 'GET', '/api/desk/invoices/')).json();
  expect(invoices).toHaveLength(1);
  const inventory = await (await api(desk.page, 'GET', '/api/desk/inventory/')).json();
  const comb = inventory.results.find((p: { name: string }) => p.name === 'Wide-tooth Comb');
  expect(comb.stock).toBe(29);
  const mine = await (await api(customer.page, 'GET', '/api/my/appointments/')).json();
  const done = mine.find((a: { status: string }) => a.status === 'completed');
  expect(done).toBeTruthy();
  const again = await api(desk.page, 'POST', '/api/desk/pos/checkout/', {
    appointment: done.id,
    payments: [],
  });
  expect(again.status()).toBeGreaterThanOrEqual(400);
});

test('customer rates the stylist and sees the invoice', async () => {
  const page = customer.page;
  await page.goto('/customer/appointments');
  await expect(page.getByText('Please rate your recent visit.')).toBeVisible();
  await page.getByLabel('5 stars').check({ force: true });
  await page.getByRole('button', { name: 'Submit rating' }).click();
  await expect(page.getByText('Please rate your recent visit.')).toHaveCount(0);
  await page.goto('/customer/invoices');
  await expect(page.getByText(invoiceNumber)).toBeVisible();
});

test('admin sees the day in the audit log, ratings and reports', async () => {
  const page = admin.page;
  await page.goto('/audit-log');
  await expect(
    page.getByRole('cell', { name: 'appointment confirmed', exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: /^(invoice|pos)[ a-z]*$/ }).first()).toBeVisible();
  await page.goto('/ratings');
  await expect(page.getByText('Rahul').first()).toBeVisible();
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await page.goto('/payroll');
  await expect(page.getByRole('heading', { name: /Payroll/ })).toBeVisible();
});

test('the customer cancels the paid future booking inside the free window and is refunded', async () => {
  const page = customer.page;
  await page.goto('/customer/appointments');
  await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(page.getByText('Booking cancelled.')).toBeVisible();
  const refunds = await (await api(admin.page, 'GET', '/api/desk/refunds/?status=all')).json();
  expect(JSON.stringify(refunds)).toContain('processed');
});

test('signing out ends the session for real', async () => {
  const page = customer.page;
  await page.goto('/customer-dashboard');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Logout' }).click();
  await expect.poll(async () => (await api(page, 'GET', '/api/auth/me/')).status()).toBe(401);
});
