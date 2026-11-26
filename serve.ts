// A pocket static file server for game/ (Node 22, standard library
// only). It exists so the entry can be flown locally with no build step:
//   node serve.ts
// then open http://localhost:8080 in a desktop browser. It answers with
// the MIME types a browser game needs, turns away any path that climbs
// out of game/, and otherwise stays out of the way — a development
// convenience, never a server for the open internet.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The one directory ever served: game/ beside this file.
const GAME_ROOT = resolve(fileURLToPath(new URL('./game', import.meta.url)));

// --port N picks the port; anything missing or out of range falls back
// to 8080 rather than failing to start.
function pickPort(argv) {
  const flagAt = argv.indexOf('--port');
  const wanted = flagAt === -1 ? 8080 : Number(argv[flagAt + 1]);
  return Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : 8080;
}

const PORT = pickPort(process.argv.slice(2));

// One MIME type per suffix the game can plausibly ask for; anything
// unlisted is handed over as a generic byte stream.
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

function contentTypeFor(filePath) {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

// Turn the request URL into a file inside GAME_ROOT, or null when the
// URL itself is malformed.
function requestedFile(request) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  return resolve(join(GAME_ROOT, normalize(pathname)));
}

function insideGameRoot(filePath) {
  return filePath === GAME_ROOT || filePath.startsWith(GAME_ROOT + sep);
}

function fileSize(filePath) {
  try {
    const info = statSync(filePath);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

function handleRequest(request, response) {
  const file = requestedFile(request);
  if (file === null) {
    response.writeHead(400).end('bad request');
    return;
  }
  if (!insideGameRoot(file)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  const size = fileSize(file);
  if (size === null) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': contentTypeFor(file),
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}

createServer(handleRequest).listen(PORT, '127.0.0.1', () => {
  console.log(`game/ is on http://localhost:${PORT}`);
});

