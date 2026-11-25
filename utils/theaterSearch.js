/**
 * What is showing at one cinema. Pure orchestration over an injected
 * `get(path)`, like search.js, and built on the same parsing helpers.
 *
 *   loadTheaterDay(deps, { theater, date })       every movie at the cinema that day
 *   findMovieAtTheater(deps, { theater, movie, date, origin })
 *                                                is this movie there; if not, where nearby
 */
import { isPastShowtime } from './dates.js';
import { sortTimes, screenFormat } from './format.js';
import { findMovieShowtimes } from './search.js';

const ALTERNATIVES = 3;

/**
 * @param {{get: Function, now?: Function, catalog?: object[]}} deps
 * @param {{theater: {slug, name}, date: string}} req
 * @returns {Promise<{status, theater, date, movies, started, availableDates}>}
 *   status:
 *     'ok'               movies: [{id, hash, title, rating, runtime, groups: [{label, times}], times}],
 *                        most showings first... sorted by title
 *     'none-left-today'  it has showings today but every one has started (`started` lists their ids)
 *     'none'             the service lists nothing for that date
 *     'no-date'          the cinema has no schedule for that date (`availableDates` lists the ones it has)
 * Throws the API error (e.g. a 404 for a cinema that no longer exists).
 */
export async function loadTheaterDay(deps, req) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const date = req.date;
  const body = await deps.get('/theater/' + req.theater.slug + '?date=' + encodeURIComponent(date));
  const info = (body && body.theater) || {};
  const theater = Object.assign({}, req.theater, {
    name: info.name || req.theater.name,
    city: info.city || req.theater.city || '',
    phone: info.phone || '',
  });
  const availableDates = Array.isArray(info.available_schedule) ? info.available_schedule : [];
  const base = { theater: theater, date: date, movies: [], started: [], availableDates: availableDates };

  // The service answers with another day when it has none for the one asked.
  if (!body || (body.returned_schedule_date && body.returned_schedule_date !== date)) {
    return Object.assign(base, { status: 'no-date' });
  }

  const known = {};
  for (const n of body.now_showing || []) known[Number(n.movieId || n.id)] = n;
  for (const c of deps.catalog || []) if (!known[c.id]) known[c.id] = { title: c.title, mtrcb_rating: c.rating, running_time: c.runtime, hash: c.hash };

  const byMovie = {};
  const order = [];
  let listed = 0;
  let remaining = 0;
  for (const s of body.schedules || []) {
    const id = Number(s.movieId);
    const label = screenFormat(s.theaterName, s.in3d);
    if (!byMovie[id]) {
      byMovie[id] = { id: id, hadTimes: false, byLabel: {}, labels: [] };
      order.push(id);
    }
    const m = byMovie[id];
    for (const t of s.showtimes || []) {
      listed++;
      m.hadTimes = true;
      if (isPastShowtime(t, date, nowMs)) continue;
      remaining++;
      if (!m.byLabel[label]) {
        m.byLabel[label] = [];
        m.labels.push(label);
      }
      m.byLabel[label].push(t);
    }
  }

  const movies = [];
  const started = [];
  for (const id of order) {
    const m = byMovie[id];
    const n = known[id];
    if (!m.labels.length) {
      if (m.hadTimes) started.push(id);
      continue;
    }
    if (!n || !n.title) continue;
    const labels = m.labels.slice().sort(function (a, b) { return (a === '' ? 0 : 1) - (b === '' ? 0 : 1); });
    const groups = labels.map(function (label) { return { label: label, times: sortTimes(m.byLabel[label]) }; });
    const all = [];
    for (const g of groups) for (const t of g.times) all.push(t);
    movies.push({
      id: id,
      hash: n.hash || '',
      title: n.title,
      rating: n.mtrcb_rating || '',
      runtime: n.running_time || '',
      groups: groups,
      times: sortTimes(all),
    });
  }
  movies.sort(function (a, b) { return a.title.localeCompare(b.title); });

  if (movies.length) return Object.assign(base, { status: 'ok', movies: movies, started: started });
  // Showings that remain but have no usable title are not "none left".
  if (listed > 0 && remaining === 0) return Object.assign(base, { status: 'none-left-today', started: started });
  return Object.assign(base, { status: 'none' });
}

/**
 * Is `movie` showing at `theater` on `date`? When it is not, also find the
 * nearest cinemas to `origin` that do have it.
 *
 * @returns {Promise<object>} { status, theater, movie, date, groups?, times?, reason?, alternatives, alternativesStatus }
 *   status 'ok'        groups/times at this cinema
 *   status 'not-here'  reason: 'not-listed' | 'started' | 'no-schedule'; `alternatives` are
 *                      malls (as findMovieShowtimes returns them, without this cinema)
 */
export async function findMovieAtTheater(deps, req) {
  const day = await loadTheaterDay(deps, { theater: req.theater, date: req.date });
  const here = day.movies.find(function (m) { return m.id === Number(req.movie.id); });
  const base = { theater: day.theater, movie: req.movie, date: req.date };

  if (here) {
    return Object.assign(base, { status: 'ok', groups: here.groups, times: here.times, alternatives: [], alternativesStatus: null });
  }

  let reason = 'not-listed';
  if (day.started.indexOf(Number(req.movie.id)) >= 0 || day.status === 'none-left-today') reason = 'started';
  else if (day.status === 'no-date' || day.status === 'none') reason = 'no-schedule';

  let alternatives = [];
  let alternativesStatus = null;
  let alternativesError = null;
  if (req.origin) {
    try {
      const options = Object.assign({}, req.options, { maxMalls: ALTERNATIVES + 1 });
      const found = await findMovieShowtimes({ get: deps.get, now: deps.now }, {
        movie: req.movie, date: req.date, location: req.origin, options: options,
      });
      alternativesStatus = found.status;
      alternatives = found.malls
        .filter(function (m) { return m.slug !== day.theater.slug; })
        .slice(0, ALTERNATIVES);
    } catch (err) {
      alternativesError = err;
    }
  }
  return Object.assign(base, {
    status: 'not-here', reason: reason, alternatives: alternatives,
    alternativesStatus: alternativesStatus, alternativesError: alternativesError,
  });
}
