// Writes the Caddy matcher for the signed-in areas from PRIVATE_PREFIXES (src/seo/seo-data.js),
// so the web server and the app always agree. Run at image build time:
//   node deploy/caddy/private-routes.mjs > /etc/caddy/private-routes.caddy
import { PRIVATE_PREFIXES } from '../../frontend/src/seo/seo-data.js';

const paths = new Set();
for (const prefix of PRIVATE_PREFIXES) {
  if (prefix.startsWith('/api/')) continue;
  const bare = prefix.replace(/\/+$/, '');
  if (!bare) continue;
  paths.add(bare);
  paths.add(`${bare}/*`);
}
process.stdout.write(`@app path ${[...paths].sort().join(' ')}\n`);
