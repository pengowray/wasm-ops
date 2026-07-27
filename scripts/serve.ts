/**
 * Serves dist/ for local preview.
 *
 *   npm run build && npm run serve
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = join(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'dist');
// Not 8080. That is the first port everything else on a machine reaches for, so
// a stale server of someone else's answers on it and you spend a while reading
// a page this build did not produce.
const PORT = Number(process.env['PORT'] ?? 10303);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');

  // Pages redirects a directory without its trailing slash, and the old page
  // under /old/ has relative links that resolve against the wrong directory
  // without it. Do the same here rather than serve a subtly broken page.
  if (extname(url.pathname) === '' && !url.pathname.endsWith('/')) {
    response.writeHead(301, { location: `${url.pathname}/${url.search}` });
    response.end();
    return;
  }

  const path = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
  // Keep the served tree inside dist/.
  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));

  try {
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      // Without this the browser happily serves a previous build back to you
      // after a rebuild, and you debug a page that no longer exists on disk.
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
