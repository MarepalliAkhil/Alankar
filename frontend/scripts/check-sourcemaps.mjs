/** Fails (exit 1) when the production build carries a source map: a .map file or a
 * sourceMappingURL comment anywhere in dist. Run by `npm run build`. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

export function findSourceMaps(dir) {
  const found = [];
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.map')) found.push(full);
      else if (/\.(js|mjs|css)$/.test(entry.name)) {
        if (/[#@]\s*sourceMappingURL=/.test(fs.readFileSync(full, 'utf8'))) found.push(full);
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return found;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const found = findSourceMaps(dist);
  if (found.length) {
    console.error(
      `Source maps found in dist (not allowed in production):\n  ${found.join('\n  ')}`,
    );
    process.exit(1);
  }
  console.log('check-sourcemaps: no source maps in dist.');
}
