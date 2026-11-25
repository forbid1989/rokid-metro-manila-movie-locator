/**
 * Shared test helpers: fixture loading, a fake `get(path)` that serves recorded
 * ClickTheCity responses, and Manila-time clock helpers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiError } from '../utils/api.js';
import { DIRECTORY_CENTER } from '../utils/theaters.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export function loadFixture(rel) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, rel), 'utf8'));
}

function tryFixture(rel) {
  const full = path.join(FIXTURES, rel);
  return fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, 'utf8')) : null;
}

// movie_id (hash or numeric id) -> nearby-malls fixture prefix
const MOVIE_FIXTURES = {
  '31af70': 'godzilla',
  '21542': 'godzilla',
  '63fc2f': 'boldstar-far-away',
  '21543': 'boldstar-far-away',
};

/**
 * A `get(path)` backed by fixtures. `get.calls` records every path requested.
 * A path with no fixture rejects with an HTTP 404, like a mall whose schedule
 * we did not record.
 */
export function makeFakeGet() {
  const calls = [];
  async function get(p) {
    calls.push(p);
    const u = new URL(p, 'http://fixture.invalid');
    let body = null;

    if (u.pathname === '/now-showing') {
      body = loadFixture('now-showing.json');
    } else if (u.pathname === '/nearby-malls') {
      const id = u.searchParams.get('movie_id');
      const page = u.searchParams.get('page') || '1';
      const atDirectoryCentre = Number(u.searchParams.get('latitude')) === DIRECTORY_CENTER.lat &&
        Number(u.searchParams.get('longitude')) === DIRECTORY_CENTER.lng;
      if (!id && atDirectoryCentre) {
        body = tryFixture('directory/page' + page + '.json');
      } else if (!id) {
        body = page === '1' ? loadFixture('nearby-malls/no-movie-all-malls.json') : null;
      } else if (MOVIE_FIXTURES[id] === 'godzilla') {
        body = tryFixture('nearby-malls/godzilla-page' + page + '.json');
      } else if (MOVIE_FIXTURES[id]) {
        body = page === '1' ? loadFixture('nearby-malls/' + MOVIE_FIXTURES[id] + '.json') : null;
      }
    } else if (u.pathname.startsWith('/theater/')) {
      const slug = u.pathname.slice('/theater/'.length);
      const date = u.searchParams.get('date');
      body = tryFixture('theater/' + slug + '.' + date + '.json') ||
        tryFixture('theater/' + slug + '.' + date + '.empty.json');
    }

    if (!body) throw apiError('http', 'HTTP 404 (no fixture for ' + p + ')', 404);
    return body;
  }
  get.calls = calls;
  return get;
}

/** Epoch ms for a Manila wall-clock time, e.g. at('2026-11-17', 10, 0). */
export function at(date, hour, minute) {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hour - 8, minute || 0);
}

export const ORTIGAS = { lat: 14.598970835872194, lng: 121.06753066670711 };
