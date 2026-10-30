// Task 11: lists the owner's photos in public/photos so the app can use a real photo when one
// exists and fall back to the generated artwork when it does not -- decided when the page is
// built (and live in `npm run dev`), so a missing photo never causes a failed request.
//
//   import photos from 'virtual:photo-manifest'
//   import placeholders from 'virtual:photo-placeholders'
//
// `photos` is the list of image file names (e.g. ["salon-hero.png"]); the app picks one per slot
// with pickPhoto() (webp, then jpg, jpeg, png). `placeholders` maps a slot to a tiny blurred
// preview (a data: URL) written by `npm run photos:optimize`; a preview is only used while it
// still matches the photo file it was made from.
import fs from 'node:fs';
import path from 'node:path';
import { PHOTO_EXTENSIONS, PHOTO_SLOTS, pickPhoto } from './photo-slots.js';

const ID = 'virtual:photo-manifest';
const RESOLVED = '\0' + ID;
const PREVIEWS_ID = 'virtual:photo-placeholders';
const PREVIEWS = '\0' + PREVIEWS_ID;
const PHOTO = new RegExp(`\\.(${PHOTO_EXTENSIONS.join('|')})$`, 'i');
export const PLACEHOLDERS = 'placeholders.json';

export function readManifest(dir) {
  let files = [];
  try {
    files = fs
      .readdirSync(dir)
      .filter((name) => PHOTO.test(name))
      .sort();
  } catch {
    return { files: [], placeholders: {} };
  }
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(path.join(dir, PLACEHOLDERS), 'utf8'));
  } catch {
    saved = {};
  }
  const placeholders = {};
  for (const slot of Object.keys(PHOTO_SLOTS)) {
    const file = pickPhoto(slot, files);
    const entry = saved[slot];
    if (!file || !entry || entry.file !== file) continue;
    try {
      if (fs.statSync(path.join(dir, file)).size !== entry.bytes) continue;
    } catch {
      continue;
    }
    placeholders[slot] = entry.data;
  }
  return { files, placeholders };
}

export default function photoManifest() {
  const dir = path.resolve('public/photos');
  return {
    name: 'photo-manifest',
    resolveId(id) {
      if (id === ID) return RESOLVED;
      if (id === PREVIEWS_ID) return PREVIEWS;
      return undefined;
    },
    load(id) {
      if (id === RESOLVED) return `export default ${JSON.stringify(readManifest(dir).files)};`;
      if (id === PREVIEWS) {
        return `export default ${JSON.stringify(readManifest(dir).placeholders)};`;
      }
      return undefined;
    },
    configureServer(server) {
      server.watcher.add(dir);
      const changed = (file) => {
        if (path.dirname(file) !== dir) return;
        for (const key of [RESOLVED, PREVIEWS]) {
          const mod = server.moduleGraph.getModuleById(key);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', changed);
      server.watcher.on('unlink', changed);
      server.watcher.on('change', changed);
    },
  };
}
