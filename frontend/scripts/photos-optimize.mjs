// npm run photos:optimize -- turns the owner's photos into the small files the site uses.
//
// For every slot in vite-plugins/photo-slots.js:
//   1. The original (PNG, JPG, JPEG or WebP) is moved from public/photos/ to photos-originals/
//      (git-ignored, so large files are never committed). Running the script again re-uses the
//      newest original for each slot; dropping a new photo into public/photos replaces it.
//   2. The original is resized to the slot size with a centre crop (heroes and shop-background
//      1920x1080, backgrounds 1600x1000) and saved as <slot>.webp and <slot>.jpg in public/photos,
//      each kept under 200 KB by lowering the quality step by step.
//   3. A tiny blurred preview is written to public/photos/placeholders.json, shown while the full
//      photo loads.
//
// Needs "sharp" (a dev dependency, never shipped to the browser):  npm install
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_PHOTO_BYTES, PHOTO_EXTENSIONS, PHOTO_SLOTS } from '../vite-plugins/photo-slots.js';

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

/** Encodes at falling quality until the file fits under the limit (or the floor is reached). */
async function encode(pipeline, format) {
  let buffer;
  for (let quality = 82; quality >= 40; quality -= 6) {
    buffer =
      format === 'webp'
        ? await pipeline.clone().webp({ quality, effort: 5 }).toBuffer()
        : await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (buffer.length <= MAX_PHOTO_BYTES) return { buffer, quality };
  }
  return { buffer, quality: 40 };
}

fs.mkdirSync(originalsDir, { recursive: true });
const previous = readJson(previewsFile);
const previews = {};
let done = 0;

for (const [slot, size] of Object.entries(PHOTO_SLOTS)) {
  const made = new Set(previous[slot]?.outputs ?? []);
  // Anything in public/photos for this slot that this script did not make is a new original.
  for (const name of list(photosDir).filter((n) => isFor(slot, n) && !made.has(n))) {
    fs.renameSync(path.join(photosDir, name), path.join(originalsDir, name));
    console.log(`  moved ${name} -> photos-originals/${name}`);
  }
  const originals = list(originalsDir)
    .filter((n) => isFor(slot, n))
    .map((n) => ({ name: n, time: fs.statSync(path.join(originalsDir, n)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  if (!originals.length) {
    if (previous[slot]) previews[slot] = previous[slot];
    continue;
  }
  const source = path.join(originalsDir, originals[0].name);
  const meta = await sharp(source).metadata();
  const pipeline = sharp(source)
    .rotate()
    .resize(size.width, size.height, { fit: 'cover', position: 'centre' });
  const webp = await encode(pipeline, 'webp');
  const jpg = await encode(pipeline, 'jpg');
  fs.writeFileSync(path.join(photosDir, `${slot}.webp`), webp.buffer);
  fs.writeFileSync(path.join(photosDir, `${slot}.jpg`), jpg.buffer);
  const tiny = await sharp(source)
    .rotate()
    .resize(32, Math.round((32 * size.height) / size.width), { fit: 'cover', position: 'centre' })
    .blur(1.2)
    .webp({ quality: 40 })
    .toBuffer();
  previews[slot] = {
    file: `${slot}.webp`,
    bytes: webp.buffer.length,
    outputs: [`${slot}.webp`, `${slot}.jpg`],
    data: `data:image/webp;base64,${tiny.toString('base64')}`,
  };
  const notes = [];
  if (meta.width < size.width || meta.height < size.height) {
    notes.push(`enlarged from ${meta.width}x${meta.height}; a larger original will look sharper`);
  }
  if (webp.buffer.length > MAX_PHOTO_BYTES)
    notes.push('WebP still over 200 KB at the lowest quality');
  if (jpg.buffer.length > MAX_PHOTO_BYTES)
    notes.push('JPG still over 200 KB at the lowest quality');
  console.log(
    `  ${slot.padEnd(18)} ${originals[0].name} -> ${slot}.webp ${kb(webp.buffer.length)} (q${webp.quality}), ` +
      `${slot}.jpg ${kb(jpg.buffer.length)} (q${jpg.quality}), ${size.width}x${size.height}`,
  );
  for (const note of notes) console.log(`  ${''.padEnd(18)} ! ${note}`);
  done += 1;
}

fs.writeFileSync(previewsFile, `${JSON.stringify(previews, null, 2)}\n`);
console.log(
  done
    ? `\nOptimised ${done} photo(s). Originals are in photos-originals/ (not committed).\n` +
        'Restart "npm run dev" if it was running, or run "npm run build".'
    : '\nNo photos found in public/photos or photos-originals.',
);
