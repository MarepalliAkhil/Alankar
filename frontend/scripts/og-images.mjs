/**
 * Share images (1200 x 630) for the main pages, made from the shop's own photos, the Alankar logo
 * and the page name. Nothing is drawn or generated: a photo, a dark gradient for contrast, the
 * logo on a white tile and the words. Run on your PC (needs sharp): `npm run og:images`.
 * Writes frontend/public/og/<page>.png, which the pages' og:image tags point to.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { OG_HEIGHT, OG_WIDTH, PAGES, SHOP_NAME } from '../src/seo/seo-data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const photos = path.join(root, 'public', 'photos');
const out = path.join(root, 'public', 'og');
const logo = path.join(root, 'public', 'brand', 'alankar-logo.svg');

/** Which photo each share image uses (existing slots in public/photos). */
const PHOTO = {
  home: 'shop-background',
  salon: 'salon-hero',
  spa: 'spa-hero',
  'beauty-parlor': 'parlor-hero',
  'for-zenotians': 'shop-background',
};
const SUBTITLE = {
  home: 'Salon · Spa · Beauty Parlor',
  salon: 'Haircuts, colour and grooming',
  spa: 'Massages and calm treatments',
  'beauty-parlor': 'Skin, bridal and nails',
  'for-zenotians': 'A portfolio project, built end to end',
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function findPhoto(slot) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const file = path.join(photos, `${slot}.${ext}`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function overlay(title, subtitle) {
  return Buffer.from(`<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#05201e" stop-opacity="0.88"/>
      <stop offset="0.65" stop-color="#05201e" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#05201e" stop-opacity="0.15"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="80" y="380" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="72" font-weight="700" fill="#ffffff">${esc(title)}</text>
  <text x="80" y="450" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="36" fill="#e6f2f1">${esc(subtitle)}</text>
  <text x="80" y="560" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="28" fill="#cfe5e3">${esc(SHOP_NAME)}</text>
</svg>`);
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const tile = await sharp(logo).resize(150, 150).png().toBuffer();
  const rounded = await sharp({
    create: { width: 170, height: 170, channels: 4, background: '#ffffff' },
  })
    .composite([
      { input: tile, left: 10, top: 10 },
      {
        input: Buffer.from(
          '<svg width="170" height="170"><rect width="170" height="170" rx="28" ry="28"/></svg>',
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
  for (const page of PAGES.filter((p) => p.og)) {
    const photo = findPhoto(PHOTO[page.og]);
    if (!photo) {
      console.warn(`  ! no photo for ${page.og} (public/photos/${PHOTO[page.og]}.*): skipped`);
      continue;
    }
    const title = page.og === 'home' ? SHOP_NAME : page.label;
    const file = path.join(out, `${page.og}.png`);
    await sharp(photo)
      .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'attention' })
      .composite([
        { input: overlay(title, SUBTITLE[page.og] ?? ''), left: 0, top: 0 },
        { input: rounded, left: 80, top: 120 },
      ])
      .png({ compressionLevel: 9 })
      .toFile(file);
    console.log(
      `  ${path.relative(root, file)} (${OG_WIDTH}x${OG_HEIGHT}) from ${path.basename(photo)}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
