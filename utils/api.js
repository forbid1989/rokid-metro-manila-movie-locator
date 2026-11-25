/**
 * JSON-over-fetch helper with a timeout and typed errors, plus a small client
 * with a TTL cache.
 *
 * Errors carry `kind`: 'timeout' | 'forbidden' | 'http' | 'parse' | 'network'
 * and `status` (HTTP status, 0 when there was none).
 */
import { REMOTE_BASE } from './env.js';

export function apiError(kind, message, status) {
  const err = new Error(message);
  err.kind = kind;
  err.status = status || 0;
  return err;
}

export async function fetchJson(url, opts) {
  const timeoutMs = (opts && opts.timeoutMs) || 8000;
  let timer = null;
  const timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () { reject(apiError('timeout', 'Timed out', 0)); }, timeoutMs);
  });
  try {
    const res = await Promise.race([fetch(url), timeout]);
    if (res.status === 403) throw apiError('forbidden', 'Blocked (403)', 403);
    if (!res.ok) throw apiError('http', 'HTTP ' + res.status, res.status);
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw apiError('parse', 'Unreadable response', res.status);
    }
    return { status: res.status, data: data };
  } catch (err) {
    if (err && err.kind) throw err;
    throw apiError('network', (err && err.message) ? err.message : String(err), 0);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A client for the movies API. `get(path)` resolves to the parsed JSON body.
 * Successful responses are cached for `ttlMs` and concurrent requests for the
 * same path share one network call; failures are never cached.
 *
 *   const api = createClient();
 *   const data = await api.get('/theater/the-podium?date=2026-11-17');
 */
export function createClient(options) {
  const o = Object.assign({
    base: REMOTE_BASE,
    fetchJson: fetchJson,
    ttlMs: 60000,
    timeoutMs: 8000,
    now: Date.now,
  }, options || {});
  const cache = new Map();

  function get(path) {
    const hit = cache.get(path);
    if (hit && (hit.pending || o.now() - hit.at < o.ttlMs)) return hit.promise;
    const entry = { at: o.now(), pending: true, promise: null };
    entry.promise = o.fetchJson(o.base + path, { timeoutMs: o.timeoutMs }).then(
      function (res) {
        entry.pending = false;
        entry.at = o.now();
        return res.data;
      },
      function (err) {
        if (cache.get(path) === entry) cache.delete(path);
        throw err;
      }
    );
    cache.set(path, entry);
    return entry.promise;
  }

  return { get: get, clear: function () { cache.clear(); } };
}
