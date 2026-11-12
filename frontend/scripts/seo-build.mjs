/**
 * After `vite build`: writes what crawlers and share previews need without running JavaScript.
 *  - dist/<route>/index.html for every public route, with that route's title, description,
 *    canonical, robots, Open Graph, Twitter and JSON-LD already in the HTML
 *  - dist/app.html (the signed-in area, noindex) and dist/404.html (HTTP 404 page, noindex)
 *  - dist/sitemap.xml, dist/robots.txt, dist/llms.txt
 *  - dist/_redirects (Netlify / Cloudflare Pages host rules; other hosts: docs/SEO.md)
 * SITE_URL and the business details come from VITE_* variables (frontend/.env.production or the
 * environment). Run by `npm run build`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import {
  absoluteUrl,
  fullTitle,
  headFor,
  indexablePages,
  PAGES,
  PRIVATE_PREFIXES,
  REDIRECTS,
  SHOP_NAME,
  siteConfig,
  SPECIAL_PAGES,
  ZEN_ROOT,
  ZEN_SECTION_PATHS,
} from '../src/seo/seo-data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const mode = process.argv.includes('--mode')
  ? process.argv[process.argv.indexOf('--mode') + 1]
  : 'production';
const config = siteConfig({ ...loadEnv(mode, root, ''), ...process.env });

const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

/** Removes every head tag this script owns, so a page never carries two of one kind. */
export function stripHead(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="(description|robots)"[\s\S]*?>\s*/gi, '')
    .replace(/<meta\s+property="og:[^"]*"[\s\S]*?>\s*/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[\s\S]*?>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[\s\S]*?>\s*/gi, '')
    .replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi, '');
}

export function headHtml(head) {
  const lines = [
    `<title>${esc(head.title)}</title>`,
    `<meta name="description" content="${esc(head.description)}" />`,
    `<meta name="robots" content="${esc(head.robots)}" />`,
  ];
  if (head.canonical) lines.push(`<link rel="canonical" href="${esc(head.canonical)}" />`);
  if (head.image) {
    lines.push(
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${esc(SHOP_NAME)}" />`,
      `<meta property="og:title" content="${esc(head.title)}" />`,
      `<meta property="og:description" content="${esc(head.description)}" />`,
      `<meta property="og:url" content="${esc(head.canonical)}" />`,
      `<meta property="og:image" content="${esc(head.image.url)}" />`,
      `<meta property="og:image:width" content="${head.image.width}" />`,
      `<meta property="og:image:height" content="${head.image.height}" />`,
      `<meta property="og:image:alt" content="${esc(head.image.alt)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(head.title)}" />`,
      `<meta name="twitter:description" content="${esc(head.description)}" />`,
      `<meta name="twitter:image" content="${esc(head.image.url)}" />`,
      `<meta name="twitter:image:alt" content="${esc(head.image.alt)}" />`,
    );
  }
  for (const item of head.jsonLd ?? []) {
    lines.push(`<script type="application/ld+json">${json(item)}</script>`);
  }
  return lines.map((line) => `    ${line}`).join('\n');
}

export function withHead(shell, head) {
  return stripHead(shell).replace('</head>', `${headHtml(head)}\n  </head>`);
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function routeFile(route) {
  return route === '/' ? path.join(dist, 'index.html') : path.join(dist, route, 'index.html');
}

function main() {
  const shellFile = path.join(dist, 'index.html');
  if (!fs.existsSync(shellFile))
    throw new Error('dist/index.html is missing: run vite build first.');
  // The untouched shell is kept so a second run starts from the same file.
  const keep = path.join(dist, '.vite', 'shell.html');
  if (!fs.existsSync(keep)) write(keep, fs.readFileSync(shellFile, 'utf8'));
  const shell = fs.readFileSync(keep, 'utf8');

  const routes = [...PAGES.map((p) => p.path), ...ZEN_SECTION_PATHS];
  for (const route of routes) write(routeFile(route), withHead(shell, headFor(config, route)));

  const privateHead = (title, description) => ({
    title: title ? fullTitle(title) : SHOP_NAME,
    description,
    robots: 'noindex, nofollow',
    canonical: null,
    image: null,
    jsonLd: [],
  });
  write(path.join(dist, 'app.html'), withHead(shell, privateHead('', 'Alankar: signed-in area.')));
  write(
    path.join(dist, '404.html'),
    withHead(shell, privateHead(SPECIAL_PAGES.notFound.title, SPECIAL_PAGES.notFound.description)),
  );

  const today = new Date().toISOString().slice(0, 10);
  const urls = indexablePages()
    .map(
      (page) =>
        `  <url>\n    <loc>${esc(absoluteUrl(config, page.path))}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`,
    )
    .join('\n');
  write(
    path.join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );

  const disallow = PRIVATE_PREFIXES.map((prefix) => `Disallow: ${prefix}`).join('\n');
  write(
    path.join(dist, 'robots.txt'),
    `User-agent: *\nAllow: /\n${disallow}\n\nSitemap: ${absoluteUrl(config, '/sitemap.xml')}\n`,
  );

  const line = (route, text) => {
    const page = PAGES.find((p) => p.path === route);
    return `- [${page.label}](${absoluteUrl(config, route)}): ${text}`;
  };
  write(
    path.join(dist, 'llms.txt'),
    [
      `# ${SHOP_NAME}`,
      '',
      '> Alankar is a demo portfolio project, not a real shop: the website and management system of a unisex salon, spa and beauty parlor. Customers send booking requests that the front desk and the stylist both accept; payments and text messages are simulated.',
      '',
      'Built by one developer as an independent portfolio project (not affiliated with Zenoti). Names, prices and accounts in the demo are made up.',
      '',
      '## Key pages',
      '',
      line('/', 'what the shop offers, opening hours and how booking works'),
      line('/salon', 'haircuts, colour, beard and grooming services with prices'),
      line('/spa', 'massages and other spa treatments with times and prices'),
      line('/beauty-parlor', 'facials, bridal makeup, nails and waxing with prices'),
      line('/book', 'start a booking request (customers sign in first)'),
      line('/cancellation-policy', 'when a booking can be cancelled or moved for free'),
      line('/privacy', 'what personal data is kept and for how long'),
      '',
      '## For Zenotians',
      '',
      line(
        ZEN_ROOT,
        'the portfolio page: what was built, how it maps to salon software, quality evidence, security, limitations and a demo guide',
      ),
      '',
    ].join('\n'),
  );

  const rules = [
    '# Host rules for Netlify and Cloudflare Pages (other hosts: docs/SEO.md).',
    '# Old addresses: permanent redirects.',
    ...REDIRECTS.map((r) =>
      r.from.endsWith('/*')
        ? `${r.from} ${r.to.replace('/*', '/:splat')} 301`
        : `${r.from} ${r.to} 301`,
    ),
    '# The signed-in area is one app page (never indexed).',
    ...PRIVATE_PREFIXES.filter((p) => p !== '/api/').flatMap((prefix) =>
      prefix.endsWith('/')
        ? [`${prefix}* /app.html 200`]
        : [`${prefix} /app.html 200`, `${prefix}/* /app.html 200`],
    ),
    '# Anything else that is not a file gets 404.html with HTTP status 404 (host default).',
    '',
  ];
  write(path.join(dist, '_redirects'), rules.join('\n'));

  const where = config.isLocalUrl
    ? ' (WARNING: VITE_SITE_URL is not set; using a local address)'
    : '';
  console.log(
    `seo-build: ${routes.length} pages with static heads, sitemap with ${indexablePages().length} URLs, robots.txt, llms.txt, 404.html, app.html, _redirects. Site URL ${config.siteUrl}${where}. LocalBusiness data: ${config.businessIsReal ? 'yes (real details set)' : 'no (no real details)'}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
