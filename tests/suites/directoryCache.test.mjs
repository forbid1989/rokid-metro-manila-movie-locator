import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectoryService } from '../../utils/directoryCache.js';
import { apiError } from '../../utils/api.js';
import { makeFakeGet } from '../helpers.mjs';

const DAY = 24 * 60 * 60 * 1000;

function memoryStorage() {
  const data = {};
  return {
    data,
    getStorageSync: (k) => data[k],
    setStorageSync: (k, v) => { data[k] = v; },
  };
}

test('loads once, then serves from memory', async () => {
  const get = makeFakeGet();
  const svc = createDirectoryService({ get, storage: memoryStorage(), now: () => 1000 });
  const a = await svc.load();
  assert.equal(a.length, 105);
  assert.equal(get.calls.length, 7);
  await svc.load();
  assert.equal(get.calls.length, 7);
});

test('a new session reuses the saved directory instead of refetching', async () => {
  const storage = memoryStorage();
  const first = makeFakeGet();
  await createDirectoryService({ get: first, storage, now: () => 1000 }).load();
  const second = makeFakeGet();
  const list = await createDirectoryService({ get: second, storage, now: () => 1000 + DAY - 1 }).load();
  assert.equal(second.calls.length, 0);
  assert.equal(list.length, 105);
});

test('a day later it is fetched again', async () => {
  const storage = memoryStorage();
  await createDirectoryService({ get: makeFakeGet(), storage, now: () => 1000 }).load();
  const get = makeFakeGet();
  await createDirectoryService({ get, storage, now: () => 1000 + DAY + 1 }).load();
  assert.equal(get.calls.length, 7);
});

test('concurrent callers share one load', async () => {
  const get = makeFakeGet();
  const svc = createDirectoryService({ get, storage: memoryStorage(), now: () => 0 });
  const [a, b] = await Promise.all([svc.load(), svc.load()]);
  assert.equal(get.calls.length, 7);
  assert.equal(a, b);
});

test('a failed load is not cached and is retried', async () => {
  const real = makeFakeGet();
  let down = true;
  const get = async (p) => { if (down) throw apiError('network', 'down'); return real(p); };
  const svc = createDirectoryService({ get, storage: memoryStorage(), now: () => 0 });
  await assert.rejects(svc.load(), (e) => e.kind === 'network');
  down = false;
  assert.equal((await svc.load()).length, 105);
});

test('an incomplete directory is used but not saved, and is retried soon', async () => {
  const real = makeFakeGet();
  let broken = true;
  const get = async (p) => {
    if (broken && p.includes('page=6')) throw apiError('network', 'down');
    return real(p);
  };
  const storage = memoryStorage();
  let clock = 0;
  const svc = createDirectoryService({ get, storage, now: () => clock });
  assert.equal((await svc.load()).length, 90);
  assert.equal(storage.data['directory.v1'], undefined, 'a partial directory is not saved');
  broken = false;
  clock = 30 * 1000;
  assert.equal((await svc.load()).length, 90, 'not retried within the minute');
  clock = 61 * 1000;
  assert.equal((await svc.load()).length, 105, 'retried after a minute');
});

test('invalidate forgets memory and storage', async () => {
  const storage = memoryStorage();
  const get = makeFakeGet();
  const svc = createDirectoryService({ get, storage, now: () => 0 });
  await svc.load();
  svc.invalidate();
  await svc.load();
  assert.equal(get.calls.length, 14);
});

test('works with no storage at all, and survives storage that throws', async () => {
  const get = makeFakeGet();
  assert.equal((await createDirectoryService({ get, now: () => 0 }).load()).length, 105);
  const hostile = { getStorageSync() { throw new Error('no'); }, setStorageSync() { throw new Error('no'); } };
  assert.equal((await createDirectoryService({ get: makeFakeGet(), storage: hostile, now: () => 0 }).load()).length, 105);
});
