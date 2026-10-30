import { expect, test, type Page } from '@playwright/test';

/**
 * Task 11b: the scroll-driven home hero. Scrolls through Salon, Spa and Beauty Parlor, checks the
 * stage, the theme colours and the navbar, and saves screenshots to docs/ui-screenshots/.
 */
const SHOTS = '../docs/ui-screenshots';

async function useMode(page: Page, mode: 'light' | 'dark') {
  await page.addInitScript((m) => {
    window.localStorage.setItem('salon-display', JSON.stringify({ mode: m }));
  }, mode);
}

async function scrollHeroTo(page: Page, progress: number) {
  await page.evaluate((p) => {
    const hero = document.querySelector<HTMLElement>('[data-hero="scroll"]');
    if (!hero) throw new Error('no scroll hero');
    const top = hero.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + p * (hero.offsetHeight - window.innerHeight));
  }, progress);
  await page.waitForTimeout(350);
}

const primary = (page: Page, selector: string) =>
  page.evaluate(
    (s) => getComputedStyle(document.querySelector(s)!).getPropertyValue('--color-primary').trim(),
    selector,
  );

for (const mode of ['light', 'dark'] as const) {
  test(`desktop hero walks through the three divisions (${mode})`, async ({ page }) => {
    await useMode(page, mode);
    await page.goto('/');
    await expect(page.locator('[data-hero="scroll"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const stages = [
      { at: 0, label: 'Salon', name: 'salon' },
      { at: 0.5, label: 'Spa', name: 'spa' },
      { at: 1, label: 'Beauty Parlor', name: 'parlor' },
    ];
    const colours: string[] = [];
    for (const stage of stages) {
      await scrollHeroTo(page, stage.at);
      await expect(page.getByRole('link', { name: `Explore ${stage.label}` })).toBeVisible();
      await expect(page.getByRole('button', { name: `Show ${stage.label}` })).toHaveAttribute(
        'aria-current',
        'step',
      );
      const hero = await primary(page, '[data-hero="scroll"]');
      // The navbar takes the hero's colours while the hero is behind it.
      expect(await primary(page, '[data-hero-follow]')).toBe(hero);
      colours.push(hero);
      await page.screenshot({ path: `${SHOTS}/home-hero-${stage.name}-${mode}.png` });
    }
    expect(new Set(colours).size).toBe(3);

    // Below the hero the navbar goes back to the page theme.
    await page.evaluate(() => {
      const hero = document.querySelector<HTMLElement>('[data-hero="scroll"]')!;
      window.scrollTo(0, hero.getBoundingClientRect().top + window.scrollY + hero.offsetHeight);
    });
    await page.waitForTimeout(400);
    expect(await primary(page, '[data-hero-follow]')).toBe(await primary(page, 'html'));
    await page.screenshot({ path: `${SHOTS}/home-sections-${mode}.png` });

    // The stage dots scroll to a stage.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Show Spa' }).click();
    await expect(page.getByRole('link', { name: 'Explore Spa' })).toBeVisible();
  });
}

test('phone: stacked division sections, one per theme', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('[data-hero="stacked"]')).toBeVisible();
  for (const [label, theme] of [
    ['Salon', 'salon'],
    ['Spa', 'spa'],
    ['Beauty Parlor', 'parlor'],
  ]) {
    const panel = page.getByRole('article', { name: label });
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toBeVisible();
    await expect(panel.locator('xpath=ancestor::*[@data-theme][1]')).toHaveAttribute(
      'data-theme',
      theme,
    );
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOTS}/home-hero-phone.png` });
  await context.close();
});

test('reduced motion: no scroll stage, everything visible', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('[data-hero="stacked"]')).toBeVisible();
  await expect(page.locator('[data-hero="scroll"]')).toHaveCount(0);
  const hidden = await page.evaluate(
    () =>
      [...document.querySelectorAll('.reveal')].filter((el) => getComputedStyle(el).opacity !== '1')
        .length,
  );
  expect(hidden).toBe(0);
  await context.close();
});
