// npm run photos:check -- which photo each slot uses, its size and weight, and what to fix.
//
// For every slot in vite-plugins/photo-slots.js it looks in public/photos for <slot>.webp, .jpg,
// .jpeg, .png (that order, any letter case) and warns when the file is over 200 KB, smaller than
// the size the slot is shown at, or a different shape (aspect ratio).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_PHOTO_BYTES, PHOTO_SLOTS, pickPhoto } from '../vite-plugins/photo-slots.js';
import { imageSize } from './image-size.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'photos');
let files = [];
try {
  files = fs.readdirSync(dir);
} catch {
  files = [];
}

// Files written by photos:optimize (the JPG next to the WebP is an intended fallback).
let made = {};
try {
  made = JSON.parse(fs.readFileSync(path.join(dir, 'placeholders.json'), 'utf8'));
} catch {
  made = {};
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
let warnings = 0;
console.log(`Photo slots (folder: ${path.relative(process.cwd(), dir) || dir})\n`);
for (const [slot, want] of Object.entries(PHOTO_SLOTS)) {
  const file = pickPhoto(slot, files);
  if (!file) {
    console.log(
      `  ${slot.padEnd(18)} no photo -> generated artwork (${want.width}x${want.height})`,
    );
    continue;
  }
  const full = path.join(dir, file);
  const bytes = fs.statSync(full).size;
  const size = imageSize(full);
  const dims = size ? `${size.width}x${size.height}` : 'unknown size';
  const notes = [];
  if (bytes > MAX_PHOTO_BYTES) notes.push(`over 200 KB (run npm run photos:optimize)`);
  if (size) {
    if (size.width < want.width || size.height < want.height) {
      notes.push(`smaller than the recommended ${want.width}x${want.height}`);
    }
    const ratio = size.width / size.height;
    const target = want.width / want.height;
    if (Math.abs(ratio - target) / target > 0.02) {
      notes.push(
        `aspect ratio ${ratio.toFixed(2)} instead of ${target.toFixed(2)}; it will be cropped from the centre`,
      );
    }
  } else {
    notes.push('could not read the image size');
  }
  const outputs = made[slot]?.outputs ?? [];
  const others = files.filter(
    (name) =>
      name !== file &&
      !outputs.includes(name) &&
      name.toLowerCase().startsWith(`${slot}.`) &&
      name.toLowerCase() !== 'placeholders.json',
  );
  if (others.length) notes.push(`also found ${others.join(', ')} (not used)`);
  const fallback = outputs.find((name) => name !== file);
  warnings += notes.length;
  console.log(
    `  ${slot.padEnd(18)} ${file.padEnd(24)} ${dims.padEnd(11)} ${kb(bytes).padEnd(8)}` +
      (fallback ? ` (+ ${fallback} fallback)` : ''),
  );
  for (const note of notes) console.log(`  ${''.padEnd(18)} ! ${note}`);
}
console.log(warnings ? `\n${warnings} warning(s).` : '\nAll photos look good.');
