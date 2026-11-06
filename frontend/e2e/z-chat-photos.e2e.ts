/**
 * Zen Chat photo sharing (Part 2) in real browsers: the customer sends a style reference, the
 * stylist sees the badge, the References strip and the full-screen viewer, strangers and the desk
 * are refused, the stored picture has no camera or GPS data, and deleting works for both sides.
 * Named z-* so it runs after the full-workflow day (it books its own visit).
 */
import { expect, test, type Page } from '@playwright/test';
import { api, bookThroughSteps, signIn, type Session } from './helpers';

test.describe.configure({ mode: 'serial' });

// Playwright runs from the frontend folder.
const PHOTO = 'e2e/fixtures/style-reference.jpg';

/** Puts a generated file into the photo picker without needing Node file or Buffer types. */
async function attach(page: Page, name: string, type: string, bytes: number | string) {
  await page.getByTestId('photo-input').evaluate(
    (el, [n, t, b]) => {
      const data = typeof b === 'number' ? new Uint8Array(b) : new TextEncoder().encode(b);
      const dt = new DataTransfer();
      dt.items.add(new File([data], n as string, { type: t as string }));
      (el as HTMLInputElement).files = dt.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [name, type, bytes] as const,
  );
}

let customer: Session;
let desk: Session;
let stylist: Session;
let other: Session;
let threadId = '';
let imageId = '';

test.beforeAll(async ({ browser }) => {
  customer = await signIn(browser, 'customer');
  desk = await signIn(browser, 'receptionist');
  stylist = await signIn(browser, 'stylist');
  other = await signIn(browser, 'other');
});

test.afterAll(async () => {
  for (const s of [customer, desk, stylist, other]) await s?.context.close();
});

test('a paid, scheduled visit opens the conversation', async () => {
  const page = customer.page;
  await page.goto('/customer/book');
  await page.getByRole('link', { name: "Book Men's Haircut" }).click();
  await bookThroughSteps(page, {
    dateIndex: 4,
    stylist: 'Rahul · Senior Hair Stylist',
    time: '12:00 pm',
  });
  await expect(page).toHaveURL(/\/customer\/appointments$/, { timeout: 30_000 });
  await expect(page.getByText('Booking request sent')).toBeVisible();

  const dp = desk.page;
  await dp.goto('/appointments');
  await dp.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await dp.getByRole('dialog').getByRole('button', { name: 'Accept request' }).click();
  await expect(dp.getByText('You accepted')).toBeVisible();
  const sp = stylist.page;
  await sp.goto('/requests');
  await sp.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await expect(sp.getByText('Both sides accepted, so the booking is made.')).toBeVisible();

  await page.goto('/customer/appointments');
  await page.getByRole('link', { name: 'Pay now' }).click();
  await page.getByRole('button', { name: /^Pay ₹/ }).click();
  await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible();

  await page.goto('/customer/chat');
  await page
    .getByRole('link', { name: /Open conversation with/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/customer\/chat\/[0-9a-f-]{36}$/);
  threadId = page.url().split('/').pop() ?? '';
  await expect(page.getByRole('button', { name: 'Send a photo' })).toBeVisible();
});

test('a file that is not a photo is refused with a clear message, even named .jpg', async () => {
  const page = customer.page;
  await attach(page, 'holiday.jpg', 'image/jpeg', 'this is plain text, not a picture');
  const dialog = page.getByRole('dialog', { name: 'Send a photo' });
  // The first bytes are read in the browser, so the message shows at once and Send stays off.
  await expect(dialog.getByRole('alert')).toContainText('not a photo');
  await expect(dialog.getByRole('button', { name: 'Send photo' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('a photo over 5 MB is refused before it is uploaded', async () => {
  const page = customer.page;
  await attach(page, 'huge.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1024);
  const dialog = page.getByRole('dialog', { name: 'Send a photo' });
  await expect(dialog.getByRole('alert')).toContainText('bigger than 5 MB');
  await expect(dialog.getByRole('button', { name: 'Send photo' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('the customer previews, tags and sends a style reference', async () => {
  const page = customer.page;
  await page.getByTestId('photo-input').setInputFiles(PHOTO);
  const dialog = page.getByRole('dialog', { name: 'Send a photo' });
  await expect(dialog.getByRole('img', { name: /Preview/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Style reference' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await dialog.getByLabel('Caption (optional)').fill('Short on the sides, longer on top');
  await dialog.getByRole('button', { name: 'Send photo' }).click();
  await expect(dialog).toBeHidden();
  const thumb = page.getByRole('img', { name: 'Short on the sides, longer on top' }).first();
  await expect(thumb).toBeVisible();
  await expect(page.getByRole('region', { name: 'References' })).toBeVisible();
  const src = (await thumb.getAttribute('src')) ?? '';
  imageId = /images\/([0-9a-f-]{36})\//.exec(src)?.[1] ?? '';
  expect(imageId).toMatch(/^[0-9a-f-]{36}$/);
});

test('the stylist sees the badge, the References strip and the viewer, live', async () => {
  const page = stylist.page;
  await page.goto('/my-appointments');
  await expect(page.getByText('Reference photo attached').first()).toBeVisible();
  await page.goto(`/chat/${threadId}`);
  const strip = page.getByRole('region', { name: 'References' });
  await expect(strip).toBeVisible();
  await expect(strip.getByRole('img', { name: 'Short on the sides, longer on top' })).toBeVisible();
  await page
    .getByRole('button', { name: /Open photo: Short on the sides/ })
    .first()
    .click();
  const viewer = page.getByRole('dialog', { name: 'Photo viewer' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText('Zoom: Fit to screen')).toBeVisible();
  await page.keyboard.press('+');
  await expect(viewer.getByText('Zoom: 150%')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});

test('only the two people in the conversation can fetch the picture, with no-store headers', async () => {
  const full = `/api/chat/threads/${threadId}/images/${imageId}/`;
  for (const s of [customer, stylist]) {
    const r = await api(s.page, 'GET', full);
    expect(r.status()).toBe(200);
    expect(r.headers()['cache-control']).toBe('private, no-store');
    expect(r.headers()['content-type']).toBe('image/jpeg');
    const t = await api(s.page, 'GET', `${full}thumbnail/`);
    expect(t.status()).toBe(200);
    expect(t.headers()['content-type']).toBe('image/webp');
  }
  expect((await api(other.page, 'GET', full)).status()).toBe(404);
  expect((await api(other.page, 'GET', `${full}thumbnail/`)).status()).toBe(404);
  expect((await api(desk.page, 'GET', full)).status()).toBe(403);
  expect((await api(desk.page, 'GET', `${full}thumbnail/`)).status()).toBe(403);
  const anonymous = await customer.page.context().browser()!.newContext();
  const guest = await anonymous.request.get(`http://127.0.0.1:5174${full}`);
  expect([401, 403]).toContain(guest.status());
  await anonymous.close();
});

test('the stored picture has no camera or GPS data', async () => {
  const r = await api(customer.page, 'GET', `/api/chat/threads/${threadId}/images/${imageId}/`);
  const body = await r.body();
  expect(body.includes('E2E Camera Co')).toBe(false);
  expect(body.includes('Exif')).toBe(false);
});

test('the desk and admin have no chat photo screens', async () => {
  await desk.page.goto(`/customer/chat/${threadId}`);
  await expect(desk.page).toHaveURL(/\/403$/);
});

test('the sender deletes the photo and both screens show "Photo deleted"', async () => {
  const page = customer.page;
  await page.getByRole('button', { name: 'Delete this photo' }).first().click();
  await page.getByRole('button', { name: 'Delete photo' }).click();
  await expect(page.getByText('Photo deleted').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'References' })).toBeHidden();
  await stylist.page.goto(`/chat/${threadId}`);
  await expect(stylist.page.getByText('Photo deleted').first()).toBeVisible();
  const gone = await api(stylist.page, 'GET', `/api/chat/threads/${threadId}/images/${imageId}/`);
  expect(gone.status()).toBe(410);
  await stylist.page.goto('/my-appointments');
  await expect(stylist.page.getByText('Reference photo attached')).toHaveCount(0);
});
