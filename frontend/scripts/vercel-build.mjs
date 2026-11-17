/**
 * The Vercel build (`npm run build:vercel`, set as buildCommand in vercel.json; docs/DEPLOY_FREE.md).
 *
 * 1. Checks vercel.json: the /api rewrite must point at the real Render backend. vercel.json cannot
 *    read environment variables, so that address is written literally in ONE place (the first
 *    rewrite); the build fails while it is still the placeholder.
 * 2. Checks the build variables: SITE_URL (or VITE_SITE_URL) and VITE_WS_ORIGIN.
 * 3. Runs the normal `npm run build` with VITE_SITE_URL taken from SITE_URL.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLACEHOLDER = 'YOUR-RENDER-SERVICE';
const SECRET_HINT = /(SECRET|PASSWORD|TOKEN|PRIVATE|FIELD_KEY|API_KEY)/i;

/** The backend origin from the /api rewrite, e.g. https://alankar-api.onrender.com */
export function backendOrigin(config) {
  const rule = (config.rewrites ?? []).find((r) => r.source?.startsWith('/api/'));
  if (!rule) return null;
  try {
    return new URL(rule.destination.replace(/:path.*$/, '')).origin;
  } catch {
    return null;
  }
}

/** Problems that must stop the build ([] when everything is fine). */
export function checkVercel(config, env) {
  const errors = [];
  const origin = backendOrigin(config);
  const destination = (config.rewrites ?? []).find((r) =>
    r.source?.startsWith('/api/'),
  )?.destination;
  if (!origin || !destination) {
    errors.push('vercel.json: the first rewrite must send /api/:path(.*) to the Render backend.');
  } else if (destination.includes(PLACEHOLDER)) {
    errors.push(
      `vercel.json still has the placeholder ${PLACEHOLDER}: replace it with your Render address (rewrites[0].destination, docs/DEPLOY_FREE.md step 4).`,
    );
  } else if (!origin.startsWith('https://')) {
    errors.push('vercel.json: the Render address must start with https://');
  }
  const site = (env.SITE_URL || env.VITE_SITE_URL || '').trim();
  if (!/^https:\/\/[^/]+$/.test(site.replace(/\/+$/, ''))) {
    errors.push(
      'SITE_URL must be set to the public https address of the site, e.g. https://alankar.vercel.app',
    );
  }
  const ws = (env.VITE_WS_ORIGIN || '').trim();
  if (!/^wss:\/\/[^/]+$/.test(ws.replace(/\/+$/, ''))) {
    errors.push(
      'VITE_WS_ORIGIN must be set to wss://<your Render host>, e.g. wss://alankar-api.onrender.com',
    );
  } else if (origin && !destination?.includes(PLACEHOLDER)) {
    const wsHost = new URL(ws.replace(/^wss:/, 'https:')).host;
    if (wsHost !== new URL(origin).host) {
      errors.push(
        `VITE_WS_ORIGIN (${wsHost}) must be the same host as the /api rewrite (${new URL(origin).host}).`,
      );
    }
  }
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITE_') && SECRET_HINT.test(key)) {
      errors.push(
        `${key}: VITE_ variables are public (built into the pages); never put a secret in one.`,
      );
    }
  }
  return errors;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const errors = checkVercel(config, process.env);
  if (errors.length) {
    for (const error of errors) console.error(`vercel-build: ${error}`);
    process.exit(1);
  }
  const env = { ...process.env };
  env.VITE_SITE_URL = (env.VITE_SITE_URL || env.SITE_URL).replace(/\/+$/, '');
  console.log(`vercel-build: backend ${backendOrigin(config)}, site ${env.VITE_SITE_URL}`);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['run', 'build'], { cwd: root, env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
