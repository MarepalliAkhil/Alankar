import { expect, test } from '@playwright/test';
import { signIn, type Who } from './helpers';

/** Task 14: one left sidebar for every signed-in role, a drawer on phones. */
const ROLES: Exclude<Who, 'other'>[] = ['customer', 'receptionist', 'stylist', 'admin'];

for (const who of ROLES) {
  test(`${who}: sidebar shows the menu and the profile menu has exactly two entries`, async ({
    browser,
  }) => {
    const s = await signIn(browser, who, { width: 1280, height: 800 });
    const menu = s.page.getByRole('navigation', { name: 'Main menu' });
    await expect(menu).toBeVisible();
    expect(await menu.getByRole('link').count()).toBeGreaterThan(2);
    await expect(menu.locator('[aria-current="page"]')).toHaveCount(1);
    await s.page.getByRole('button', { name: /Account menu/ }).click();
    const items = s.page.getByRole('menu', { name: 'Account menu' }).getByRole('menuitem');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveText(/Profile/);
    await expect(items.nth(1)).toHaveText(/Log out/);
    await s.page.keyboard.press('Escape');
    await expect(s.page.getByRole('menu', { name: 'Account menu' })).toHaveCount(0);
    await s.context.close();
  });
}

test('phone: one menu button opens a drawer, Escape closes it', async ({ browser }) => {
  const s = await signIn(browser, 'customer', { width: 375, height: 667 });
  const open = s.page.getByRole('button', { name: 'Open menu' });
  await expect(open).toBeVisible();
  await open.click();
  const drawer = s.page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('navigation', { name: 'Main menu' })).toBeVisible();
  for (let i = 0; i < 40; i++) {
    await s.page.keyboard.press('Tab');
    const inside = await s.page.evaluate(
      () => !!document.activeElement?.closest('[role="dialog"]'),
    );
    expect(inside, 'focus must stay inside the open drawer').toBe(true);
  }
  await s.page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(open).toBeFocused();
  await s.context.close();
});

test('desktop: the sidebar can be collapsed and stays collapsed after a reload', async ({
  browser,
}) => {
  const s = await signIn(browser, 'admin', { width: 1280, height: 800 });
  const toggle = s.page.locator('aside button[aria-expanded]').first();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await s.page.reload();
  await expect(s.page.locator('aside button[aria-expanded]').first()).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await s.context.close();
});

test('admin: the statistics dashboard loads, switches range and exports a table', async ({
  browser,
}) => {
  const s = await signIn(browser, 'admin', { width: 1280, height: 800 });
  await s.page.goto('/dashboard');
  await expect(s.page.getByRole('heading', { name: 'Shop statistics' })).toBeVisible();
  await expect(s.page.getByText(/Last updated/)).toBeVisible();
  await s.page.getByRole('button', { name: '7 days' }).click();
  await expect(s.page.getByText(/compared with/)).toBeVisible();
  const download = s.page.waitForEvent('download');
  await s.page.getByRole('button', { name: /Download Revenue by stream as CSV/ }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  await s.context.close();
});

test('only the admin can open the statistics data', async ({ browser }) => {
  const s = await signIn(browser, 'receptionist');
  const r = await s.page.request.get('/api/admin/stats/');
  expect(r.status()).toBe(403);
  await s.context.close();
});

/** Task 17B: one navigation, the same look for every role, a floating bell. */
for (const who of ROLES) {
  test(`${who}: exactly one menu navigation and an icon-only bell at the top right`, async ({
    browser,
  }) => {
    const s = await signIn(browser, who, { width: 1280, height: 800 });
    await expect(s.page.getByRole('navigation', { name: 'Main menu' })).toHaveCount(1);
    expect(await s.page.getByRole('navigation').count()).toBe(1);
    const bell = s.page.getByRole('button', { name: /^Notifications/ });
    if ((await bell.count()) > 0) {
      const box = await bell.boundingBox();
      expect(box && box.x > 1280 - 160 && box.y < 120, 'bell sits top right').toBe(true);
      expect((await bell.innerText()).trim()).toMatch(/^\d*$/);
      await bell.click();
      await expect(s.page.getByRole('link', { name: /See all notifications/ })).toBeVisible();
      await s.page.keyboard.press('Escape');
    }
    // Search, Appearance and (customer only) the tour live in the menu.
    const menu = s.page.getByRole('navigation', { name: 'Main menu' });
    await expect(menu.getByRole('button', { name: /Search/ })).toBeVisible();
    await expect(menu.getByText('Appearance', { exact: true }).first()).toBeVisible();
    await expect(menu.getByRole('button', { name: /Take the tour/ })).toHaveCount(
      who === 'customer' ? 1 : 0,
    );
    await s.context.close();
  });
}

test('the sidebar looks the same for all four roles (computed styles)', async ({ browser }) => {
  const read = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const aside = document.querySelector('aside') as HTMLElement;
      const link = aside.querySelector('nav a') as HTMLElement;
      const pick = (el: Element, keys: string[]) => {
        const cs = getComputedStyle(el);
        return keys.map((k) => cs.getPropertyValue(k));
      };
      const keys = ['font-size', 'font-weight', 'line-height', 'padding-left', 'border-radius'];
      return {
        width: aside.getBoundingClientRect().width,
        aside: pick(aside, ['backdrop-filter', 'background-color']),
        link: pick(link, keys),
        icon: link.querySelector('svg')?.getBoundingClientRect().width ?? 0,
        height: link.getBoundingClientRect().height,
      };
    });
  const seen = [];
  for (const who of ROLES) {
    const s = await signIn(browser, who, { width: 1280, height: 800 });
    await expect(s.page.locator('aside nav a').first()).toBeVisible();
    await s.page.evaluate(() => document.fonts.ready);
    seen.push(await read(s.page));
    await s.context.close();
  }
  for (const other of seen.slice(1)) expect(other).toEqual(seen[0]);
});
