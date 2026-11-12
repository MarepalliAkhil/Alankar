/**
 * Checks the finished build (run after `npm run build`): exit 1 when any check fails.
 *  1. sitemap.xml lists exactly the indexable public pages (no staff, account, API or redirect URL)
 *  2. robots.txt and llms.txt exist; robots.txt blocks /api/ and points to the sitemap
 *  3. every public route has its static head file with title, canonical and share tags
 *  4. no source maps
 *  5. public first-load JavaScript is at most 200 KB gzip
 *  6. no placeholder text ("Demo address", "+91 90000 00000", lorem ipsum, ...) in the pages
 *  7. the share images exist in public/og (a warning only: run `npm run og:images`)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { loadEnv } from 'vite';
import {
  absoluteUrl,
  indexablePages,
  PAGES,
  PLACEHOLDER_PATTERNS,
  PRIVATE_PREFIXES,
  siteConfig,
  ZEN_SECTION_PATHS,
} from '../src/seo/seo-data.js';
import { findSourceMaps } from './check-sourcemaps.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
export const BUDGET_BYTES = 200 * 1024;
const config = siteConfig({ ...loadEnv('production', root, ''), ...process.env });

const failures = [];
const warnings = [];
const read = (file) => fs.readFileSync(path.join(dist, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(dist, file));
const fail = (text) => failures.push(text);

// 1. sitemap
if (!exists('sitemap.xml')) fail('dist/sitemap.xml is missing');
else {
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const wanted = indexablePages().map((p) => absoluteUrl(config, p.path));
  const extra = locs.filter((l) => !wanted.includes(l));
  const missing = wanted.filter((w) => !locs.includes(w));
  if (extra.length) fail(`sitemap has URLs that are not public pages: ${extra.join(', ')}`);
  if (missing.length) fail(`sitemap is missing: ${missing.join(', ')}`);
  for (const loc of locs) {
    const p = loc.slice(config.siteUrl.length) || '/';
    if (PRIVATE_PREFIXES.some((prefix) => p.startsWith(prefix.replace(/\/$/, ''))) && p !== '/')
      fail(`sitemap has a private URL: ${loc}`);
  }
}

// 2. robots.txt and llms.txt
if (!exists('robots.txt')) fail('dist/robots.txt is missing');
else {
  const robots = read('robots.txt');
  if (!robots.includes('Disallow: /api/')) fail('robots.txt does not block /api/');
  if (!robots.includes(`Sitemap: ${absoluteUrl(config, '/sitemap.xml')}`))
    fail('robots.txt does not point to the sitemap');
}
if (!exists('llms.txt')) fail('dist/llms.txt is missing');
else if (!read('llms.txt').startsWith('# ')) fail('llms.txt does not start with a "# " title');

// 3. static heads
for (const route of [...PAGES.map((p) => p.path), ...ZEN_SECTION_PATHS]) {
  const file = route === '/' ? 'index.html' : path.join(route.slice(1), 'index.html');
  if (!exists(file)) {
    fail(`no static head file for ${route} (dist/${file})`);
    continue;
  }
  const html = read(file);
  for (const needle of [
    '<title>',
    'name="description"',
    'rel="canonical"',
    'property="og:title"',
    'property="og:image"',
    'name="twitter:card"',
  ]) {
    if (!html.includes(needle)) fail(`${route}: ${needle} is missing from dist/${file}`);
  }
  if (/Vite \+ React|<title>Vite|vite\.svg/i.test(html))
    fail(`${route}: Vite or React defaults left`);
}
for (const file of ['404.html', 'app.html']) {
  if (!exists(file)) fail(`dist/${file} is missing`);
  else if (!read(file).includes('noindex')) fail(`dist/${file} must be noindex`);
}

// 4. source maps
for (const file of findSourceMaps(dist)) fail(`source map in dist: ${path.relative(dist, file)}`);

// 5. bundle budget: the entry, everything it imports, and the home page's own chunk
const manifestFile = path.join(dist, '.vite', 'manifest.json');
let firstLoad = 0;
const counted = [];
if (!fs.existsSync(manifestFile)) fail('dist/.vite/manifest.json is missing (build.manifest)');
else {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const seen = new Set();
  const visit = (key) => {
    const chunk = manifest[key];
    if (!chunk || seen.has(key)) return;
    seen.add(key);
    if (chunk.file.endsWith('.js')) {
      const bytes = zlib.gzipSync(fs.readFileSync(path.join(dist, chunk.file))).length;
      firstLoad += bytes;
      counted.push(`${chunk.file} ${(bytes / 1024).toFixed(1)} KB`);
    }
    for (const dep of chunk.imports ?? []) visit(dep);
  };
  visit('index.html');
  visit('src/pages/public/HomePage.tsx');
  if (firstLoad > BUDGET_BYTES)
    fail(
      `public first-load JavaScript is ${(firstLoad / 1024).toFixed(1)} KB gzip (budget ${BUDGET_BYTES / 1024} KB)`,
    );
}

// 6. placeholders in what visitors receive as pages
const textFiles = [];
const walk = (folder) => {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '.vite' && entry.name !== 'photos') walk(full);
    } else if (/\.(html|xml|txt|webmanifest)$/.test(entry.name)) textFiles.push(full);
  }
};
if (fs.existsSync(dist)) walk(dist);
for (const file of textFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(text))
      fail(`placeholder text ${pattern} in dist/${path.relative(dist, file)}`);
  }
}

// 7. share images
for (const page of PAGES.filter((p) => p.og)) {
  if (!fs.existsSync(path.join(root, 'public', 'og', `${page.og}.png`)))
    warnings.push(`public/og/${page.og}.png is missing: run npm run og:images`);
}
if (config.isLocalUrl) warnings.push('VITE_SITE_URL is not set: canonicals use a local address');

console.log(`Public first-load JavaScript: ${(firstLoad / 1024).toFixed(1)} KB gzip`);
for (const line of counted) console.log(`  ${line}`);
for (const w of warnings) console.log(`WARNING: ${w}`);
if (failures.length) {
  console.error(`\ncheck-build FAILED (${failures.length}):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\ncheck-build: all checks passed.');
