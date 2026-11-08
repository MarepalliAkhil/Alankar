// npm run images:budget -- is every picture sharp enough on real screens?
//
// For every photo slot it lists the source and each variant with its real pixel size (read from the
// file headers, no packages needed), then works out how much each picture is enlarged on the
// iPhone, Pixel, iPad, laptop and desktop profiles (see image-budget-core.mjs). Any picture drawn
// more than 1.25 times larger than its own pixels is flagged and the script exits with code 1.
//
//   npm run images:budget             table + verdict
//   npm run images:budget -- --md     the same as a Markdown table (for docs/IMAGE_QUALITY.md)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AIR_FOLDER,
  LEADER_FOLDER,
  MEERA_FOLDER,
  PHOTO_SLOTS,
  isTransparentSlot,
} from '../vite-plugins/photo-slots.js';
import {
  MAX_COVER_SCALE,
  PROFILES,
  boxFor,
  checkSlots,
  imageSize,
  neededSize,
} from './image-budget-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const photosDir = path.join(root, 'public', 'photos');
const originalsDir = path.join(root, 'photos-originals');
const markdown = process.argv.includes('--md');

const list = (dir) => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};
const EXT = /\.(webp|jpe?g|png)$/i;

/** "<slot>.webp", "<slot>-960.jpg", "<slot>-1600.webp" -> { width in the name or null, format } */
function variantsOf(dir, slot) {
  const out = [];
  for (const name of list(dir)) {
    const m = name.match(new RegExp(`^${slot}(?:-(\\d+))?\\.(webp|jpe?g|png)$`, 'i'));
    if (!m) continue;
    const buffer = fs.readFileSync(path.join(dir, name));
    const size = imageSize(buffer);
    if (!size) continue;
    out.push({
      file: name,
      format: size.format,
      width: size.width,
      height: size.height,
      bytes: buffer.length,
    });
  }
  return out.sort((a, b) => a.width - b.width || a.file.localeCompare(b.file));
}

/** One format per width (WebP wins), as the browser would be offered them. */
const preferWebp = (variants) => {
  const byWidth = new Map();
  for (const v of variants) {
    const current = byWidth.get(v.width);
    if (!current || (v.format === 'webp' && current.format !== 'webp')) byWidth.set(v.width, v);
  }
  return [...byWidth.values()];
};

const PHOTO_NAMES = Object.keys(PHOTO_SLOTS).filter((s) => !isTransparentSlot(s));
const MOBILE_OF = (name) => `${name}-mobile`;

const slots = [];
const inventory = [];
for (const name of PHOTO_NAMES) {
  if (name.endsWith('-mobile')) continue;
  const landscape = preferWebp(variantsOf(photosDir, name));
  const mobile = preferWebp(variantsOf(photosDir, MOBILE_OF(name)));
  const originals = variantsOf(originalsDir, name);
  const source = originals.at(-1);
  inventory.push({ name, source, landscape, mobile });
  const kinds = name.endsWith('-hero') ? ['hero'] : ['page-background', 'home-background'];
  for (const kind of kinds) {
    slots.push({
      name: kinds.length > 1 ? `${name} (${kind === 'home-background' ? 'home' : 'page'})` : name,
      baseName: name,
      kind,
      landscape,
      mobile,
    });
  }
}

const rows = checkSlots(slots);

// ---- other picture folders: listed, and Meera is checked against an assumed stage size
const MEERA_STAGE = { width: 300, height: 375 };
const meeraFiles = list(path.join(photosDir, MEERA_FOLDER)).filter((n) => /\.webp$/i.test(n));
const meeraTooSmall = [];
for (const file of meeraFiles) {
  const size = imageSize(fs.readFileSync(path.join(photosDir, MEERA_FOLDER, file)));
  if (!size) continue;
  for (const p of PROFILES.filter((x) => ['iphone-portrait', 'laptop-2x'].includes(x.id))) {
    const scale = Math.max(
      (MEERA_STAGE.width * p.dpr) / size.width,
      (MEERA_STAGE.height * p.dpr) / size.height,
    );
    if (scale > MAX_COVER_SCALE && size.height >= 1000) {
      meeraTooSmall.push(`${MEERA_FOLDER}/${file} on ${p.id}: x${scale.toFixed(2)}`);
    }
  }
}
// AIR (Task AIR-3): the popup draws the character at most 176 CSS px square (a 128 px bottom
// sheet on phones). Each picture must cover that on the iPhone and laptop profiles without being
// enlarged more than MAX_COVER_SCALE; a picture that is not square is flagged too (never stretched).
const AIR_STAGE = { width: 176, height: 176 };
const airFiles = list(path.join(photosDir, AIR_FOLDER)).filter((n) => /\.webp$/i.test(n));
const airProblems = [];
for (const file of airFiles) {
  const size = imageSize(fs.readFileSync(path.join(photosDir, AIR_FOLDER, file)));
  if (!size) continue;
  if (size.width !== size.height) airProblems.push(`${AIR_FOLDER}/${file} is not square`);
  for (const p of PROFILES.filter((x) => ['iphone-portrait', 'laptop-2x'].includes(x.id))) {
    const scale = Math.max(
      (AIR_STAGE.width * p.dpr) / size.width,
      (AIR_STAGE.height * p.dpr) / size.height,
    );
    if (scale > MAX_COVER_SCALE && !/-512\.webp$/i.test(file)) {
      airProblems.push(`${AIR_FOLDER}/${file} on ${p.id}: x${scale.toFixed(2)}`);
    }
  }
}
const leaderFiles = list(path.join(photosDir, LEADER_FOLDER)).filter((n) => EXT.test(n));

// ---- output
const out = [];
const say = (line = '') => out.push(line);
const kb = (n) => `${Math.round(n / 1024)} KB`;
const bpp = (v) => ((v.bytes * 8) / (v.width * v.height)).toFixed(2);

say(markdown ? '### Slots and variants' : 'SLOTS AND VARIANTS');
say();
if (markdown) {
  say(
    '| Slot | Source (original) | Variants (width x height, size, bits per pixel) | Portrait photo |',
  );
  say('|---|---|---|---|');
}
for (const s of inventory) {
  const src = s.source
    ? `${s.source.width}x${s.source.height} (${s.source.file})`
    : 'no original kept; largest file below is the source';
  const variants =
    s.landscape.map((v) => `${v.width}x${v.height} ${kb(v.bytes)} ${bpp(v)}bpp`).join('; ') ||
    'none';
  const mob = s.mobile.length
    ? s.mobile.map((v) => `${v.width}x${v.height}`).join('; ')
    : 'none (landscape photo in the short band)';
  if (markdown) say(`| ${s.name} | ${src} | ${variants} | ${mob} |`);
  else {
    say(`${s.name}`);
    say(`  source:   ${src}`);
    say(`  variants: ${variants}`);
    say(`  portrait: ${mob}`);
  }
}
say();
say(markdown ? '### Cover scale per device (1.00 = sharp, limit 1.25)' : 'COVER SCALE');
say();
const profiles = PROFILES.map((p) => p.id);
if (markdown) {
  say(`| Slot | ${profiles.join(' | ')} |`);
  say(`|---|${profiles.map(() => '---').join('|')}|`);
}
for (const slot of slots) {
  const cells = profiles.map((id) => {
    const r = rows.find((x) => x.slot === slot.name && x.profile === id);
    return r ? `${r.scale.toFixed(2)}${r.flagged ? ' !' : ''}` : '-';
  });
  say(
    markdown
      ? `| ${slot.name} | ${cells.join(' | ')} |`
      : `${slot.name.padEnd(28)} ${cells.map((c) => c.padStart(8)).join('')}`,
  );
}
if (!markdown) say(`${''.padEnd(28)} ${profiles.map((p) => p.slice(0, 7).padStart(8)).join('')}`);

const flagged = rows.filter((r) => r.flagged);
say();
say(markdown ? '### Flagged' : 'FLAGGED (more than 1.25x enlarged)');
say();
const needs = new Map();
for (const r of flagged) {
  const slot = slots.find((s) => s.name === r.slot);
  const profile = PROFILES.find((p) => p.id === r.profile);
  const hasMobile = !!slot.mobile.length;
  const box = boxFor(slot.kind, profile, hasMobile);
  const need = neededSize(box, profile.dpr);
  say(
    `${markdown ? '- ' : '  '}${r.slot} on ${r.profile}: x${r.scale.toFixed(2)} (${r.file} ${r.width}x${r.height}, ${r.mode}); needs about ${need.width}x${need.height}`,
  );
  const key = `${slot.baseName}${profile.portraitMobile ? '-mobile' : ''}`;
  const best = needs.get(key);
  if (!best || need.width > best.width) needs.set(key, need);
}
if (!flagged.length) say(`${markdown ? '- ' : '  '}none`);
say();
say(markdown ? '### Replacement photos needed' : 'REPLACEMENTS NEEDED');
say();
if (needs.size) {
  for (const [key, size] of needs) {
    const name = key.endsWith('-mobile') ? key : key;
    const portrait = key.endsWith('-mobile');
    const want = portrait
      ? { width: Math.max(size.width, 1080), height: Math.max(size.height, 1920) }
      : size;
    say(
      `${markdown ? '- ' : '  '}${name}: ${portrait ? 'portrait ' : ''}${want.width}x${want.height} or larger`,
    );
  }
} else say(`${markdown ? '- ' : '  '}none`);
say();
say(
  `Meera pictures: ${meeraFiles.length} files${meeraTooSmall.length ? '; too small: ' + meeraTooSmall.join(', ') : ''} (assumed stage ${MEERA_STAGE.width}x${MEERA_STAGE.height} CSS px).`,
);
say(
  `AIR pictures: ${airFiles.length} files${airProblems.length ? '; PROBLEMS: ' + airProblems.join(', ') : ', all square and sharp enough'} (stage ${AIR_STAGE.width}x${AIR_STAGE.height} CSS px).`,
);
say(
  `Zenoti leader photos: ${leaderFiles.length ? leaderFiles.join(', ') : 'none (initials are shown)'}.`,
);
say();
say(
  flagged.length
    ? `RESULT: ${flagged.length} picture/device combinations are over ${MAX_COVER_SCALE}x.`
    : `RESULT: every picture is within ${MAX_COVER_SCALE}x on every profile.`,
);
if (airProblems.length) say(`RESULT (AIR): ${airProblems.length} problem(s), see above.`);
console.log(out.join('\n'));
process.exit(flagged.length || airProblems.length ? 1 : 0);
