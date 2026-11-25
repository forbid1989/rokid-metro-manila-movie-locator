import test from 'node:test';
import assert from 'node:assert/strict';
import { dateHeader, ratingRuntime, movieRows, resultRows, resultMessage, emptyListMessage, theaterRows, noTheatersMessage } from '../../utils/viewModel.js';
import { describeError } from '../../utils/errors.js';
import { findMovieShowtimes, loadCatalog } from '../../utils/search.js';
import { makeFakeGet, at, ORTIGAS } from '../helpers.mjs';

const NOW = at('2026-11-17', 10, 0);

test('dateHeader', () => {
  assert.equal(dateHeader('2026-11-17', NOW), 'Today · Tue Nov 17');
  assert.equal(dateHeader('2026-11-18', NOW), 'Tomorrow · Wed Nov 18');
  assert.equal(dateHeader('2026-11-20', NOW), 'Fri Nov 20');
});

test('ratingRuntime copes with missing parts', () => {
  assert.equal(ratingRuntime('PG', '2 hrs 14 min'), 'PG · 2h 14m');
  assert.equal(ratingRuntime('', '1 hr 40 min'), '1h 40m');
  assert.equal(ratingRuntime('R-13', ''), 'R-13');
  assert.equal(ratingRuntime('', ''), '');
});

test('movieRows truncates long titles and keeps ids', () => {
  const rows = movieRows([
    { id: 21542, title: 'Godzilla Minus Zero', rating: 'PG', runtime: '2 hrs 14 min' },
    { id: 21622, title: 'I Deserve a Lover Whose Every Rise Sets Fiery Dooms Raging Across the Skies', rating: 'PG', runtime: '1 hr 16 min' },
  ]);
  assert.deepEqual(rows[0], { id: 'm21542', movieId: 21542, title: 'Godzilla Minus Zero', meta: 'PG · 2h 14m' });
  assert.ok(rows[1].title.length <= 34 && rows[1].title.endsWith('…'));
  assert.deepEqual(movieRows(undefined), []);
});

test('movieRows can lead with the year to tell similar films apart', () => {
  const movies = [{ id: 1, title: 'Dune', rating: 'PG', runtime: '2 hrs 35 min', releaseDate: '2021-11-10' }];
  assert.equal(movieRows(movies)[0].meta, 'PG · 2h 35m');
  assert.equal(movieRows(movies, { year: true })[0].meta, '2021 · PG · 2h 35m');
  assert.equal(movieRows([{ id: 2, title: 'X', rating: '', runtime: '' }], { year: true })[0].meta, '');
});

test('resultRows flattens malls into header rows and time rows with scroll anchors', async () => {
  const get = makeFakeGet();
  const catalog = await loadCatalog(get);
  const r = await findMovieShowtimes({ get, now: () => NOW }, {
    movie: catalog.find((m) => m.title === 'Godzilla Minus Zero'), date: '2026-11-17', location: ORTIGAS,
  });
  const { rows, mallStarts } = resultRows(r.malls);
  assert.deepEqual(rows[0], { id: 'm0', kind: 'mall', mallIdx: 0, text: 'The Podium', right: '1.7 km', label: '' });
  assert.deepEqual(rows[1], { id: 'm0t0', kind: 'times', mallIdx: 0, text: '12:00 PM · 8:00 PM', right: '', label: "Director's" });
  // Greenhills has two groups: ordinary room then Luxe.
  const greenhills = rows.filter((x) => x.mallIdx === 1);
  assert.deepEqual(greenhills.map((x) => x.kind), ['mall', 'times', 'times']);
  assert.deepEqual(greenhills.map((x) => x.label), ['', '', 'Luxe']);
  // Each anchor points at its mall's header row.
  assert.equal(mallStarts.length, 5);
  mallStarts.forEach((start, i) => {
    assert.equal(rows[start].kind, 'mall');
    assert.equal(rows[start].mallIdx, i);
  });
  assert.equal(new Set(rows.map((x) => x.id)).size, rows.length, 'row ids are unique');
});

test('resultMessage explains each empty outcome', () => {
  const base = { movie: { id: 1 }, malls: [] };
  assert.equal(resultMessage({ ...base, status: 'ok', date: '2026-11-17' }, NOW), null);

  assert.deepEqual(
    resultMessage({ ...base, status: 'no-date', date: '2026-11-25', availableDates: ['2026-11-17', '2026-11-18', '2026-11-19'] }, NOW),
    { headline: 'Not showing on Wed Nov 25', lines: ['Showing on: Today, Tomorrow, Thu Nov 19'] }
  );
  assert.equal(resultMessage({ ...base, status: 'no-date', date: '2026-11-18', availableDates: ['2026-11-17'] }, NOW).headline, 'Not showing tomorrow');

  assert.deepEqual(resultMessage({ ...base, status: 'none-left-today', date: '2026-11-17' }, NOW),
    { headline: 'No more showings today', lines: ["Say 'tomorrow' for later"] });

  const far = resultMessage({
    ...base, status: 'none-in-range', date: '2026-11-17',
    nearest: { name: 'Sta. Lucia East Grand Mall', distanceKm: 4.1 },
  }, NOW);
  assert.deepEqual(far, { headline: 'Not showing within 20 km today', lines: ['Nearest: Sta. Lucia East Grand Mall, 4.1 km'] });

  assert.deepEqual(resultMessage({ ...base, status: 'not-showing', date: '2026-11-17' }, NOW),
    { headline: 'No showtimes listed', lines: ['Try another movie'] });
});

test('emptyListMessage', () => {
  assert.equal(emptyListMessage('2026-11-17', NOW).headline, 'No more showings today');
  assert.equal(emptyListMessage('2026-11-18', NOW).headline, 'No showings tomorrow');
  assert.equal(emptyListMessage('2026-11-20', NOW).headline, 'No showings on Fri Nov 20');
});

test('describeError words each failure kind', () => {
  assert.match(describeError({ kind: 'forbidden' }), /403/);
  assert.match(describeError({ kind: 'network' }), /connection/i);
  assert.match(describeError({ kind: 'timeout' }), /slow/i);
  assert.equal(describeError({ kind: 'http', status: 500 }), 'Service error (500)');
  assert.match(describeError({ kind: 'parse' }), /unexpected/i);
  assert.equal(describeError(new Error('x')), 'Something went wrong');
  assert.equal(describeError(undefined), 'Something went wrong');
});

test('theaterRows: name, city and distance, with long names shortened', () => {
  const rows = theaterRows([
    { slug: 'a', name: 'Robinsons Galleria Ortigas', city: 'Quezon', distanceKm: 1.24 },
    { slug: 'b', name: 'A Very Long Cinema Name That Will Not Fit On One Line', city: 'Mandaluyong', distanceKm: 12.06 },
    { slug: 'c', name: 'Tiny', city: '', distanceKm: 0.02 },
  ]);
  assert.deepEqual(rows[0], { id: 'ta', slug: 'a', title: 'Robinsons Galleria Ortigas', city: 'Quezon', meta: '1.2 km' });
  assert.ok(rows[1].title.length <= 30 && rows[1].title.endsWith('…'));
  assert.equal(rows[1].meta, '12.1 km');
  assert.equal(rows[2].meta, '0.1 km');
  assert.deepEqual(theaterRows(undefined), []);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
});

test('noTheatersMessage', () => {
  assert.deepEqual(noTheatersMessage(20), { headline: 'No cinemas within 20 km', lines: ['Say a movie name to search'] });
});
