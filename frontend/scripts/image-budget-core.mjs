// The maths behind `npm run images:budget`. No dependencies: it reads PNG, JPEG and WebP headers
// itself, and models what a browser does with a picture that covers a box.
//
// cover scale = how much larger than its own pixels a picture is drawn on a screen:
//   max(box width x dpr / picture width, box height x dpr / picture height) x zoom.
// 1.0 is exactly sharp; above 1.25 the picture visibly softens.

export const MAX_COVER_SCALE = 1.25;
// One screen shape decides which picture a phone gets (never the user agent); the text of the
// query and the widths live in vite-plugins/photo-slots.js so the app and this script agree.
export { PORTRAIT_MOBILE_QUERY, VARIANT_WIDTHS } from '../vite-plugins/photo-slots.js';

/** The devices the brief names. `portraitMobile` is true when PORTRAIT_MOBILE_QUERY matches. */
export const PROFILES = [
  { id: 'iphone-portrait', label: 'iPhone 390x844 @3x', width: 390, height: 844, dpr: 3 },
  { id: 'iphone-landscape', label: 'iPhone 844x390 @3x', width: 844, height: 390, dpr: 3 },
  { id: 'pixel-portrait', label: 'Pixel 412x915 @2.6x', width: 412, height: 915, dpr: 2.6 },
  { id: 'pixel-landscape', label: 'Pixel 915x412 @2.6x', width: 915, height: 412, dpr: 2.6 },
  { id: 'ipad-portrait', label: 'iPad 820x1180 @2x', width: 820, height: 1180, dpr: 2 },
  { id: 'laptop-1x', label: 'Laptop 1440x900 @1x', width: 1440, height: 900, dpr: 1 },
  { id: 'laptop-2x', label: 'Laptop 1440x900 @2x', width: 1440, height: 900, dpr: 2 },
  { id: 'desktop-1x', label: 'Desktop 1920x1080 @1x', width: 1920, height: 1080, dpr: 1 },
].map((p) => ({
  ...p,
  portraitMobile: p.height > p.width && p.width <= 900,
}));

/** Height of the short image band used on a portrait phone with no portrait photo (dvh share). */
export const BAND_SHARE = 0.4;

// ------------------------------------------------------------------ header readers

/** Pixel size of a PNG, JPEG or WebP from its first bytes. Returns null if it is none of them. */
export function imageSize(buffer) {
  const b = buffer;
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString('ascii', 12, 16) === 'IHDR') {
    return { format: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) return jpegSize(b);
  if (
    b.length > 30 &&
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return webpSize(b);
  }
  return null;
}

function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = b.readUInt16BE(i + 2);
    // Start-of-frame markers (not DHT 0xc4, JPG 0xc8, DAC 0xcc) hold the size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { format: 'jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

function webpSize(b) {
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') {
    return { format: 'webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { format: 'webp', width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (kind === 'VP8 ') {
    return {
      format: 'webp',
      width: b.readUInt16LE(26) & 0x3fff,
      height: b.readUInt16LE(28) & 0x3fff,
    };
  }
  return null;
}

// ------------------------------------------------------------------ the model

/** Which file the browser takes from a width-described list: the smallest that is wide enough. */
export function pickCandidate(candidates, neededWidth) {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((a, b) => a.width - b.width);
  return sorted.find((c) => c.width >= neededWidth) ?? sorted[sorted.length - 1];
}

/**
 * The box a slot is drawn into on a profile, in CSS pixels, and the extra zoom on top.
 * kinds:
 *   page-background / home-background: fixed, covers the whole window (home zooms a little);
 *   hero: the division hero, full width and clamp(520px, 78dvh, 760px) tall; on a portrait phone a
 *         top band 40% of the height tall.
 * With a portrait photo on a portrait phone the background covers the whole window; without one the
 * landscape photo is shown in the short band so it is never stretched over a tall window.
 */
export function boxFor(kind, profile, hasMobilePhoto) {
  const { width, height } = profile;
  const bandH = Math.round(height * BAND_SHARE);
  if (kind === 'hero') {
    if (profile.portraitMobile) return { width, height: bandH, zoom: 1, mode: 'hero band' };
    const h = Math.min(760, Math.max(520, Math.round(height * 0.78)));
    return { width, height: h, zoom: 1, mode: 'hero' };
  }
  const zoom = kind === 'home-background' ? 1.06 : 1;
  if (profile.portraitMobile && !hasMobilePhoto) {
    return { width, height: bandH, zoom, mode: 'band (no portrait photo)' };
  }
  return { width, height, zoom, mode: 'window' };
}

/** Cover scale of the picture the browser would pick for this box (null if no picture). */
export function coverScale(box, dpr, candidates) {
  const picked = pickCandidate(candidates, box.width * dpr);
  if (!picked) return null;
  const scale =
    Math.max((box.width * dpr) / picked.width, (box.height * dpr) / picked.height) * box.zoom;
  return { scale, picked };
}

/**
 * Checks every slot on every profile.
 * slots: [{ name, kind, landscape: [{width,height,file}], mobile: [{width,height,file}] }]
 * returns rows { slot, profile, mode, file, scale, flagged } (rows with no picture are skipped).
 */
export function checkSlots(slots, profiles = PROFILES, limit = MAX_COVER_SCALE) {
  const rows = [];
  for (const slot of slots) {
    for (const profile of profiles) {
      const usesMobile = profile.portraitMobile && slot.mobile?.length > 0;
      const candidates = usesMobile ? slot.mobile : slot.landscape;
      if (!candidates?.length) continue;
      const box = boxFor(slot.kind, profile, !!slot.mobile?.length);
      const result = coverScale(box, profile.dpr, candidates);
      if (!result) continue;
      rows.push({
        slot: slot.name,
        profile: profile.id,
        mode: box.mode,
        file: result.picked.file,
        width: result.picked.width,
        height: result.picked.height,
        scale: Math.round(result.scale * 100) / 100,
        flagged: result.scale > limit,
      });
    }
  }
  return rows;
}

/**
 * For a flagged row: the pixel size a replacement photo needs so that the scale is at most 1.0 on
 * that profile (width x dpr, rounded up to a multiple of 10).
 */
export function neededSize(box, dpr) {
  const round = (n) => Math.ceil(n / 10) * 10;
  return { width: round(box.width * dpr), height: round(box.height * dpr) };
}
