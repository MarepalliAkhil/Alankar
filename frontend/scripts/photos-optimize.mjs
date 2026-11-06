// npm run photos:optimize -- turns the owner's photos into the small files the site uses.
//
// For every slot in vite-plugins/photo-slots.js:
//   1. The original (PNG, JPG, JPEG or WebP) is moved from public/photos/ to photos-originals/
//      (git-ignored, so large files are never committed). Running the script again re-uses the
//      newest original for each slot; dropping a new photo into public/photos replaces it.
//   2. The original is resized to the slot size with a centre crop (heroes and shop-background
//      1920x1080, backgrounds 1600x1000) and saved as <slot>.webp and <slot>.jpg in public/photos, plus a 960 px wide <slot>-960.webp/.jpg for phones,
//      each kept under 200 KB by lowering the quality step by step.
//      Meera's character pictures (meera-<pose> and the default meera, 820x1024, plus a 410x512 copy) live in public/photos/meera/: they are
//      kept whole (never cropped), keep their see-through background, and are saved as WebP only.
//   3. A tiny blurred preview is written to public/photos/placeholders.json, shown while the full
//      photo loads.
//
// Needs "sharp" (a dev dependency, never shipped to the browser):  npm install
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_PHOTO_BYTES,
  MEERA_FOLDER,
  PHOTO_EXTENSIONS,
  PHOTO_SLOTS,
  isTransparentSlot,
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
  const meera = isTransparentSlot(slot);
  const outDir = meera ? path.join(photosDir, MEERA_FOLDER) : photosDir;
  const keepDir = meera ? path.join(originalsDir, MEERA_FOLDER) : originalsDir;
  fs.mkdirSync(keepDir, { recursive: true });
  const made = new Set(previous[slot]?.outputs ?? []);
  // Anything in public/photos for this slot that this script did not make is a new original.
  // A Meera picture dropped straight into public/photos is picked up from there as well.
  for (const from of meera ? [photosDir, outDir] : [photosDir]) {
    for (const name of list(from).filter(
      (n) => isFor(slot, n) && !(made.has(n) && from === outDir),
    )) {
      fs.renameSync(path.join(from, name), path.join(keepDir, name));
      console.log(`  moved ${name} -> photos-originals/${meera ? `${MEERA_FOLDER}/` : ''}${name}`);
    }
  }
  const originals = list(keepDir)
    .filter((n) => isFor(slot, n))
    .map((n) => ({ name: n, time: fs.statSync(path.join(keepDir, n)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  if (!originals.length) {
    if (previous[slot]) previews[slot] = previous[slot];
    continue;
  }
  const source = path.join(keepDir, originals[0].name);
  const meta = await sharp(source).metadata();
  const pipeline = sharp(source)
    .rotate()
    .resize(
      size.width,
      size.height,
      meera
        ? { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }
        : { fit: 'cover', position: 'centre' },
    );
  if (meera) {
    fs.mkdirSync(outDir, { recursive: true });
    const webp = await encode(pipeline, 'webp');
    fs.writeFileSync(path.join(outDir, `${slot}.webp`), webp.buffer);
    // The half-height copy (512 px tall) for phones and small stages, and a tiny blurred preview.
    const half = sharp(source)
      .rotate()
      .resize(Math.round(size.width / 2), Math.round(size.height / 2), {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
    fs.writeFileSync(path.join(outDir, `${slot}-512.webp`), (await encode(half, 'webp')).buffer);
    const tinyMeera = await sharp(source)
      .rotate()
      .resize(16, 20, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .blur(0.8)
      .webp({ quality: 40 })
      .toBuffer();
    previews[slot] = {
      file: `${MEERA_FOLDER}/${slot}.webp`,
      bytes: webp.buffer.length,
      outputs: [`${slot}.webp`, `${slot}-512.webp`],
      data: `data:image/webp;base64,${tinyMeera.toString('base64')}`,
    };
    console.log(
      `  ${slot.padEnd(18)} ${originals[0].name} -> ${MEERA_FOLDER}/${slot}.webp ${kb(webp.buffer.length)} (q${webp.quality})`,
    );
    done += 1;
    continue;
  }
  const webp = await encode(pipeline, 'webp');
  const jpg = await encode(pipeline, 'jpg');
  fs.writeFileSync(path.join(photosDir, `${slot}.webp`), webp.buffer);
  fs.writeFileSync(path.join(photosDir, `${slot}.jpg`), jpg.buffer);
  // The second size: 960 px wide, for phones and small windows (srcset in ArtImage).
  const half = sharp(source)
    .rotate()
    .resize(960, Math.round((960 * size.height) / size.width), {
      fit: 'cover',
      position: 'centre',
    });
  fs.writeFileSync(path.join(photosDir, `${slot}-960.webp`), (await encode(half, 'webp')).buffer);
  fs.writeFileSync(path.join(photosDir, `${slot}-960.jpg`), (await encode(half, 'jpg')).buffer);
  const tiny = await sharp(source)
    .rotate()
    .resize(32, Math.round((32 * size.height) / size.width), { fit: 'cover', position: 'centre' })
    .blur(1.2)
    .webp({ quality: 40 })
    .toBuffer();
  previews[slot] = {
    file: `${slot}.webp`,
    bytes: webp.buffer.length,
    outputs: [`${slot}.webp`, `${slot}.jpg`, `${slot}-960.webp`, `${slot}-960.jpg`],
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
const { execFileSync } = await import('node:child_process');
execFileSync(process.execPath, [path.join(root, 'scripts', 'photo-stats.mjs')], {
  stdio: 'inherit',
});
console.log(
  done
    ? `\nOptimised ${done} photo(s). Originals are in photos-originals/ (not committed).\n` +
        'Restart "npm run dev" if it was running, or run "npm run build".'
    : '\nNo photos found in public/photos or photos-originals.',
);
