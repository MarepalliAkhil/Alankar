import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every <img> tag in the app's source, read up to its end at brace depth 0 (so an arrow
 * function inside an attribute does not end the tag early). */
export function imgTags(source: string): string[] {
  const tags: string[] = [];
  let at = source.indexOf('<img');
  while (at !== -1) {
    let depth = 0;
    let end = at + 4;
    for (; end < source.length; end += 1) {
      const ch = source[end];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) break;
    }
    tags.push(source.slice(at, end + 1));
    at = source.indexOf('<img', end);
  }
  return tags.filter((tag) => /^<img[\s/>]/.test(tag));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(name) && !name.includes('.test.') ? [full] : [];
  });
}

describe('images carry alt text', () => {
  it('reads a tag to its real end', () => {
    expect(imgTags('<img src={a} onLoad={() => go(1 > 0)} alt="" />')).toEqual([
      '<img src={a} onLoad={() => go(1 > 0)} alt="" />',
    ]);
  });

  it('has an alt attribute on every <img> in the app (alt="" for decorative pictures)', () => {
    const root = join(process.cwd(), 'src');
    const missing: string[] = [];
    for (const file of sourceFiles(root)) {
      for (const tag of imgTags(readFileSync(file, 'utf8'))) {
        if (!/\balt=/.test(tag))
          missing.push(`${file.slice(root.length + 1)}: ${tag.slice(0, 80)}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
