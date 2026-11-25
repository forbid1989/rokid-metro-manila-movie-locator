import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  inMetroManila, resolveLocation, resetLocationCache, locationLabel, DEFAULT_LOCATION,
} from '../../utils/location.js';

beforeEach(() => resetLocationCache());

const fix = (lat, lng) => async () => ({ lat, lng, accuracy: 5 });
const fail = (code) => async () => { throw { code, message: 'x' }; };

test('inMetroManila', () => {
  assert.equal(inMetroManila(14.599, 121.0675), true);   // Ortigas
  assert.equal(inMetroManila(14.6691, 120.9921), true);  // Malabon
  assert.equal(inMetroManila(0, 0), false);              // simulator default
  assert.equal(inMetroManila(10.3157, 123.8854), false); // Cebu
});

test('a fix inside Metro Manila is used as the device location', async () => {
  const loc = await resolveLocation({ getPos: fix(14.6691, 120.9921) });
  assert.equal(loc.source, 'device');
  assert.equal(loc.lat, 14.6691);
  assert.equal(loc.lng, 120.9921);
  assert.equal(locationLabel(loc), 'Near you');
});

test('a fix outside Metro Manila falls back to the default', async () => {
  const loc = await resolveLocation({ getPos: fix(0, 0) });
  assert.equal(loc.source, 'default');
  assert.equal(loc.reason, 'outside');
  assert.equal(loc.lat, DEFAULT_LOCATION.lat);
  assert.equal(locationLabel(loc), 'Near Ortigas (default)');
});

test('each geolocation failure falls back and names the reason', async () => {
  for (const [code, reason] of [[1, 'denied'], [2, 'unavailable'], [3, 'timeout'], [0, 'unsupported'], [99, 'error']]) {
    resetLocationCache();
    const loc = await resolveLocation({ getPos: fail(code) });
    assert.equal(loc.source, 'default', 'code ' + code);
    assert.equal(loc.reason, reason, 'code ' + code);
  }
});

test('resolveLocation never rejects, even for a non-error rejection', async () => {
  const loc = await resolveLocation({ getPos: async () => { throw 'boom'; } });
  assert.equal(loc.source, 'default');
  assert.equal(loc.reason, 'error');
});

test('the result is cached until the TTL passes or force is set', async () => {
  let calls = 0;
  let t = 0;
  const getPos = async () => { calls++; return { lat: 14.6, lng: 121.0, accuracy: 1 }; };
  await resolveLocation({ getPos, now: () => t, ttlMs: 1000 });
  t = 900;
  await resolveLocation({ getPos, now: () => t, ttlMs: 1000 });
  assert.equal(calls, 1);
  t = 1100;
  await resolveLocation({ getPos, now: () => t, ttlMs: 1000 });
  assert.equal(calls, 2);
  await resolveLocation({ getPos, now: () => t, ttlMs: 1000, force: true });
  assert.equal(calls, 3);
});
