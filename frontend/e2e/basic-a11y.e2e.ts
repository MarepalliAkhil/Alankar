import { expect, test, type Page } from '@playwright/test';
import { signIn, type Who } from './helpers';
import { PUBLIC_PAGES, ROLE_PAGES } from './pages';

/**
 * Basic accessibility rules that need no extra tools: one page title, a main landmark,
 * one h1, every image has alt text, every form field has an accessible name and every
 * button/link has a name. (The deeper axe-core scan lives in axe.e2e.ts.)
 */
async function checkBasics(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  if (new URL(page.url()).pathname === '/403') return;
  expect(await page.title(), `${path}: page title`).not.toBe('');
  await expect(page.locator('main').first(), `${path}: main landmark`).toBeVisible();
  expect(await page.locator('h1:visible').count(), `${path}: one visible h1`).toBe(1);
  const bad = await page.evaluate(() => {
    const problems: string[] = [];
    const name = (el: Element) =>
      (
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        (el.textContent ?? '').trim() ||
        el.getAttribute('title') ||
        ''
      ).trim();
    document.querySelectorAll('img').forEach((img) => {
      if (!img.hasAttribute('alt')) problems.push(`img without alt: ${img.getAttribute('src')}`);
    });
    document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach((el) => {
      const id = el.getAttribute('id');
      const labelled =
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
        el.closest('label');
      if (!labelled) problems.push(`field without label: ${el.getAttribute('name') ?? el.tagName}`);
    });
    document.querySelectorAll('button, a[href]').forEach((el) => {
      if (!name(el) && !el.querySelector('img[alt]'))
        problems.push(`unnamed ${el.tagName.toLowerCase()}`);
    });
    return problems;
  });
  expect(bad, `${path}: ${bad.join('; ')}`).toEqual([]);
}

test('public pages pass the basic accessibility rules', async ({ page }) => {
  for (const path of PUBLIC_PAGES) await checkBasics(page, path);
});

for (const who of Object.keys(ROLE_PAGES) as Exclude<Who, 'other'>[]) {
  test(`${who} screens pass the basic accessibility rules`, async ({ browser }) => {
    const s = await signIn(browser, who);
    for (const path of ROLE_PAGES[who]) await checkBasics(s.page, path);
    await s.context.close();
  });
}

test('the whole booking form can be used with the keyboard', async ({ browser }) => {
  const s = await signIn(browser, 'customer');
  await s.page.goto('/customer/book');
  await s.page.getByRole('link', { name: "Book Men's Haircut" }).focus();
  await s.page.keyboard.press('Enter');
  await expect(s.page.getByLabel('Date')).toBeVisible();
  await s.page.getByLabel('Date').focus();
  await expect(s.page.getByLabel('Date')).toBeFocused();
  await s.page.keyboard.press('Tab');
  await expect(s.page.locator(':focus')).toBeVisible();
  await s.context.close();
});
