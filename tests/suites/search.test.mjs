import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, findMovieShowtimes, listMoviesShowing } from '../../utils/search.js';
import { makeFakeGet, at, ORTIGAS } from '../helpers.mjs';

const TODAY = '2026-11-17'; // the day the fixtures were recorded (Tue)
const MORNING = at(TODAY, 10, 0);
const FOUR_PM = at(TODAY, 16, 0);
const LATE = at(TODAY, 23, 0);

async function setup(now) {
  const get = makeFakeGet();
  const deps = { get, now: () => now };
  const catalog = await loadCatalog(get);
  const byTitle = (t) => catalog.find((m) => m.title === t);
  return { get, deps, catalog, byTitle };
}

const slugs = (r) => r.malls.map((m) => m.slug);

// ── catalog ──────────────────────────────────────────────

test('loadCatalog normalises the now-showing list', async () => {
  const { catalog, byTitle } = await setup(MORNING);
  assert.equal(catalog.length, 40);
  const g = byTitle('Godzilla Minus Zero');
  assert.deepEqual(
    { id: g.id, hash: g.hash, rating: g.rating, runtime: g.runtime },
    { id: 21542, hash: '31af70', rating: 'PG', runtime: '2 hrs 14 min' }
  );
  assert.ok(byTitle('Pinocchio'), 'old titles are in the catalog');
  assert.ok(catalog.every((m) => Number.isInteger(m.id) && m.hash && m.title));
});

// ── where is a movie showing? ────────────────────────────

test('Godzilla today at Ortigas: the 5 nearest malls, nearest first', async () => {
  const { deps, byTitle } = await setup(MORNING);
  const r = await findMovieShowtimes(deps, { movie: byTitle('Godzilla Minus Zero'), date: TODAY, location: ORTIGAS });
  assert.equal(r.status, 'ok');
  assert.deepEqual(slugs(r), ['the-podium', 'greenhills-cinemas', 'sm-megamall', 'ortigas-cinemas-estancia', 'gateway-mall-2']);
  assert.deepEqual(r.malls.map((m) => m.distanceLabel), ['1.7 km', '1.8 km', '2.0 km', '2.6 km', '2.8 km']);
  assert.equal(r.failures, 0);
});

test('showtimes match the recorded schedule, merged per mall with special screens labelled', async () => {
  const { deps, byTitle } = await setup(MORNING);
  const r = await findMovieShowtimes(deps, { movie: byTitle('Godzilla Minus Zero'), date: TODAY, location: ORTIGAS });
  const mall = (slug) => r.malls.find((m) => m.slug === slug);

  assert.deepEqual(mall('the-podium').groups, [{ label: "Director's", times: ['12:00 PM', '8:00 PM'] }]);
  // Two rooms at Greenhills: ordinary room first, Luxe after.
  assert.deepEqual(mall('greenhills-cinemas').groups, [
    { label: '', times: ['1:15 PM', '4:00 PM', '6:45 PM'] },
    { label: 'Luxe', times: ['2:20 PM', '7:40 PM'] },
  ]);
  assert.deepEqual(mall('sm-megamall').groups, [
    { label: '', times: ['3:30 PM', '6:30 PM', '9:30 PM'] },
    { label: 'IMAX', times: ['11:30 AM'] },
  ]);
  assert.deepEqual(mall('ortigas-cinemas-estancia').groups, [{ label: '', times: ['2:45 PM', '5:45 PM', '8:45 PM'] }]);
  assert.deepEqual(mall('gateway-mall-2').groups, [{ label: 'Premiere', times: ['3:30 PM', '9:00 PM'] }]);
  // `times` is every time, sorted.
  assert.deepEqual(mall('sm-megamall').times, ['11:30 AM', '3:30 PM', '6:30 PM', '9:30 PM']);
});

test('only the requested movie is reported (other films in the same mall are ignored)', async () => {
  const { deps, byTitle } = await setup(MORNING);
  const r = await findMovieShowtimes(deps, { movie: byTitle('Godzilla Minus Zero'), date: TODAY, location: ORTIGAS });
  // The Podium also shows Wicker at 3:15 PM and The Cat in the Hat at 3:00 PM.
  const podium = r.malls.find((m) => m.slug === 'the-podium');
  assert.ok(!podium.times.includes('3:15 PM') && !podium.times.includes('3:00 PM'));
});

test("today's finished showtimes are hidden", async () => {
  const { deps, byTitle } = await setup(FOUR_PM);
  const r = await findMovieShowtimes(deps, { movie: byTitle('Godzilla Minus Zero'), date: TODAY, location: ORTIGAS });
  assert.equal(r.status, 'ok');
  const mall = (slug) => r.malls.find((m) => m.slug === slug);
  assert.deepEqual(mall('the-podium').groups, [{ label: "Director's", times: ['8:00 PM'] }]);
  // 4:00 PM is "now": still catchable.
  assert.deepEqual(mall('greenhills-cinemas').groups, [
    { label: '', times: ['4:00 PM', '6:45 PM'] },
    { label: 'Luxe', times: ['7:40 PM'] },
  ]);
  // The 11:30 AM IMAX show is gone, so the IMAX group disappears entirely.
  assert.deepEqual(mall('sm-megamall').groups, [{ label: '', times: ['6:30 PM', '9:30 PM'] }]);
});

test('a mall whose shows have all finished is skipped and the next nearest takes its place', async () => {
  const { deps, byTitle } = await setup(at(TODAY, 21, 30)); // 9:30 PM
  const r = await findMovieShowtimes(deps, { movie: byTitle('Godzilla Minus Zero'), date: TODAY, location: ORTIGAS });
  assert.equal(r.status, 'ok');
  assert.ok(slugs(r).includes('sm-megamall')); // 9:30 PM show is still catchable
  assert.ok(!slugs(r).includes('the-podium')); // last show was 8:00 PM
});

test("none-left-today when every showtime today has started", async () => {
  const { deps, byTitle } = await setup(LATE);
  const r = await findMovieShowtimes(deps, { movie: byTitle('Godzilla Minus Zero'), date: TODAY, location: ORTIGAS });
  assert.equal(r.status, 'none-left-today');
  assert.deepEqual(r.malls, []);
});

test('the same movie tomorrow is not hidden by the time-of-day filter', async () => {
  const { deps, byTitle } = await setup(LATE);
  const r = await findMovieShowtimes(deps, { movie: byTitle('Godzilla Minus Zero'), date: '2026-11-18', location: ORTIGAS });
  // Only SM MegaMall has a recorded 11-18 schedule; the other malls 404 and are tolerated.
  assert.equal(r.status, 'ok');
  assert.deepEqual(slugs(r), ['sm-megamall']);
  assert.ok(r.failures > 0);
  assert.ok(r.malls[0].times.length > 0);
});

test('a date the movie is not showing on short-circuits without fetching any mall', async () => {
  const { get, deps, byTitle } = await setup(MORNING);
  const r = await findMovieShowtimes(deps, { movie: byTitle('Godzilla Minus Zero'), date: '2026-11-25', location: ORTIGAS });
  assert.equal(r.status, 'no-date');
  assert.deepEqual(r.availableDates, ['2026-11-17', '2026-11-18', '2026-11-19']);
  assert.equal(get.calls.filter((p) => p.startsWith('/theater/')).length, 0);
});

test('requests the movie by hash and searches from the given location', async () => {
  const { get, deps, byTitle } = await setup(MORNING);
  await findMovieShowtimes(deps, { movie: byTitle('Godzilla Minus Zero'), date: TODAY, location: ORTIGAS });
  const first = get.calls.find((p) => p.startsWith('/nearby-malls'));
  assert.match(first, /latitude=14\.5989/);
  assert.match(first, /longitude=121\.0675/);
  assert.match(first, /movie_id=31af70/);
  assert.match(first, /page=1/);
});

test('stops fetching schedules once enough malls are found', async () => {
  const { get, deps, byTitle } = await setup(MORNING);
  await findMovieShowtimes(deps, { movie: byTitle('Godzilla Minus Zero'), date: TODAY, location: ORTIGAS });
  const theaterCalls = get.calls.filter((p) => p.startsWith('/theater/')).length;
  assert.ok(theaterCalls <= 8, 'fetched ' + theaterCalls + ' schedules for 5 results');
  assert.equal(get.calls.filter((p) => p.startsWith('/nearby-malls')).length, 1, 'no second page needed');
});

test('maxMalls option limits the results', async () => {
  const { deps, byTitle } = await setup(MORNING);
  const r = await findMovieShowtimes(deps, {
    movie: byTitle('Godzilla Minus Zero'), date: TODAY, location: ORTIGAS, options: { maxMalls: 2 },
  });
  assert.deepEqual(slugs(r), ['the-podium', 'greenhills-cinemas']);
});

test('a movie only far away: malls inside the cap are returned, the rest ignored', async () => {
  const { get, deps, byTitle } = await setup(MORNING);
  const r = await findMovieShowtimes(deps, { movie: byTitle("He's Dating a Boldstar"), date: TODAY, location: ORTIGAS });
  assert.equal(r.status, 'ok');
  assert.deepEqual(slugs(r), ['sta-lucia-east-grand-mall', 'robinsons-place-manila']); // 4.1 km and 9.3 km
  assert.deepEqual(r.malls[0].times, ['2:00 PM', '7:00 PM']);
  // Malls at 32.8 km and beyond are never requested.
  assert.ok(!get.calls.some((p) => p.includes('sm-city-tanza')));
});

test('none-in-range names the nearest mall that carries the movie', async () => {
  const { deps, byTitle } = await setup(MORNING);
  const r = await findMovieShowtimes(deps, {
    movie: byTitle("He's Dating a Boldstar"), date: TODAY, location: ORTIGAS, options: { maxKm: 3 },
  });
  assert.equal(r.status, 'none-in-range');
  assert.equal(r.nearest.slug, 'sta-lucia-east-grand-mall');
  assert.equal(r.nearest.distanceKm, 4.1);
});

test('a failing later page keeps the malls already found', async () => {
  const base = makeFakeGet();
  // Page 2 of the mall list is unreachable (network blip); page 1 is fine.
  const get = async (p) => {
    if (p.startsWith('/nearby-malls') && p.includes('page=2')) {
      const e = new Error('offline'); e.kind = 'network'; throw e;
    }
    return base(p);
  };
  const deps = { get, now: () => LATE };
  const catalog = await loadCatalog(base);
  const godzilla = catalog.find((m) => m.title === 'Godzilla Minus Zero');
  // Tomorrow only SM MegaMall has a schedule here, so the search tries to page on.
  const r = await findMovieShowtimes(deps, { movie: godzilla, date: '2026-11-18', location: ORTIGAS });
  assert.equal(r.status, 'ok');
  assert.deepEqual(slugs(r), ['sm-megamall']);
});

test('every request failing surfaces the error instead of an empty result', async () => {
  const { deps, byTitle } = await setup(MORNING);
  // No schedules were recorded for 11-19, so every mall request 404s.
  await assert.rejects(
    findMovieShowtimes(deps, { movie: byTitle('Godzilla Minus Zero'), date: '2026-11-19', location: ORTIGAS }),
    (e) => e.kind === 'http'
  );
});

test('a service that is down fails loudly (e.g. 403 or offline)', async () => {
  const get = async () => { const e = new Error('Blocked (403)'); e.kind = 'forbidden'; throw e; };
  await assert.rejects(
    findMovieShowtimes({ get, now: () => MORNING }, {
      movie: { id: 21542, hash: '31af70', title: 'x' }, date: TODAY, location: ORTIGAS,
    }),
    (e) => e.kind === 'forbidden'
  );
});

test('a response for a different date than requested is never shown as the requested date', async () => {
  const get = async (p) => {
    if (p.startsWith('/nearby-malls')) {
      return {
        available_schedule: [TODAY],
        paging: { next: 0 },
        data: [{ slug: 'm', name: 'M', distance: '1.0 km', city: '' }],
      };
    }
    return {
      returned_schedule_date: '2026-11-18',
      schedules: [{ movieId: 1, theaterName: 'Cinema 1', in3d: false, showtimes: ['8:00 PM'] }],
    };
  };
  const r = await findMovieShowtimes({ get, now: () => MORNING }, {
    movie: { id: 1, hash: 'h', title: 't' }, date: TODAY, location: ORTIGAS,
  });
  assert.equal(r.status, 'none-in-range');
});

// ── what is showing? ─────────────────────────────────────

test("what's showing today lists movies from the malls' own schedules", async () => {
  const { deps } = await setup(MORNING);
  const r = await listMoviesShowing(deps, { date: TODAY, location: ORTIGAS });
  assert.equal(r.status, 'ok');
  // Every mall in range is checked, nearest first, not just the closest five.
  assert.deepEqual(r.mallsChecked.slice(0, 6), ['Robinsons Galleria Ortigas', 'Opus Mall', 'The Podium', 'Greenhills Cinemas', 'Eastwood Mall', 'SM MegaMall']);
  assert.ok(r.mallsChecked.length > 5 && r.mallsChecked.length <= 15);
  const titles = r.movies.map((m) => m.title);
  assert.ok(r.movies[0].malls >= 5);
  // Unrated films come through with an empty rating rather than undefined.
  assert.equal(r.movies.find((m) => m.title === 'I Rarely Wake Up Dreaming').rating, '');
  assert.ok(titles.includes('Godzilla Minus Zero'));
  assert.equal(new Set(titles).size, titles.length, 'no duplicates');
  assert.ok(r.movies.every((m) => m.id && m.hash && m.title && m.malls >= 1));
  // Sorted by how many of the checked malls show it, then title.
  for (let i = 1; i < r.movies.length; i++) {
    const a = r.movies[i - 1];
    const b = r.movies[i];
    assert.ok(a.malls > b.malls || (a.malls === b.malls && a.title.localeCompare(b.title) <= 0));
  }
  const godzilla = r.movies.find((m) => m.title === 'Godzilla Minus Zero');
  assert.ok(godzilla.malls >= 2);
  assert.equal(godzilla.rating, 'PG');
  assert.equal(godzilla.runtime, '2 hrs 14 min');
});

test("what's showing later in the day never gains movies, and is empty once everything has started", async () => {
  const early = await listMoviesShowing((await setup(MORNING)).deps, { date: TODAY, location: ORTIGAS });
  const later = await listMoviesShowing((await setup(FOUR_PM)).deps, { date: TODAY, location: ORTIGAS });
  const earlyIds = new Set(early.movies.map((m) => m.id));
  assert.ok(later.movies.every((m) => earlyIds.has(m.id)));
  assert.ok(later.movies.length <= early.movies.length);

  const night = await listMoviesShowing((await setup(LATE)).deps, { date: TODAY, location: ORTIGAS });
  assert.equal(night.status, 'empty');
  assert.deepEqual(night.movies, []);
});

test("what's showing with the service failing throws", async () => {
  const { deps } = await setup(MORNING);
  await assert.rejects(listMoviesShowing(deps, { date: '2026-11-19', location: ORTIGAS }), (e) => e.kind === 'http');
});

test("what's showing includes a movie that only the 6th-nearest mall has", async () => {
  const mall = (n, km) => ({ slug: 'mall-' + n, name: 'Mall ' + n, distance: km + ' km' });
  const malls = [1, 2, 3, 4, 5, 6].map((n) => mall(n, n));
  const get = async (path) => {
    if (path.startsWith('/nearby-malls')) return { data: malls };
    const slug = path.match(/theater\/([^?]+)/)[1];
    const rare = slug === 'mall-6';
    return {
      returned_schedule_date: TODAY,
      now_showing: [{ movieId: 1, title: 'Common' }, { movieId: 2, title: 'Only At Six' }],
      schedules: [
        { movieId: 1, showtimes: ['8:00 PM'] },
        ...(rare ? [{ movieId: 2, showtimes: ['9:00 PM'] }] : []),
      ],
    };
  };
  const r = await listMoviesShowing({ get, now: () => MORNING }, { date: TODAY, location: ORTIGAS });
  assert.deepEqual(r.movies.map((m) => m.title), ['Common', 'Only At Six']);
  // Beyond the range it is ignored.
  const far = await listMoviesShowing({ get, now: () => MORNING }, { date: TODAY, location: ORTIGAS, options: { maxKm: 5 } });
  assert.deepEqual(far.movies.map((m) => m.title), ['Common']);
});
