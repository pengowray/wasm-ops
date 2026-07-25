/**
 * Serves dist/ for local preview.
 *
 *   npm run build && npm run serve
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = join(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'dist');
const PORT = Number(process.env['PORT'] ?? 8080);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  // Keep the served tree inside dist/.
  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));

  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
