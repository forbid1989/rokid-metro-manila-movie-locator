#!/usr/bin/env node
/**
 * Dev-only CORS proxy for `aix preview`.
 *
 * The ClickTheCity API only sends Access-Control-Allow-Origin for some origins,
 * so a page served by `aix preview` (http://127.0.0.1:<random port>) cannot read
 * its responses. This forwards GET /api/movies/* to the real API from Node (no
 * CORS there) and adds permissive CORS headers.
 *
 *   npm run dev:proxy            # listens on http://127.0.0.1:8787
 *   PORT=9000 npm run dev:proxy
 *
 * Not part of the packaged agent (see .aixignore). Binds to localhost only and
 * only forwards GET requests under /api/movies/.
 */
import http from 'node:http';

const PORT = Number(process.env.PORT) || 8787;
const UPSTREAM = new URL('https://www.clickthecity.com');
// The upstream rejects curl's default User-Agent; identify honestly instead.
const USER_AGENT = 'MovieLocatorPrototype/0.1 (dev proxy)';
const TIMEOUT_MS = 15000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '600',
};

function send(res, status, body, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS, extra || {}));
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  let target;
  try {
    target = new URL(req.url, UPSTREAM);
  } catch (err) {
    send(res, 400, JSON.stringify({ error: 'bad url' }));
    return;
  }
  // Resolved URL must still be the upstream host and under /api/movies/
  // (blocks `//other.host/...` and `..` tricks).
  if (req.method !== 'GET' || target.origin !== UPSTREAM.origin || !target.pathname.startsWith('/api/movies/')) {
    send(res, 404, JSON.stringify({ error: 'not proxied' }));
    return;
  }

  const t0 = Date.now();
  try {
    const up = await fetch(target, {
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = Buffer.from(await up.arrayBuffer());
    send(res, up.status, body, { 'Content-Type': up.headers.get('content-type') || 'application/json' });
    console.log(`${up.status} ${target.pathname}${target.search} ${Date.now() - t0}ms`);
  } catch (err) {
    send(res, 502, JSON.stringify({ error: 'upstream failed', message: String(err && err.message || err) }));
    console.log(`502 ${target.pathname}${target.search} ${err && err.message}`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`dev proxy: http://127.0.0.1:${PORT}/api/movies/...  ->  ${UPSTREAM.origin}`);
});
