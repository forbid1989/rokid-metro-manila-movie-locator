/**
 * The cinema (mall) directory: every ClickTheCity cinema around Metro Manila,
 * with coordinates, so the app can name a cinema, list the nearest ones from
 * any starting point, and compute distances itself. Pure functions over an
 * injected `get(path)`.
 *
 * The API only lists malls by distance from a point, 15 per page, and ignores
 * `limit` and name searches. So the directory is built by walking the pages
 * from a fixed point in central Manila; seven pages (105 cinemas, out to about
 * 77 km) cover Metro Manila, its neighbours and the nearer provinces.
 */
import { haversineKm } from './geo.js';

export const DIRECTORY_CENTER = { lat: 14.5995, lng: 120.9842 };
export const DIRECTORY_PAGES = 7;

/** The nearest-theaters screen shows this many (63 are within 20 km of Ortigas: too many to swipe). */
export const NEAREST_LIST_LIMIT = 15;

/** 'Pasig City' and 'Pasig' are the same place; so are 'Parañaque City' and 'Parañaque'. */
export function normalizeCity(city) {
  return String(city || '').trim().replace(/\s+city$/i, '').trim();
}

export function normalizeTheater(raw) {
  return {
    id: Number(raw.id),
    slug: String(raw.slug || ''),
    name: String(raw.name || '').trim(),
    city: normalizeCity(raw.city),
    lat: parseFloat(raw.latitude),
    lng: parseFloat(raw.longitude),
  };
}

function usable(t) {
  return t.slug && t.name && isFinite(t.lat) && isFinite(t.lng);
}

/**
 * Walk the directory pages. Resolves { theaters, complete }: `complete` is false
 * when some pages failed (the list is then missing the farther cinemas). Throws
 * the first error only when every page failed.
 */
export async function loadDirectory(get, options) {
  const o = Object.assign({ pages: DIRECTORY_PAGES, center: DIRECTORY_CENTER }, options || {});
  const requests = [];
  for (let page = 1; page <= o.pages; page++) {
    const path = '/nearby-malls?latitude=' + o.center.lat + '&longitude=' + o.center.lng + '&page=' + page;
    requests.push(get(path).then(
      function (body) { return { ok: true, body: body }; },
      function (error) { return { ok: false, error: error }; }
    ));
  }
  const done = await Promise.all(requests);
  const good = done.filter(function (d) { return d.ok; });
  if (!good.length) throw done[0].error;

  const seen = {};
  const theaters = [];
  for (const d of good) {
    for (const raw of (d.body && d.body.data) || []) {
      const t = normalizeTheater(raw);
      if (!usable(t) || seen[t.slug]) continue;
      seen[t.slug] = true;
      theaters.push(t);
    }
  }
  return { theaters: theaters, complete: good.length === done.length };
}

/** Copies of the theaters with `distanceKm` from `origin`, nearest first. */
export function withDistance(theaters, origin) {
  return (theaters || [])
    .map(function (t) { return Object.assign({}, t, { distanceKm: haversineKm(origin, t) }); })
    .sort(function (a, b) { return a.distanceKm - b.distanceKm || a.name.localeCompare(b.name); });
}

/** The theaters within `maxKm` of `origin`, nearest first, each with `distanceKm`. */
export function nearestTheaters(theaters, origin, options) {
  const o = Object.assign({ maxKm: 20, limit: 0 }, options || {});
  const near = withDistance(theaters, origin).filter(function (t) { return t.distanceKm <= o.maxKm; });
  return o.limit ? near.slice(0, o.limit) : near;
}
