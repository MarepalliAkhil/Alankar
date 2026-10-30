// Task 11: lists the owner's photos in public/photos so the app can use a real photo when one
// exists and fall back to the generated artwork when it does not -- decided when the page is
// built, so a missing photo never causes a failed request in the browser.
//
// `import photos from 'virtual:photo-manifest'` gives an array of file names, e.g.
// ["salon-background.jpg"]. In development, adding or removing a photo reloads the page.
import fs from 'node:fs';
import path from 'node:path';

const ID = 'virtual:photo-manifest';
const RESOLVED = '\0' + ID;
const PHOTO = /\.(jpe?g|png|webp|avif)$/i;

export default function photoManifest() {
  const dir = path.resolve('public/photos');
  const list = () => {
    try {
      return fs
        .readdirSync(dir)
        .filter((name) => PHOTO.test(name))
        .sort();
    } catch {
      return [];
    }
  };
  return {
    name: 'photo-manifest',
    resolveId(id) {
      return id === ID ? RESOLVED : undefined;
    },
    load(id) {
      return id === RESOLVED ? `export default ${JSON.stringify(list())};` : undefined;
    },
    configureServer(server) {
      server.watcher.add(dir);
      const changed = (file) => {
        if (path.dirname(file) !== dir) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', changed);
      server.watcher.on('unlink', changed);
    },
  };
}
