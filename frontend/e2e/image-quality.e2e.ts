import { expect, test, devices, type Page } from '@playwright/test';
import { settle, signIn } from './helpers';

/**
 * Image quality on real device shapes (docs/IMAGE_QUALITY.md). For each page: nothing scrolls
 * sideways, every picture that is shown is at least as many pixels wide as the screen needs
 * (width x device pixel ratio) or the widest file it was offered, no picture has a blur filter
 * (the one exception: staff screens, at most 4 px), and a screenshot goes to docs/ui-screenshots/.
 *
 * Needs the app running and the demo data (the same set-up as the other browser tests).
 */
const SHOTS = '../docs/ui-screenshots';

/**
 * A device descriptor without `defaultBrowserType`. Playwright refuses test.use({ defaultBrowserType })
 * inside a describe group (it would need a new worker), and the descriptors carry it. Everything
 * that makes it a phone stays: viewport, deviceScaleFactor, isMobile, hasTouch and userAgent. The
 * tests keep running in the existing Chromium project.
 */
type Descriptor = (typeof devices)[string];
function phone(name: string): Omit<Descriptor, 'defaultBrowserType'> {
  const descriptor = devices[name];
  if (!descriptor) throw new Error(`Unknown Playwright device: ${name}`);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { defaultBrowserType, ...rest } = descriptor;
  return rest;
}

const SHAPES = [
  { name: 'iphone-portrait', use: phone('iPhone 13') },
  { name: 'iphone-landscape', use: phone('iPhone 13 landscape') },
  { name: 'pixel-portrait', use: phone('Pixel 7') },
  { name: 'pixel-landscape', use: phone('Pixel 7 landscape') },
  { name: 'desktop-1280', use: { viewport: { width: 1280, height: 800 } } },
];

const PUBLIC = [
  { path: '/', label: 'home' },
  { path: '/salon', label: 'salon' },
  { path: '/spa', label: 'spa' },
  { path: '/beauty-parlor', label: 'parlor' },
  { path: '/zenotians', label: 'zenotians' },
  { path: '/zenotians/about-zenoti', label: 'zenotians-leaders' },
];

interface Probe {
  /** The file the browser chose, as an absolute URL. */
  src: string;
  kind: 'img' | 'background';
  shown: boolean;
  /** Width of the box on screen, in CSS pixels. */
  cssWidth: number;
  dpr: number;
  /** Real pixel width of the chosen file, measured on a fresh Image with only that src. */
  real: number;
  /** The widest file the page offered for this picture, in real pixels. */
  widest: number;
  filters: string[];
}

/**
 * Every visible picture (<img> and CSS background), with what it needs and what it really got.
 *
 * naturalWidth of an <img> that has srcset w-descriptors and sizes is DENSITY-CORRECTED: the file's
 * pixel width divided by the candidate's density, so it equals the slot's CSS width and says nothing
 * about the pixels downloaded (a 1170 px file chosen for a 390 px slot reports 390). So the real
 * width is measured on a new Image() given ONLY the chosen URL (no srcset, no sizes).
 * `requested` is the set of image URLs the browser really fetched; for a CSS image-set it tells
 * which of the candidates was chosen.
 */
async function probe(page: Page, requested: string[]): Promise<Probe[]> {
  return page.evaluate(async (fetched) => {
    const real = async (src: string): Promise<number> => {
      const fresh = new Image();
      fresh.src = src;
      try {
        await fresh.decode();
      } catch {
        return 0; // not a decodable raster picture (for example an SVG without a size)
      }
      return fresh.naturalWidth;
    };
    const filtersOf = (start: Element) => {
      const found: string[] = [];
      for (let node: Element | null = start; node; node = node.parentElement) {
        const f = getComputedStyle(node).filter;
        if (f && f !== 'none') found.push(f);
      }
      return found;
    };
    const onScreen = (el: Element) => {
      const box = el.getBoundingClientRect();
      return (
        box.width > 8 &&
        box.height > 8 &&
        getComputedStyle(el).visibility !== 'hidden' &&
        box.bottom > 0 &&
        box.top < window.innerHeight * 3
      );
    };
    const out: Probe[] = [];

    for (const img of Array.from(document.images)) {
      const src = img.currentSrc;
      if (!src) continue;
      // The real widths of every file offered: the w descriptors of the srcsets (picture sources too).
      const widths: number[] = [];
      const collect = (set: string | null) =>
        set?.split(',').forEach((part) => {
          const m = part.trim().match(/\s(\d+)w$/);
          if (m) widths.push(Number(m[1]));
        });
      collect(img.getAttribute('srcset'));
      img
        .closest('picture')
        ?.querySelectorAll('source')
        .forEach((source) => collect(source.getAttribute('srcset')));
      const width = await real(src);
      out.push({
        src,
        kind: 'img',
        shown: onScreen(img),
        cssWidth: img.getBoundingClientRect().width,
        dpr: window.devicePixelRatio,
        real: width,
        widest: Math.max(width, ...widths),
        filters: filtersOf(img),
      });
    }

    for (const el of Array.from(document.querySelectorAll('*'))) {
      const background = getComputedStyle(el).backgroundImage;
      if (!background || background === 'none') continue;
      const urls = Array.from(background.matchAll(/url\(["']?([^"')]+)["']?\)/g)).map(
        (m) => new URL(m[1]!, document.baseURI).href,
      );
      // With an image-set the browser fetches one candidate: the one that was requested.
      const chosen = urls.filter((u) => fetched.includes(u));
      for (const src of chosen) {
        const width = await real(src);
        out.push({
          src,
          kind: 'background',
          shown: onScreen(el),
          cssWidth: el.getBoundingClientRect().width,
          dpr: window.devicePixelRatio,
          real: width,
          widest: width, // a CSS background does not list its other candidates
          filters: filtersOf(el),
        });
      }
    }
    return out;
  }, requested);
}

const fileName = (url: string) => decodeURIComponent(new URL(url).pathname.split('/').pop() ?? url);

/** Visits a page and checks every picture on it. Writes which file was chosen to the output. */
async function check(page: Page, path: string, label: string, shape: string, staff = false) {
  // The images the browser really fetches (needed to resolve CSS image-set backgrounds).
  const requested: string[] = [];
  page.on('response', (r) => {
    if (r.request().resourceType() === 'image') requested.push(r.url());
  });
  await page.goto(path);
  await page.waitForLoadState('load');
  await settle(page);
  // Only pictures near the screen: a lazy picture far down the page is never loaded and would
  // keep this waiting for nothing.
  await page.waitForFunction(
    () =>
      Array.from(document.images)
        .filter((i) => i.getBoundingClientRect().top < window.innerHeight * 3)
        .every((i) => i.complete),
    undefined,
    { timeout: 15_000 },
  );
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, `${path} (${shape}): scrolls sideways by ${over}px`).toBeLessThanOrEqual(0);

  const chosen: string[] = [];
  const failures: string[] = [];
  const pictures = (await probe(page, requested)).filter((p) => p.shown && p.real > 0);
  for (const pic of pictures) {
    // Photos only: tiny icons, avatars and small pictures are not part of the budget.
    if (pic.cssWidth < 120) continue;
    const need = Math.ceil(pic.cssWidth * pic.dpr);
    const reachable = Math.min(need, pic.widest);
    const floor = Math.floor(reachable * 0.95);
    chosen.push(
      `${fileName(pic.src)}  real ${pic.real}px  box ${Math.round(pic.cssWidth)}px  dpr ${pic.dpr}  needed ${need}px  widest offered ${pic.widest}px  ${pic.kind}`,
    );
    if (pic.real < floor) {
      failures.push(
        `${pic.src}\n    real width of the chosen file: ${pic.real}px, container: ${Math.round(pic.cssWidth)} CSS px, device pixel ratio: ${pic.dpr}, needed: ${need}px (widest offered ${pic.widest}px, must reach ${floor}px)`,
      );
    }
    for (const filter of pic.filters) {
      const blur = filter.match(/blur\(([\d.]+)px\)/);
      if (!blur) continue;
      failures.push(
        ...(staff && Number(blur[1]) <= 4 ? [] : [`${pic.src}\n    blur filter: ${filter}`]),
      );
    }
  }

  // Which file was chosen for this shape: printed, and attached to the test (HTML report).
  const summary = `${path} (${shape})\n${chosen.map((c) => `  ${c}`).join('\n') || '  (no photos)'}`;
  console.log(summary);
  test.info().annotations.push({ type: 'chosen files', description: chosen.join(' | ') });
  await test.info().attach(`chosen-files-${label}-${shape}`, {
    body: summary,
    contentType: 'text/plain',
  });
  await page.screenshot({ path: `${SHOTS}/images-${label}-${shape}.png`, fullPage: false });

  expect(failures, `${path} (${shape}): pictures below the budget\n${failures.join('\n')}`).toEqual(
    [],
  );
}

for (const shape of SHAPES) {
  test.describe(`image quality, ${shape.name}`, () => {
    test.use(shape.use);

    for (const { path, label } of PUBLIC) {
      test(`${label}: sharp pictures, no sideways scroll`, async ({ page }) => {
        await check(page, path, label, shape.name);
      });
    }

    test('a booking page: sharp pictures, no sideways scroll', async ({ browser, viewport }) => {
      // signIn opens its own context, so the shape's size is passed in (the pixel ratio is 1 there).
      const s = await signIn(browser, 'customer', viewport ?? undefined);
      await check(s.page, '/customer/book', 'booking', shape.name);
      await s.context.close();
    });
  });
}

test.describe('phones with and without a portrait photo', () => {
  test.use(phone('iPhone 13'));

  test('a portrait phone downloads only one background photo, not both', async ({ page }) => {
    const photos: string[] = [];
    page.on('request', (r) => {
      if (/\/photos\/.*-background(-mobile)?(-\d+)?\.(webp|jpe?g)/.test(r.url()))
        photos.push(r.url());
    });
    await page.goto('/spa');
    await settle(page);
    // Whatever is shown, a portrait phone never fetches a landscape and a portrait copy of the same photo.
    for (const name of ['shop', 'salon', 'spa', 'parlor']) {
      const mine = photos.filter((u) => u.includes(`/${name}-background`));
      const portrait = mine.some((u) => u.includes('-mobile'));
      const landscape = mine.some((u) => !u.includes('-mobile'));
      expect(portrait && landscape, `${name}: both portrait and landscape were downloaded`).toBe(
        false,
      );
    }
  });

  test('rotating the phone switches the picture shape', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    const attr = () => page.locator('[data-home-backdrop]').getAttribute('data-portrait-mobile');
    expect(await attr()).toBe('true');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(attr).toBe('false');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(attr).toBe('true');
  });
});

test('the division hero is one picture, 520 to 760 px tall on a laptop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ['/salon', '/spa', '/beauty-parlor']) {
    await page.goto(path);
    await settle(page);
    const hero = page.locator('[data-division-hero]');
    await expect(hero.locator('img')).toHaveCount(1);
    const height = (await hero.boundingBox())!.height;
    expect(height, path).toBeGreaterThanOrEqual(520);
    expect(height, path).toBeLessThanOrEqual(760);
    await expect(page.locator('[data-page-backdrop]'), path).toHaveCount(0);
  }
});
