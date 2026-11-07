import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PORTRAIT_MOBILE_QUERY as APP_QUERY,
  VARIANT_WIDTHS as APP_WIDTHS,
} from '../../vite-plugins/photo-slots.js';
import {
  BAND_SHARE,
  MAX_COVER_SCALE,
  PORTRAIT_MOBILE_QUERY,
  PROFILES,
  VARIANT_WIDTHS,
  boxFor,
  checkSlots,
  coverScale,
  imageSize,
  neededSize,
  pickCandidate,
  type BudgetSlot,
} from '../../scripts/image-budget-core.mjs';

const profile = (id: string) => PROFILES.find((p) => p.id === id)!;
const file = (width: number, height: number, name = `x-${width}.webp`) => ({
  file: name,
  width,
  height,
});

describe('image budget: reading file headers without packages', () => {
  it('reads a PNG', () => {
    const b = Buffer.alloc(40);
    b.writeUInt32BE(0x89504e47, 0);
    b.write('IHDR', 12, 'ascii');
    b.writeUInt32BE(820, 16);
    b.writeUInt32BE(1024, 20);
    expect(imageSize(b)).toEqual({ format: 'png', width: 820, height: 1024 });
  });

  it('reads a JPEG (skipping other segments to the start-of-frame)', () => {
    const b = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x04, 0x38,
      0x07, 0x80, 0x01, 0x01, 0x11, 0x00,
    ]);
    expect(imageSize(b)).toEqual({ format: 'jpeg', width: 1920, height: 1080 });
  });

  it('reads the three WebP flavours', () => {
    const riff = (kind: string) => {
      const b = Buffer.alloc(40);
      b.write('RIFF', 0, 'ascii');
      b.write('WEBP', 8, 'ascii');
      b.write(kind, 12, 'ascii');
      return b;
    };
    const x = riff('VP8X');
    x.writeUIntLE(1599, 24, 3);
    x.writeUIntLE(999, 27, 3);
    expect(imageSize(x)).toEqual({ format: 'webp', width: 1600, height: 1000 });
    const l = riff('VP8L');
    l.writeUInt32LE(1079 | (1919 << 14), 21);
    expect(imageSize(l)).toEqual({ format: 'webp', width: 1080, height: 1920 });
    const v = riff('VP8 ');
    v.writeUInt16LE(640, 26);
    v.writeUInt16LE(360, 28);
    expect(imageSize(v)).toEqual({ format: 'webp', width: 640, height: 360 });
  });

  it('returns null for anything else', () => {
    expect(imageSize(Buffer.from('not an image at all, just text'))).toBeNull();
  });

  it('agrees with the real photos in public/photos', () => {
    const buffer = readFileSync(join(process.cwd(), 'public/photos/salon-hero.webp'));
    expect(imageSize(buffer)).toMatchObject({ format: 'webp', width: 1920, height: 1080 });
  });
});

describe('image budget: the model', () => {
  it('shares the query and the widths with the app', () => {
    expect(PORTRAIT_MOBILE_QUERY).toBe(APP_QUERY);
    expect(PORTRAIT_MOBILE_QUERY).toBe('(orientation: portrait) and (max-width: 900px)');
    expect(VARIANT_WIDTHS).toEqual(APP_WIDTHS);
    expect(VARIANT_WIDTHS).toEqual([640, 1080, 1600, 2400]);
  });

  it('knows the profiles of the brief and which ones are portrait mobile', () => {
    const ids = PROFILES.map((p) => p.id);
    for (const id of [
      'iphone-portrait',
      'pixel-portrait',
      'ipad-portrait',
      'laptop-1x',
      'laptop-2x',
      'desktop-1x',
    ]) {
      expect(ids).toContain(id);
    }
    expect(profile('iphone-portrait')).toMatchObject({ width: 390, height: 844, dpr: 3 });
    expect(profile('pixel-portrait')).toMatchObject({ width: 412, height: 915, dpr: 2.6 });
    expect(profile('ipad-portrait')).toMatchObject({ width: 820, height: 1180, dpr: 2 });
    expect(profile('iphone-portrait').portraitMobile).toBe(true);
    expect(profile('iphone-landscape').portraitMobile).toBe(false);
    expect(profile('laptop-2x').portraitMobile).toBe(false);
  });

  it('picks the smallest file that is wide enough, else the widest', () => {
    const c = [file(640, 360), file(1080, 608), file(1600, 900)];
    expect(pickCandidate(c, 500)!.width).toBe(640);
    expect(pickCandidate(c, 1170)!.width).toBe(1600);
    expect(pickCandidate(c, 5000)!.width).toBe(1600);
    expect(pickCandidate([], 100)).toBeNull();
  });

  it('computes the cover scale from the larger of the two directions', () => {
    const box = { width: 1000, height: 500, zoom: 1, mode: 'x' };
    // 2000x500 picture on a 1000x500 box at 2x: width 2000/2000 = 1, height 1000/500 = 2
    expect(coverScale(box, 2, [file(2000, 500)])!.scale).toBe(2);
    expect(coverScale({ ...box, zoom: 1.06 }, 1, [file(1000, 500)])!.scale).toBeCloseTo(1.06);
  });

  it('uses the short band for a portrait phone without a portrait photo', () => {
    const iphone = profile('iphone-portrait');
    const band = boxFor('page-background', iphone, false);
    expect(band.mode).toMatch(/band/);
    expect(band.height).toBe(Math.round(844 * BAND_SHARE));
    expect(boxFor('page-background', iphone, true).mode).toBe('window');
    expect(boxFor('page-background', profile('laptop-1x'), false).mode).toBe('window');
  });

  it('keeps the band within 1.25x for the real landscape photo on every portrait phone', () => {
    const slot: BudgetSlot = {
      name: 'salon-background',
      kind: 'page-background',
      landscape: [file(960, 600), file(1600, 1000)],
      mobile: [],
    };
    const rows = checkSlots(
      [slot],
      PROFILES.filter((p) => p.portraitMobile),
    );
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.mode).toMatch(/band/);
      expect(row.scale).toBeLessThanOrEqual(MAX_COVER_SCALE);
      expect(row.flagged).toBe(false);
    }
  });

  it('uses the portrait photo, when there is one, on a portrait phone', () => {
    const slot: BudgetSlot = {
      name: 'spa-background',
      kind: 'page-background',
      landscape: [file(1600, 1000, 'spa.webp')],
      mobile: [file(1080, 1920, 'spa-mobile.webp')],
    };
    const [row] = checkSlots([slot], [profile('iphone-portrait')]);
    expect(row!.file).toBe('spa-mobile.webp');
    expect(row!.mode).toBe('window');
    // 1080x1920 is the stated minimum, but an iPhone window is 1170x2532 device pixels, so even
    // the portrait photo is drawn 1.32x there: the budget flags it and asks for a taller photo.
    expect(row!.scale).toBeCloseTo(1.32, 1);
    expect(row!.flagged).toBe(true);
    expect(neededSize(boxFor('page-background', profile('iphone-portrait'), true), 3)).toEqual({
      width: 1170,
      height: 2540,
    });
  });

  it('flags a picture drawn more than 1.25x and says what size would fix it', () => {
    const slot: BudgetSlot = {
      name: 'spa-hero',
      kind: 'hero',
      landscape: [file(1920, 1080)],
    };
    const rows = checkSlots([slot], [profile('laptop-2x')]);
    expect(rows[0]!.flagged).toBe(true);
    const box = boxFor('hero', profile('laptop-2x'), false);
    expect(neededSize(box, 2)).toEqual({ width: 2880, height: 1410 });
  });

  it('skips slots that have no picture at all', () => {
    expect(checkSlots([{ name: 'x', kind: 'hero', landscape: [] }])).toEqual([]);
  });

  it('exposes the npm script', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(pkg.scripts['images:budget']).toBe('node scripts/image-budget.mjs');
  });
});
