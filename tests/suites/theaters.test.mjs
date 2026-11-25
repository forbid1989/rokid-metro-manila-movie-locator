import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCity, loadDirectory, withDistance, nearestTheaters, DIRECTORY_CENTER, DIRECTORY_PAGES, NEAREST_LIST_LIMIT } from '../../utils/theaters.js';
import { haversineKm } from '../../utils/geo.js';
import { parseKm } from '../../utils/format.js';
import { apiError } from '../../utils/api.js';
import { makeFakeGet, loadFixture, ORTIGAS } from '../helpers.mjs';

test('normalizeCity makes "Pasig City" and "Pasig" the same', () => {
  assert.equal(normalizeCity('Pasig City'), 'Pasig');
  assert.equal(normalizeCity('Pasig'), 'Pasig');
  assert.equal(normalizeCity(' Parañaque City '), 'Parañaque');
  assert.equal(normalizeCity('Quezon City'), 'Quezon');
  assert.equal(normalizeCity(undefined), '');
});

test('loadDirectory walks every page once and returns normalised cinemas', async () => {
  const get = makeFakeGet();
  const { theaters, complete } = await loadDirectory(get);
  assert.equal(complete, true);
  assert.equal(get.calls.length, DIRECTORY_PAGES);
  assert.equal(theaters.length, 105);
  assert.equal(new Set(theaters.map((t) => t.slug)).size, theaters.length, 'no duplicates');
  const galleria = theaters.find((t) => t.slug === 'robinsons-galleria-ortigas');
  assert.equal(galleria.name, 'Robinsons Galleria Ortigas');
  assert.equal(typeof galleria.lat, 'number');
  assert.equal(typeof galleria.lng, 'number');
  assert.equal(galleria.city, 'Quezon');
  assert.ok(theaters.every((t) => t.slug && t.name && isFinite(t.lat) && isFinite(t.lng)));
});

test('the directory includes the cinemas we care about outside the Ortigas area', async () => {
  const { theaters } = await loadDirectory(makeFakeGet());
  const names = theaters.map((t) => t.name);
  for (const n of ['Fisher Mall Malabon', 'SM Mall of Asia', 'Greenbelt 3', 'TriNoma Mall', 'SM City Fairview']) {
    assert.ok(names.includes(n), n);
  }
});

test('some pages failing leaves a partial directory marked incomplete; all failing throws', async () => {
  const real = makeFakeGet();
  const flaky = async (p) => {
    if (p.includes('page=4') || p.includes('page=5')) throw apiError('network', 'down');
    return real(p);
  };
  const partial = await loadDirectory(flaky);
  assert.equal(partial.complete, false);
  assert.equal(partial.theaters.length, 75);

  const dead = async () => { throw apiError('timeout', 'slow'); };
  await assert.rejects(loadDirectory(dead), (e) => e.kind === 'timeout');
});

test('great-circle distance agrees with the API own distances (it is how they are measured)', () => {
  for (let page = 1; page <= DIRECTORY_PAGES; page++) {
    for (const raw of loadFixture('directory/page' + page + '.json').data) {
      const mine = haversineKm(DIRECTORY_CENTER, { lat: parseFloat(raw.latitude), lng: parseFloat(raw.longitude) });
      assert.ok(Math.abs(mine - parseKm(raw.distance)) < 0.06, raw.name + ' ' + raw.distance + ' vs ' + mine.toFixed(2));
    }
  }
});

test('nearest cinemas from Ortigas agree with the API list for that point', async () => {
  const { theaters } = await loadDirectory(makeFakeGet());
  const near = nearestTheaters(theaters, ORTIGAS);
  const api = loadFixture('nearby-malls/no-movie-all-malls.json').data.map((m) => m.name);
  // The API's first page for the same point: the same cinemas come first.
  assert.deepEqual(near.slice(0, 12).map((t) => t.name).sort(), api.slice(0, 12).sort());
  assert.deepEqual(near.slice(0, 2).map((t) => t.name), ['Robinsons Galleria Ortigas', 'Opus Mall']);
});

test('nearestTheaters: within the cap, nearest first, each with a distance', async () => {
  const { theaters } = await loadDirectory(makeFakeGet());
  const near = nearestTheaters(theaters, ORTIGAS, { maxKm: 20 });
  assert.equal(near.length, 63, 'the recorded directory has 63 cinemas within 20 km of Ortigas');
  assert.ok(near.every((t) => t.distanceKm <= 20));
  for (let i = 1; i < near.length; i++) assert.ok(near[i - 1].distanceKm <= near[i].distanceKm);
  assert.equal(nearestTheaters(theaters, ORTIGAS, { maxKm: 20, limit: 3 }).length, 3);
  assert.deepEqual(nearestTheaters(theaters, { lat: 0, lng: 0 }), [], 'nothing near the middle of the ocean');
});

test('another starting point reorders the list (Malabon)', async () => {
  const { theaters } = await loadDirectory(makeFakeGet());
  const malabon = { lat: 14.66, lng: 120.96 };
  assert.equal(nearestTheaters(theaters, malabon)[0].name, 'Fisher Mall Malabon');
  // withDistance does not mutate the directory.
  withDistance(theaters, malabon);
  assert.equal(theaters[0].distanceKm, undefined);
});

test('the nearest-theaters screen is capped at 15, nearest first', async () => {
  const { theaters } = await loadDirectory(makeFakeGet());
  assert.equal(NEAREST_LIST_LIMIT, 15);
  const list = nearestTheaters(theaters, ORTIGAS, { maxKm: 20, limit: NEAREST_LIST_LIMIT });
  assert.equal(list.length, 15);
  assert.equal(list[0].name, 'Robinsons Galleria Ortigas');
});
