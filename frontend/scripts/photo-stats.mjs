#!/usr/bin/env node
// npm run photos:stats -- measures every photo in public/photos so the contrast tests can check
// text on glass over the REAL pictures (not just a pure black and a pure white pixel).
//
// For each slot's chosen file (<slot>.webp, then .jpg, .jpeg, .png, as the app picks it) it
// averages the picture into a 32 x 18 grid and writes src/generated/photo-stats.json:
//   { "<slot>": { "file": "...", "bytes": 12345, "grid": [32, 18], "cells": "RRGGBB..." } }
// The unit test design/photo-contrast.test.ts fails when a photo changed after the last run
// (the byte size no longer matches), and says to run this again. `npm run photos:optimize` runs it
// at the end. Needs "sharp" (a dev dependency, never shipped to the browser).
//   node scripts/photo-stats.mjs          write the file
//   node scripts/photo-stats.mjs --check  exit 1 when the file is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PHOTO_SLOTS,
  MEERA_FOLDER,
  isTransparentSlot,
  pickPhoto,
} from '../vite-plugins/photo-slots.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'photos');
const out = path.join(root, 'src', 'generated', 'photo-stats.json');
export const GRID = [32, 18];

const list = (d, prefix = '') => {
  try {
    return fs.readdirSync(d).map((n) => `${prefix}${n}`);
  } catch {
    return [];
  }
};

export function photoFiles() {
  const files = [...list(dir), ...list(path.join(dir, MEERA_FOLDER), `${MEERA_FOLDER}/`)];
  const found = {};
  for (const slot of Object.keys(PHOTO_SLOTS)) {
    // Meera's cut-outs sit on a transparent background: they are not laid under text.
    if (isTransparentSlot(slot)) continue;
    const file = pickPhoto(slot, files);
    if (file) found[slot] = file;
  }
  return found;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error(
      'photos:stats needs the "sharp" package. From the frontend folder run:  npm install',
    );
    process.exit(1);
  }
  const stats = {};
  for (const [slot, file] of Object.entries(photoFiles())) {
    const full = path.join(dir, file);
    const { data } = await sharp(full)
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize(GRID[0], GRID[1], { fit: 'fill', kernel: 'cubic' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    stats[slot] = {
      file,
      bytes: fs.statSync(full).size,
      grid: GRID,
      cells: Buffer.from(data).toString('hex'),
    };
  }
  const next = `${JSON.stringify(stats, null, 1)}\n`;
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (current !== next) {
      console.error('photo-stats.json is out of date: run `npm run photos:stats`.');
      process.exit(1);
    }
    console.log('photo-stats.json is up to date.');
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, next);
    console.log(`Measured ${Object.keys(stats).length} photo(s) -> ${path.relative(root, out)}`);
  }
}
