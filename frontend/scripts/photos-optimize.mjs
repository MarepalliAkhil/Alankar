// npm run photos:optimize -- turns the owner's photos into the sharp, small files the site uses.
//
// For every slot in vite-plugins/photo-slots.js:
//   1. The original (PNG, JPG, JPEG or WebP) is moved from public/photos/ to photos-originals/
//      (git-ignored, so large files are never committed). Running the script again re-uses the
//      newest original for each slot; dropping a new photo into public/photos replaces it.
//      KEEP YOUR FULL-SIZE ORIGINALS: a photo can never be made sharper than its original.
//   2. The original is cropped (from the centre) to the slot's shape and written at every width of
//      640, 1080, 1600 and 2400 px that is not larger than the original (never upscaled), as
//      <slot>-<width>.webp (quality 78) and <slot>-<width>.jpg, plus <slot>.webp / <slot>.jpg at the
//      largest of those widths up to the slot size. No byte cap lowers the quality any more.
//   3. Optional portrait photos <name>-background-mobile (ideally 1080 x 1920) get 640 and 1080 px
//      wide variants the same way. Without one, phones held upright see the landscape photo in a
//      short band (see docs/IMAGE_SLOTS.md).
//   4. Meera's pictures (public/photos/meera/) are kept whole, transparent, WebP only.
//      Pictures of Zenoti's leaders (public/photos/zenoti-leaders/) become 640 px wide WebP + JPG.
//   5. A tiny blurred preview of each photo is written to public/photos/placeholders.json. It shows
//      while the photo loads and is removed as soon as the sharp photo has loaded.
//
// Needs "sharp" (a dev dependency, never shipped to the browser):  npm install
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  JPEG_QUALITY,
  LEADER_FOLDER,
  MEERA_FOLDER,
  MOBILE_PHOTO_SLOTS,
  PHOTO_EXTENSIONS,
  PHOTO_SLOTS,
  WEBP_QUALITY,
  isTransparentSlot,
  maxBytesForWidth,
  variantWidths,
} from '../vite-plugins/photo-slots.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const photosDir = path.join(root, 'public', 'photos');
const originalsDir = path.join(root, 'photos-originals');
const previewsFile = path.join(photosDir, 'placeholders.json');

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error(
    'photos:optimize needs the "sharp" package (a dev dependency).\n' +
      'From the frontend folder run:  npm install\n' +
      'then run:                      npm run photos:optimize',
  );
  process.exit(1);
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
};
const list = (dir) => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};
const isFor = (slot, name) => {
  const dot = name.lastIndexOf('.');
  return (
    dot > 0 &&
    name.slice(0, dot).toLowerCase() === slot &&
    PHOTO_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase())
  );
};
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

const webp = (pipeline) => pipeline.clone().webp({ quality: WEBP_QUALITY, effort: 5 }).toBuffer();
const jpg = (pipeline) =>
  pipeline.clone().jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();

/** Moves a new original dropped into `from` over to `keep`, and returns the newest original. */
function newestOriginal(slot, froms, keep, made = new Set(), outDir = null) {
  fs.mkdirSync(keep, { recursive: true });
  for (const from of froms) {
    for (const name of list(from).filter(
      (n) => isFor(slot, n) && !(made.has(n) && from === outDir),
    )) {
      fs.renameSync(path.join(from, name), path.join(keep, name));
      console.log(`  moved ${name} -> ${path.relative(root, keep)}/${name}`);
    }
  }
  const originals = list(keep)
    .filter((n) => isFor(slot, n))
    .map((n) => ({ name: n, time: fs.statSync(path.join(keep, n)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  return originals.length
    ? { name: originals[0].name, path: path.join(keep, originals[0].name) }
    : null;
}

fs.mkdirSync(originalsDir, { recursive: true });
const previous = readJson(previewsFile);
const previews = {};
let done = 0;
const warnings = [];

async function tinyPreview(source, width, height) {
  const buffer = await sharp(source)
    .rotate()
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .blur(1.2)
    .webp({ quality: 40 })
    .toBuffer();
  return `data:image/webp;base64,${buffer.toString('base64')}`;
}

/** A landscape or portrait photo slot: variants at every width, plus the plain file. */
async function photoSlot(slot, size) {
  // Files this script wrote last time are outputs, not new originals.
  const made = new Set(previous[slot]?.outputs ?? []);
  const original = newestOriginal(slot, [photosDir], originalsDir, made, photosDir);
  if (!original) {
    if (previous[slot]) previews[slot] = previous[slot];
    return;
  }
  const meta = await sharp(original.path).rotate().metadata();
  const oriented =
    meta.orientation && meta.orientation >= 5
      ? [meta.height, meta.width]
      : [meta.width, meta.height];
  const [origW, origH] = oriented;
  const ratio = size.height / size.width;
  const outputs = [];
  const note = (text) => warnings.push(`${slot}: ${text}`);
  // The plain file: up to the slot size, never enlarged.
  const baseWidth = Math.min(size.width, origW);
  const widths = [...new Set([...variantWidths(origW), baseWidth])].sort((a, b) => a - b);
  const files = [];
  for (const width of widths) {
    const height = Math.round(width * ratio);
    const pipeline = sharp(original.path)
      .rotate()
      .resize(width, height, { fit: 'cover', position: 'centre', withoutEnlargement: true });
    const w = await webp(pipeline);
    const j = await jpg(pipeline);
    const write = (name, buffer) => {
      fs.writeFileSync(path.join(photosDir, name), buffer);
      outputs.push(name);
    };
    write(`${slot}-${width}.webp`, w);
    write(`${slot}-${width}.jpg`, j);
    if (width === baseWidth) {
      // The plain file the app always has: the largest size up to the slot size.
      write(`${slot}.webp`, w);
      write(`${slot}.jpg`, j);
    }
    if (w.length > maxBytesForWidth(width)) note(`${width}px WebP is ${kb(w.length)}, heavy`);
    files.push(`${width}px ${kb(w.length)}`);
  }
  if (origW < size.width || origH < size.height) {
    note(
      `the original is ${origW}x${origH}, smaller than ${size.width}x${size.height}; a larger original will look sharper`,
    );
  }
  previews[slot] = {
    file: `${slot}.webp`,
    bytes: fs.statSync(path.join(photosDir, `${slot}.webp`)).size,
    outputs,
    data: await tinyPreview(original.path, 32, Math.max(2, Math.round(32 * ratio))),
  };
  console.log(`  ${slot.padEnd(26)} ${original.name} ${origW}x${origH} -> ${files.join(', ')}`);
  done += 1;
}

/** Meera: kept whole, transparent, WebP only (full size and a half-height copy). */
async function meeraSlot(slot, size) {
  const outDir = path.join(photosDir, MEERA_FOLDER);
  const keepDir = path.join(originalsDir, MEERA_FOLDER);
  const made = new Set(previous[slot]?.outputs ?? []);
  const original = newestOriginal(slot, [photosDir, outDir], keepDir, made, outDir);
  if (!original) {
    if (previous[slot]) previews[slot] = previous[slot];
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };
  const full = sharp(original.path)
    .rotate()
    .resize(size.width, size.height, { fit: 'contain', background: clear });
  const half = sharp(original.path)
    .rotate()
    .resize(Math.round(size.width / 2), Math.round(size.height / 2), {
      fit: 'contain',
      background: clear,
    });
  const fullBuffer = await webp(full);
  fs.writeFileSync(path.join(outDir, `${slot}.webp`), fullBuffer);
  fs.writeFileSync(path.join(outDir, `${slot}-512.webp`), await webp(half));
  const tiny = await sharp(original.path)
    .rotate()
    .resize(16, 20, { fit: 'contain', background: clear })
    .blur(0.8)
    .webp({ quality: 40 })
    .toBuffer();
  previews[slot] = {
    file: `${MEERA_FOLDER}/${slot}.webp`,
    bytes: fullBuffer.length,
    outputs: [`${slot}.webp`, `${slot}-512.webp`],
    data: `data:image/webp;base64,${tiny.toString('base64')}`,
  };
  console.log(
    `  ${slot.padEnd(26)} ${original.name} -> ${MEERA_FOLDER}/${slot}.webp ${kb(fullBuffer.length)}`,
  );
  done += 1;
}

for (const [slot, size] of Object.entries(PHOTO_SLOTS)) {
  if (isTransparentSlot(slot)) await meeraSlot(slot, size);
  else await photoSlot(slot, size);
}
for (const [slot, size] of Object.entries(MOBILE_PHOTO_SLOTS)) await photoSlot(slot, size);

// The optional photos of Zenoti's leaders: a 640 px wide WebP and JPG each, whatever the name.
const leaderDir = path.join(photosDir, LEADER_FOLDER);
const leaderKeep = path.join(originalsDir, LEADER_FOLDER);
for (const name of list(leaderDir)) {
  const dot = name.lastIndexOf('.');
  const ext = name.slice(dot + 1).toLowerCase();
  if (dot < 1 || !PHOTO_EXTENSIONS.includes(ext)) continue;
  const slug = name.slice(0, dot);
  if (previous[`${LEADER_FOLDER}/${slug}`]?.outputs?.includes(name)) continue; // made by this script
  fs.mkdirSync(leaderKeep, { recursive: true });
  fs.renameSync(path.join(leaderDir, name), path.join(leaderKeep, name));
  const source = path.join(leaderKeep, name);
  const pipeline = sharp(source).rotate().resize({ width: 640, withoutEnlargement: true });
  const w = await webp(pipeline);
  fs.writeFileSync(path.join(leaderDir, `${slug}.webp`), w);
  fs.writeFileSync(path.join(leaderDir, `${slug}.jpg`), await jpg(pipeline));
  previews[`${LEADER_FOLDER}/${slug}`] = {
    file: `${LEADER_FOLDER}/${slug}.webp`,
    bytes: w.length,
    outputs: [`${slug}.webp`, `${slug}.jpg`],
    data: await tinyPreview(source, 16, 16),
  };
  console.log(`  ${LEADER_FOLDER}/${slug} -> ${slug}.webp ${kb(w.length)}`);
  done += 1;
}
for (const [key, value] of Object.entries(previous)) {
  if (key.startsWith(`${LEADER_FOLDER}/`) && !previews[key]) previews[key] = value;
}

fs.writeFileSync(previewsFile, `${JSON.stringify(previews, null, 2)}\n`);
for (const text of warnings) console.log(`  ! ${text}`);
const { execFileSync } = await import('node:child_process');
execFileSync(process.execPath, [path.join(root, 'scripts', 'photo-stats.mjs')], {
  stdio: 'inherit',
});
console.log(
  done
    ? `\nOptimised ${done} photo(s). Originals are in photos-originals/ (not committed).\n` +
        'Next: npm run images:budget   (is every picture sharp enough?)\n' +
        'Restart "npm run dev" if it was running, or run "npm run build".'
    : '\nNo photos found in public/photos or photos-originals.',
);
