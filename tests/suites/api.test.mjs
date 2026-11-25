import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, createClient, apiError } from '../../utils/api.js';

// Run `fn` with a fake global fetch.
async function withFetch(fake, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

const json = (status, body) => async () => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

test('fetchJson returns parsed data on 200', async () => {
  const res = await withFetch(json(200, { a: 1 }), () => fetchJson('http://x'));
  assert.deepEqual(res, { status: 200, data: { a: 1 } });
});

test('fetchJson maps 403 to a "forbidden" error', async () => {
  await withFetch(json(403, {}), async () => {
    await assert.rejects(fetchJson('http://x'), (e) => e.kind === 'forbidden' && e.status === 403);
  });
});

test('fetchJson maps other HTTP failures to "http" with the status', async () => {
  await withFetch(json(500, {}), async () => {
    await assert.rejects(fetchJson('http://x'), (e) => e.kind === 'http' && e.status === 500);
  });
});

test('fetchJson maps a body that is not JSON to "parse"', async () => {
  const bad = async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError('x'); } });
  await withFetch(bad, async () => {
    await assert.rejects(fetchJson('http://x'), (e) => e.kind === 'parse');
  });
});

test('fetchJson maps a thrown fetch to "network"', async () => {
  const down = async () => { throw new TypeError('Failed to fetch'); };
  await withFetch(down, async () => {
    await assert.rejects(fetchJson('http://x'), (e) => e.kind === 'network' && /Failed to fetch/.test(e.message));
  });
});

test('fetchJson times out', async () => {
  const hang = () => new Promise(() => {});
  await withFetch(hang, async () => {
    await assert.rejects(fetchJson('http://x', { timeoutMs: 20 }), (e) => e.kind === 'timeout');
  });
});

// ── createClient ──────────────────────────────────────────

function fakeFetchJson() {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    return { status: 200, data: { url } };
  };
  fn.calls = calls;
  return fn;
}

test('client prefixes the base URL and returns the body', async () => {
  const fj = fakeFetchJson();
  const api = createClient({ base: 'http://base', fetchJson: fj });
  assert.deepEqual(await api.get('/a?x=1'), { url: 'http://base/a?x=1' });
});

test('client caches within the TTL and refetches after it', async () => {
  const fj = fakeFetchJson();
  let t = 1000;
  const api = createClient({ base: 'http://b', fetchJson: fj, ttlMs: 500, now: () => t });
  await api.get('/a');
  t += 400;
  await api.get('/a');
  assert.equal(fj.calls.length, 1);
  t += 200; // 600ms since the first call
  await api.get('/a');
  assert.equal(fj.calls.length, 2);
});

test('client shares one request between concurrent callers', async () => {
  let resolve;
  const calls = [];
  const fj = (url) => {
    calls.push(url);
    return new Promise((r) => { resolve = () => r({ status: 200, data: { ok: true } }); });
  };
  const api = createClient({ base: 'http://b', fetchJson: fj });
  const p1 = api.get('/a');
  const p2 = api.get('/a');
  resolve();
  assert.deepEqual(await p1, { ok: true });
  assert.deepEqual(await p2, { ok: true });
  assert.equal(calls.length, 1);
});

test('client never caches failures', async () => {
  let fail = true;
  const calls = [];
  const fj = async (url) => {
    calls.push(url);
    if (fail) throw apiError('network', 'down', 0);
    return { status: 200, data: { ok: true } };
  };
  const api = createClient({ base: 'http://b', fetchJson: fj });
  await assert.rejects(api.get('/a'), (e) => e.kind === 'network');
  fail = false;
  assert.deepEqual(await api.get('/a'), { ok: true });
  assert.equal(calls.length, 2);
});

test('client.clear drops the cache', async () => {
  const fj = fakeFetchJson();
  const api = createClient({ base: 'http://b', fetchJson: fj });
  await api.get('/a');
  api.clear();
  await api.get('/a');
  assert.equal(fj.calls.length, 2);
});
