/**
 * Cinema search. Pure orchestration over an injected `get(path)` (see
 * createClient in api.js), so it can be tested against recorded responses.
 *
 * Endpoints used:
 *   /now-showing                                         title catalog
 *   /nearby-malls?latitude&longitude&movie_id&page       malls by distance (movie_id optional;
 *                                                        `date` is ignored by the service)
 *   /theater/<slug>?date=YYYY-MM-DD                      a mall's schedule for one date
 *
 * Locations are { lat, lng } (see resolveLocation).
 */
import { isPastShowtime } from './dates.js';
import { parseKm, sortTimes, screenFormat } from './format.js';

export const DEFAULTS = {
  maxMalls: 5,    // a movie's screen stops once this many malls with showtimes are found
  maxKm: 20,      // ignore malls farther than this
  listMalls: 15,  // the movie list checks every mall in range, up to one page of results
  batchSize: 4,   // theater schedules fetched in parallel
  maxPages: 3,    // nearby-malls pages to walk
};

function query(params) {
  return Object.keys(params)
    .filter(function (k) { return params[k] !== undefined && params[k] !== null; })
    .map(function (k) { return k + '=' + encodeURIComponent(params[k]); })
    .join('&');
}

function nearbyPath(location, movieKey, page) {
  return '/nearby-malls?' + query({
    latitude: location.lat,
    longitude: location.lng,
    movie_id: movieKey,
    page: page,
  });
}

function theaterPath(slug, date) {
  return '/theater/' + slug + '?' + query({ date: date });
}

function normalizeMall(raw) {
  return {
    slug: raw.slug,
    name: raw.name,
    city: raw.city || '',
    distanceKm: parseKm(raw.distance),
    distanceLabel: raw.distance || '',
  };
}

function withinCap(mall, maxKm) {
  return mall.distanceKm === null || mall.distanceKm <= maxKm;
}

// ── catalog ──────────────────────────────────────────────

/**
 * The movies the service lists as now showing, normalised. It includes old
 * titles that are only in a few cinemas; use it to resolve spoken titles, not
 * as the "what's on today" list.
 */
export async function loadCatalog(get) {
  const body = await get('/now-showing');
  const rows = (body && body.data) || [];
  return rows.map(function (r) {
    return {
      id: Number(r.movie_id),
      hash: r.hash,
      slug: r.slug,
      title: r.title,
      rating: r.mtrcb_rating || '',
      runtime: r.running_time || '',
      genre: r.genre || '',
      releaseDate: r.release_date || '',
    };
  });
}

// ── one mall's showtimes for one movie ───────────────────

// { hadTimes, groups: [{label, times}], times } for `movie` at `mall` on `date`.
// hadTimes is true when the mall lists the movie that date even if every time
// has already passed.
async function loadMallShowtimes(get, mall, movie, date, nowMs) {
  const body = await get(theaterPath(mall.slug, date));
  const empty = { hadTimes: false, groups: [], times: [] };
  if (!body) return empty;
  // Defensive: never present another date's schedule as the requested one.
  if (body.returned_schedule_date && body.returned_schedule_date !== date) return empty;

  let hadTimes = false;
  const byLabel = {};
  const labels = [];
  for (const s of body.schedules || []) {
    if (Number(s.movieId) !== Number(movie.id)) continue;
    const label = screenFormat(s.theaterName, s.in3d);
    for (const t of s.showtimes || []) {
      hadTimes = true;
      if (isPastShowtime(t, date, nowMs)) continue;
      if (!byLabel[label]) {
        byLabel[label] = [];
        labels.push(label);
      }
      byLabel[label].push(t);
    }
  }
  // Ordinary rooms first, then special formats in the order seen.
  labels.sort(function (a, b) { return (a === '' ? 0 : 1) - (b === '' ? 0 : 1); });
  const groups = labels.map(function (label) { return { label: label, times: sortTimes(byLabel[label]) }; });
  const all = [];
  for (const g of groups) for (const t of g.times) all.push(t);
  return { hadTimes: hadTimes, groups: groups, times: sortTimes(all) };
}

// Fetch in batches, preserving order. Resolves [{ mall, result?, error? }].
async function inBatches(items, size, worker) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const done = await Promise.all(batch.map(function (item) {
      return worker(item).then(
        function (result) { return { item: item, result: result }; },
        function (error) { return { item: item, error: error }; }
      );
    }));
    for (const d of done) out.push(d);
  }
  return out;
}

// ── where is a movie showing? ────────────────────────────

/**
 * @param {{get: Function, now?: Function}} deps
 * @param {{movie: {id, hash, title}, date: string, location: {lat, lng}, options?: object}} req
 * @returns {Promise<object>} { status, movie, date, malls, ... } where status is
 *   'ok'              malls: [{slug, name, city, distanceKm, distanceLabel, groups, times}]
 *   'no-date'         the movie has no showings that date; availableDates lists the ones it has
 *   'not-showing'     the service lists no dates at all for this movie
 *   'none-left-today' it is on today, but every showtime has already started
 *   'none-in-range'   no mall within the distance cap has it on that date; `nearest` is the
 *                     closest mall that carries the movie at all
 * Throws the first API error only when every request failed (e.g. offline, 403).
 */
export async function findMovieShowtimes(deps, req) {
  const get = deps.get;
  const nowMs = deps.now ? deps.now() : Date.now();
  const opts = Object.assign({}, DEFAULTS, req.options || {});
  const movie = req.movie;
  const date = req.date;
  const key = movie.hash || movie.id;

  let pageNo = 1;
  let page = await get(nearbyPath(req.location, key, pageNo));
  const availableDates = Array.isArray(page.available_schedule) ? page.available_schedule : [];
  if (!availableDates.length) {
    return { status: 'not-showing', movie: movie, date: date, malls: [], availableDates: [] };
  }
  if (availableDates.indexOf(date) < 0) {
    return { status: 'no-date', movie: movie, date: date, malls: [], availableDates: availableDates };
  }

  const found = [];
  const queue = [];
  let nearest = null;
  let checked = 0;
  let failures = 0;
  let firstError = null;
  let hadAnyTimes = false;
  let beyondCap = false;
  let pageError = null;

  for (;;) {
    for (const raw of page.data || []) {
      const mall = normalizeMall(raw);
      if (!nearest) nearest = mall;
      if (!withinCap(mall, opts.maxKm)) {
        beyondCap = true;
        break;
      }
      queue.push(mall);
    }

    while (queue.length && found.length < opts.maxMalls) {
      const batch = queue.splice(0, opts.batchSize);
      const done = await inBatches(batch, opts.batchSize, function (mall) {
        return loadMallShowtimes(get, mall, movie, date, nowMs);
      });
      for (const d of done) {
        checked++;
        if (d.error) {
          failures++;
          if (!firstError) firstError = d.error;
          continue;
        }
        if (d.result.hadTimes) hadAnyTimes = true;
        if (d.result.groups.length && found.length < opts.maxMalls) {
          found.push(Object.assign({}, d.item, { groups: d.result.groups, times: d.result.times }));
        }
      }
    }

    if (found.length >= opts.maxMalls || beyondCap) break;
    const next = page.paging && page.paging.next;
    if (!next || pageNo >= opts.maxPages) break;
    pageNo = next;
    try {
      page = await get(nearbyPath(req.location, key, pageNo));
    } catch (err) {
      // A later page failing must not discard what was already found.
      pageError = err;
      break;
    }
    if (!page.data || !page.data.length) break;
  }

  const base = { movie: movie, date: date, availableDates: availableDates, checked: checked, failures: failures };
  if (found.length) return Object.assign(base, { status: 'ok', malls: found });
  if (checked > 0 && failures === checked) throw firstError;
  if (checked === 0 && pageError) throw pageError;
  if (hadAnyTimes) return Object.assign(base, { status: 'none-left-today', malls: [] });
  return Object.assign(base, { status: 'none-in-range', malls: [], nearest: nearest });
}

// ── what is showing? ─────────────────────────────────────

/**
 * Movies with at least one showtime left on `date` at the nearest malls.
 * Built from the malls' own schedules (not the global catalog, which carries
 * old titles).
 *
 * @returns {Promise<{status: 'ok'|'empty', date, movies: [{id, hash, title, rating, runtime, malls}], mallsChecked: string[]}>}
 *   movies are sorted by how many of the checked malls show them, then by title.
 * Throws the first API error only when every request failed.
 */
export async function listMoviesShowing(deps, req) {
  const get = deps.get;
  const nowMs = deps.now ? deps.now() : Date.now();
  const opts = Object.assign({}, DEFAULTS, req.options || {});
  const date = req.date;

  const page = await get(nearbyPath(req.location, undefined, 1));
  const malls = (page.data || [])
    .map(normalizeMall)
    .filter(function (m) { return withinCap(m, opts.maxKm); })
    .slice(0, opts.listMalls);

  const done = await inBatches(malls, opts.batchSize, function (mall) {
    return get(theaterPath(mall.slug, date));
  });

  const movies = {};
  let failures = 0;
  let firstError = null;
  const checked = [];
  for (const d of done) {
    if (d.error) {
      failures++;
      if (!firstError) firstError = d.error;
      continue;
    }
    checked.push(d.item.name);
    const body = d.result || {};
    if (body.returned_schedule_date && body.returned_schedule_date !== date) continue;

    const info = {};
    for (const n of body.now_showing || []) {
      info[Number(n.movieId || n.id)] = n;
    }
    const seenHere = {};
    for (const s of body.schedules || []) {
      const id = Number(s.movieId);
      const remaining = (s.showtimes || []).filter(function (t) { return !isPastShowtime(t, date, nowMs); });
      if (!remaining.length || seenHere[id]) continue;
      seenHere[id] = true;
      const n = info[id] || {};
      if (!movies[id]) {
        movies[id] = {
          id: id,
          hash: n.hash || '',
          title: n.title || '',
          rating: n.mtrcb_rating || '',
          runtime: n.running_time || '',
          malls: 0,
        };
      }
      movies[id].malls++;
    }
  }
  if (malls.length && failures === malls.length) throw firstError;

  const list = Object.keys(movies).map(function (k) { return movies[k]; })
    .filter(function (m) { return m.title; })
    .sort(function (a, b) { return b.malls - a.malls || a.title.localeCompare(b.title); });
  return {
    status: list.length ? 'ok' : 'empty',
    date: date,
    movies: list,
    mallsChecked: checked,
  };
}
