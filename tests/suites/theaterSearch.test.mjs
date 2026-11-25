import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTheaterDay, findMovieAtTheater } from '../../utils/theaterSearch.js';
import { loadCatalog } from '../../utils/search.js';
import { makeFakeGet, loadFixture, at, ORTIGAS } from '../helpers.mjs';

const TODAY = '2026-11-17';
const MORNING = at(TODAY, 10, 0);
const FOUR_PM = at(TODAY, 16, 0);
const LATE = at(TODAY, 23, 30);
const GALLERIA = { slug: 'robinsons-galleria-ortigas', name: 'Robinsons Galleria Ortigas' };

const catalog = await loadCatalog(makeFakeGet());
const godzilla = catalog.find((m) => m.title === 'Godzilla Minus Zero');
const deps = (now, get) => ({ get: get || makeFakeGet(), now: () => now });

test('every movie at the cinema, with times grouped by screen type, sorted by title', async () => {
  const r = await loadTheaterDay(deps(MORNING), { theater: GALLERIA, date: TODAY });
  assert.equal(r.status, 'ok');
  assert.equal(r.theater.name, 'Robinsons Galleria Ortigas');
  assert.ok(r.movies.length >= 8);
  const titles = r.movies.map((m) => m.title);
  assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b)));
  for (const m of r.movies) {
    assert.ok(m.id && m.title && m.groups.length && m.times.length, m.title);
    for (const g of m.groups) assert.deepEqual(g.times, [...g.times], 'times present');
  }
  // Same recorded data as the raw file: every movie that had a schedule is there.
  const raw = loadFixture('theater/robinsons-galleria-ortigas.2026-11-17.json');
  const ids = new Set(raw.schedules.map((s) => Number(s.movieId)));
  assert.deepEqual(new Set(r.movies.map((m) => m.id)), ids);
  assert.equal(r.movies[0].rating === undefined, false);
});

test("today's showtimes that have started are hidden, and the day can run out", async () => {
  const morning = await loadTheaterDay(deps(MORNING), { theater: GALLERIA, date: TODAY });
  const later = await loadTheaterDay(deps(FOUR_PM), { theater: GALLERIA, date: TODAY });
  const count = (r) => r.movies.reduce((n, m) => n + m.times.length, 0);
  assert.ok(count(later) < count(morning));
  assert.ok(later.movies.length <= morning.movies.length);

  const night = await loadTheaterDay(deps(LATE), { theater: GALLERIA, date: TODAY });
  assert.equal(night.status, 'none-left-today');
  assert.deepEqual(night.movies, []);
  assert.ok(night.started.length > 0);
});

test('a future day is not trimmed by the clock', async () => {
  const a = await loadTheaterDay(deps(MORNING), { theater: { slug: 'sm-megamall', name: 'SM MegaMall' }, date: '2026-11-21' });
  const b = await loadTheaterDay(deps(LATE), { theater: { slug: 'sm-megamall', name: 'SM MegaMall' }, date: '2026-11-21' });
  assert.equal(a.status, 'ok');
  assert.deepEqual(a.movies, b.movies);
});

test('a day the service answers with another date is "no-date", never shown as the asked day', async () => {
  const real = makeFakeGet();
  const get = async (p) => ({ ...(await real(p)), returned_schedule_date: '2026-11-17' });
  const r = await loadTheaterDay({ get, now: () => MORNING }, { theater: { slug: 'sm-megamall', name: 'x' }, date: '2026-11-21' });
  assert.equal(r.status, 'no-date');
  assert.deepEqual(r.movies, []);
});

test('an empty schedule is "none"; an unknown cinema throws the 404', async () => {
  const r = await loadTheaterDay(deps(MORNING), { theater: { slug: 'sm-megamall', name: 'SM MegaMall' }, date: '2026-12-30' });
  assert.equal(r.status, 'none');
  await assert.rejects(loadTheaterDay(deps(MORNING), { theater: { slug: 'nowhere-mall', name: 'x' }, date: TODAY }), (e) => e.status === 404);
});

test('titles missing from the schedule response fall back to the catalog', async () => {
  const real = makeFakeGet();
  const get = async (p) => ({ ...(await real(p)), now_showing: [] });
  const without = await loadTheaterDay({ get, now: () => MORNING }, { theater: GALLERIA, date: TODAY });
  assert.equal(without.status, 'none', 'untitled showings are unusable, not "none left today"');
  const withCatalog = await loadTheaterDay({ get, now: () => MORNING, catalog }, { theater: GALLERIA, date: TODAY });
  assert.equal(withCatalog.status, 'ok');
  assert.ok(withCatalog.movies.length > 0);
});

// ── is this movie at this cinema? ───────────────────────

const MEGAMALL = { slug: 'sm-megamall', name: 'SM MegaMall' };

test('a movie that is there: its times at that cinema, nothing else fetched', async () => {
  const get = makeFakeGet();
  const r = await findMovieAtTheater({ get, now: () => MORNING }, { theater: MEGAMALL, movie: godzilla, date: TODAY, origin: ORTIGAS });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.groups, [{ label: '', times: ['3:30 PM', '6:30 PM', '9:30 PM'] }, { label: 'IMAX', times: ['11:30 AM'] }]);
  assert.deepEqual(r.times, ['11:30 AM', '3:30 PM', '6:30 PM', '9:30 PM']);
  assert.deepEqual(r.alternatives, []);
  assert.deepEqual(get.calls, ['/theater/sm-megamall?date=2026-11-17']);
});

test('a movie that is not there: says so and finds the nearest cinemas that have it', async () => {
  // Galleria really has no Godzilla on the 17th.
  const r = await findMovieAtTheater(deps(MORNING), { theater: GALLERIA, movie: godzilla, date: TODAY, origin: ORTIGAS });
  assert.equal(r.status, 'not-here');
  assert.equal(r.reason, 'not-listed');
  assert.deepEqual(r.alternatives.map((m) => m.name), ['The Podium', 'Greenhills Cinemas', 'SM MegaMall']);
  assert.ok(r.alternatives.every((m) => m.times.length > 0 && m.distanceKm > 0));
  assert.equal(r.alternativesStatus, 'ok');
});

test('the cinema itself is never offered as its own alternative', async () => {
  // The day view says "not here" but the movie search would list the same cinema: keep it out.
  const real = makeFakeGet();
  let first = true;
  const get = async (p) => {
    const body = await real(p);
    if (first && p.startsWith('/theater/the-podium')) {
      first = false;
      return { ...body, schedules: body.schedules.filter((s) => Number(s.movieId) !== 21542) };
    }
    return body;
  };
  const r = await findMovieAtTheater({ get, now: () => MORNING }, { theater: { slug: 'the-podium', name: 'The Podium' }, movie: godzilla, date: TODAY, origin: ORTIGAS });
  assert.equal(r.status, 'not-here');
  assert.ok(r.alternatives.length > 0);
  assert.ok(!r.alternatives.some((m) => m.slug === 'the-podium'));
});

test('a movie whose showings here have all started says "started"', async () => {
  const real = makeFakeGet();
  let first = true;
  const get = async (p) => {
    const body = await real(p);
    if (first && p.startsWith('/theater/sm-megamall')) {
      first = false;
      return { ...body, schedules: body.schedules.map((s) => (Number(s.movieId) === 21542 ? { ...s, showtimes: ['9:00 AM'] } : s)) };
    }
    return body;
  };
  const r = await findMovieAtTheater({ get, now: () => MORNING }, { theater: MEGAMALL, movie: godzilla, date: TODAY, origin: ORTIGAS });
  assert.equal(r.status, 'not-here');
  assert.equal(r.reason, 'started');
});

test('no schedule for that day at the cinema is its own reason', async () => {
  const r = await findMovieAtTheater(deps(MORNING), { theater: MEGAMALL, movie: godzilla, date: '2026-12-30', origin: ORTIGAS });
  assert.equal(r.status, 'not-here');
  assert.equal(r.reason, 'no-schedule');
});

test('failing to look for alternatives never hides the answer', async () => {
  const real = makeFakeGet();
  const get = async (p) => {
    if (p.startsWith('/nearby-malls')) throw Object.assign(new Error('down'), { kind: 'network' });
    return real(p);
  };
  const r = await findMovieAtTheater({ get, now: () => MORNING }, { theater: GALLERIA, movie: godzilla, date: TODAY, origin: ORTIGAS });
  assert.equal(r.status, 'not-here');
  assert.deepEqual(r.alternatives, []);
  assert.ok(r.alternativesError);
});

test('without an origin there are no alternatives to look for', async () => {
  const get = makeFakeGet();
  const r = await findMovieAtTheater({ get, now: () => MORNING }, { theater: GALLERIA, movie: godzilla, date: TODAY });
  assert.equal(r.status, 'not-here');
  assert.deepEqual(r.alternatives, []);
  assert.ok(!get.calls.some((p) => p.startsWith('/nearby-malls')));
});

test('the cinema failing to load throws (so the page can say so)', async () => {
  await assert.rejects(findMovieAtTheater(deps(MORNING), { theater: { slug: 'nowhere-mall', name: 'x' }, movie: godzilla, date: TODAY, origin: ORTIGAS }), (e) => e.status === 404);
});
