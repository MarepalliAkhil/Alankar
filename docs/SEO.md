# SEO, metadata and the public build

Everything a search engine or a share preview (WhatsApp, LinkedIn, X) reads about Alankar comes from
one file: `frontend/src/seo/seo-data.js` (page titles, 120 to 160 character descriptions, which pages
are indexed, breadcrumbs, share images, structured data). The browser app uses it while you click
around (`src/seo/head.ts`) and the build writes the same tags into static HTML
(`scripts/seo-build.mjs`), because crawlers and share previews do not run JavaScript.

## 1. SITE_URL and the business details

Set them in `frontend/.env.production` (create it; never commit secrets, but these are not secret) or
in the host's build environment. They are read when the site is built.

```
VITE_SITE_URL=https://www.your-domain.in
# Only when the shop is real. Leave all of these empty for the demo.
VITE_BUSINESS_NAME=Alankar
VITE_BUSINESS_PHONE=+91 98xxx xxxxx
VITE_BUSINESS_EMAIL=hello@your-domain.in
VITE_BUSINESS_STREET=12 MG Road
VITE_BUSINESS_CITY=Vijayawada
VITE_BUSINESS_REGION=Andhra Pradesh
VITE_BUSINESS_POSTAL_CODE=520010
VITE_BUSINESS_COUNTRY=IN
VITE_BUSINESS_HOURS=Mo-Sa 10:00-20:00, Su 10:00-18:00
VITE_BUSINESS_LATITUDE=16.5062
VITE_BUSINESS_LONGITUDE=80.6480
```

- `VITE_SITE_URL` has no trailing slash. Every canonical link, `og:url`, `og:image`, sitemap entry,
  robots.txt sitemap line, llms.txt link and JSON-LD URL is built from it. Without it the build uses
  `http://localhost:5173` and `npm run build:check` prints a warning.
- The business details are "real" only when phone, street, city and postal code are all set and none
  looks like a placeholder. Only then does the site show them (footer, home page) and publish
  `LocalBusiness` structured data. With demo or empty details the site shows honest labels ("Demo
  project, address not real") and publishes no LocalBusiness data, so no fake business reaches
  search engines.
- The code reads them through `frontend/src/config/brand.ts` (`site`, `SITE_URL`, `business`).

### When you connect your custom domain

1. Point the domain at the host (the host's DNS instructions), and turn on HTTPS.
2. Set `VITE_SITE_URL=https://<your domain>` in the host's build settings (or `.env.production`).
3. Rebuild and deploy (`npm run build`). Check `https://<your domain>/sitemap.xml` shows your domain.
4. Backend: add the domain to `SALON_ALLOWED_HOSTS` and `SALON_CORS_ORIGINS`, and set
   `SALON_FRONTEND_URL` (emailed links) to the same address; run `python manage.py deploy_check`.
5. Search Console: add the domain property and submit `https://<your domain>/sitemap.xml`.

## 2. Public addresses

| Address | Page | Indexed |
|---|---|---|
| `/` | Home | yes |
| `/salon`, `/spa`, `/beauty-parlor` | Division pages | yes |
| `/book` | Short link: booking sheet (customers), customer sign-in (guests) | no (redirect) |
| `/for-zenotians` | For Zenotians (one page; section addresses such as `/for-zenotians/contact` open the same page at that section and share its canonical) | yes |
| `/login`, `/register` | Sign in, create a customer account | yes |
| `/privacy`, `/terms`, `/cancellation-policy` | Policies (with breadcrumbs) | yes |
| `/forgot-password`, `/reset-password`, `/accept-invite`, `/unsubscribe` | Account utilities (with breadcrumbs) | no |
| everything a signed-in role opens (`/customer/...`, `/dashboard`, `/appointments`, ...) | The app | no (noindex, nofollow; blocked in robots.txt) |

Old addresses keep working: `/zenotians` and `/zenotians/<section>` redirect to `/for-zenotians` and
`/for-zenotians/<section>` (in the app, and as permanent 301 host rules below).

## 3. What the build writes (`npm run build`)

`vite build`, then `scripts/seo-build.mjs`, then `scripts/check-sourcemaps.mjs`:

- `dist/<route>/index.html` for every public route and every For Zenotians section address, with the
  title, description, canonical, robots, Open Graph, Twitter and JSON-LD already in the HTML;
  `dist/index.html` is the home page.
- `dist/app.html`: the signed-in app (noindex, nofollow).
- `dist/404.html`: shown with HTTP status 404 for unknown addresses (noindex); the app inside shows
  the designed "Page not found" page.
- `dist/sitemap.xml` (indexed pages only), `dist/robots.txt`, `dist/llms.txt`.
- `dist/_redirects`: the host rules for Netlify and Cloudflare Pages.
- No source maps (`build.sourcemap: false`); the build fails if a `.map` file or a
  `sourceMappingURL` comment appears.

`npm run build:check` then checks the result: sitemap has only public pages, robots.txt and llms.txt
exist, every public route has its static head, no source maps, the public first-load JavaScript is
at most 200 KB gzip (it prints the size and the files counted), no placeholder text in the pages,
and warns if a share image is missing.

`npm run build:analyze` writes `frontend/dist-stats.html` (a map of what is inside each JavaScript
file, `rollup-plugin-visualizer`).

## 4. Host rules

The order matters: real files first, then the rewrites, then 404.

**Netlify / Cloudflare Pages**: nothing to do; `dist/_redirects` is written by the build. Unknown
addresses get `404.html` with status 404 automatically.

**Vercel** (`vercel.json` in the frontend folder, output directory `dist`):

```json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "redirects": [
    { "source": "/zenotians", "destination": "/for-zenotians", "permanent": true },
    { "source": "/zenotians/:path*", "destination": "/for-zenotians/:path*", "permanent": true }
  ],
  "rewrites": [
    { "source": "/(customer|customer-dashboard|dashboard|appointments|schedule|customers|staff|my-day|my-appointments|my-schedule|my-hours|requests|earnings|chat|profile|notifications|pos|orders|inventory|settings|content|marketing|reports|audit-log|security|ratings|payroll|work-hours|staff-summary|services|memberships|packages|package-requests|gift-cards|waitlist|chatbot-insights|air-activity|cash-close)/:path*", "destination": "/app.html" },
    { "source": "/(customer-dashboard|dashboard|appointments|schedule|customers|staff|my-day|my-appointments|my-schedule|my-hours|requests|earnings|chat|profile|notifications|pos|orders|inventory|settings|content|marketing|reports|audit-log|security|ratings|payroll|work-hours|staff-summary|services|memberships|packages|package-requests|gift-cards|waitlist|chatbot-insights|air-activity|cash-close)", "destination": "/app.html" }
  ]
}
```

Vercel serves `404.html` with status 404 for anything else.

**Nginx**:

```nginx
location = /zenotians { return 301 /for-zenotians; }
location ^~ /zenotians/ { rewrite ^/zenotians/(.*)$ /for-zenotians/$1 permanent; }
location /api/ { proxy_pass http://127.0.0.1:8000; }
location ~ ^/(customer|customer-dashboard|dashboard|appointments|schedule|customers|staff|my-day|my-appointments|my-schedule|my-hours|requests|earnings|chat|profile|notifications|pos|orders|inventory|settings|content|marketing|reports|audit-log|security|ratings|payroll|work-hours|staff-summary|services|memberships|packages|package-requests|gift-cards|waitlist|chatbot-insights|air-activity|cash-close)(/|$) {
  try_files /app.html =404;
}
location / {
  try_files $uri $uri/index.html =404;
}
error_page 404 /404.html;
```

The list of signed-in areas is `PRIVATE_PREFIXES` in `src/seo/seo-data.js`; keep the host rules in
step when a new signed-in area is added.

## 5. Share images

`npm run og:images` (needs `sharp`, already a dev dependency) writes `frontend/public/og/home.png`,
`salon.png`, `spa.png`, `beauty-parlor.png` and `for-zenotians.png` (1200 x 630) from the shop's own
photos, the logo and the page name. Run it again after replacing a photo. Each page's `og:image` has
its width, height and alt text.

## 6. Checking after a deploy

- Share previews: paste a page address into the LinkedIn Post Inspector
  (https://www.linkedin.com/post-inspector/) and the Facebook Sharing Debugger
  (https://developers.facebook.com/tools/debug/; WhatsApp uses the same tags). Re-scrape after a
  change.
- Structured data: Google Rich Results Test (https://search.google.com/test/rich-results) and the
  Schema Markup Validator (https://validator.schema.org/) on `/` (WebSite, Organization) and a
  policy page (BreadcrumbList). LocalBusiness appears only once real business details are set.
- Raw HTML: `curl -s https://<your domain>/salon | findstr "og:title canonical"` shows the tags
  without JavaScript.
- 404: `curl -s -o NUL -w "%{http_code}" https://<your domain>/no-such-page` prints `404`.
- Search Console: the sitemap is read and no signed-in page is indexed.
