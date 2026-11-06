import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('repo stats (numbers on the For Zenotians page)', () => {
  it('match what the repository contains (fix with: node scripts/repo-stats.mjs)', () => {
    const script = resolve(here, '../../../scripts/repo-stats.mjs');
    expect(() => execFileSync('node', [script, '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});
