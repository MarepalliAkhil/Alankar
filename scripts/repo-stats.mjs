#!/usr/bin/env node
// Counts real things in this repository and writes frontend/src/generated/repo-stats.json.
// Run by `npm run build` (prebuild) and checked by a unit test, so the numbers on the
// For Zenotians page can never drift from, or be invented beyond, what the repository contains.
//   node scripts/repo-stats.mjs          write the file
//   node scripts/repo-stats.mjs --check  exit 1 if the file is out of date
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'frontend', 'src', 'generated', 'repo-stats.json');
const SKIP = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', 'dist', 'staticfiles', 'generated']);

function walk(dir, visit) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, visit);
    else visit(path);
  }
}
const files = (dir, test) => {
  const found = [];
  walk(dir, (path) => test(relative(root, path).split(sep).join('/')) && found.push(path));
  return found;
};
const count = (paths, pattern) =>
  paths.reduce((sum, path) => sum + (readFileSync(path, 'utf8').match(pattern) ?? []).length, 0);

export function collect() {
  const policy = JSON.parse(readFileSync(join(root, 'shared', 'policy.json'), 'utf8'));
  const backend = join(root, 'backend');
  const frontend = join(root, 'frontend');

  const pages = files(join(frontend, 'src', 'pages'), (p) => /Page\.tsx$/.test(p)).length;

  const urlFiles = files(backend, (p) => /\/[a-z_]*urls\.py$/.test(p) && !p.includes('/tests/'));
  const endpoints =
    count(urlFiles, /^\s*(?:re_)?path\(/gm) - count(urlFiles, /^\s*(?:re_)?path\([^\n]*include\(/gm);

  const pyTests = files(backend, (p) => /\/(test_[^/]*|tests)\.py$/.test(p));
  const backendTests = count(pyTests, /^\s*(?:async )?def test_/gm);
  const unitTests = count(
    files(join(frontend, 'src'), (p) => /\.test\.tsx?$/.test(p)),
    /^\s*(?:it|test)(?:\.each\([^)]*\))?\(/gm,
  );
  const e2eTests = count(
    files(join(frontend, 'e2e'), (p) => /\.e2e\.ts$/.test(p)),
    /^\s*test(?:\.\w+)?\(/gm,
  );

  const migrations = files(backend, (p) => /\/migrations\/\d{4}_[^/]*\.py$/.test(p)).length;

  return {
    roles: Object.keys(policy.roles).length,
    pages,
    apiEndpoints: endpoints,
    automatedTests: backendTests + unitTests + e2eTests,
    testBreakdown: { backend: backendTests, frontendUnit: unitTests, endToEnd: e2eTests },
    migrations,
    method: {
      roles: 'roles in shared/policy.json',
      pages: 'frontend/src/pages/**/*Page.tsx files',
      apiEndpoints: 'path() routes in backend urls.py files, not counting include()',
      automatedTests: 'test functions: pytest def test_, Vitest it/test, Playwright test',
      migrations: 'numbered files in backend/*/migrations',
    },
  };
}

if (!existsSync(join(root, 'shared', 'policy.json'))) {
  console.log('repo-stats: repository folders not found, keeping the committed file.');
  process.exit(0);
}
const next = JSON.stringify(collect(), null, 2) + '\n';
if (process.argv.includes('--check')) {
  const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
  if (current !== next) {
    console.error('repo-stats.json is out of date: run `node scripts/repo-stats.mjs`.');
    process.exit(1);
  }
  console.log('repo-stats.json is up to date.');
} else {
  writeFileSync(out, next);
  console.log(`Wrote ${relative(root, out)}`);
}
