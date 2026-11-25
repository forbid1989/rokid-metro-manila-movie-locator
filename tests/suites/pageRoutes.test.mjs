import test from 'node:test';
import assert from 'node:assert/strict';
import { routeFor, resultsUrl, theaterUrl, chooseMoviesUrl, chooseTheatersUrl, moviesUrl } from '../../utils/pageRoutes.js';

const movie = (id) => ({ id });
const theater = (slug) => ({ slug });

test('urls', () => {
  assert.equal(resultsUrl(21542, '2026-11-17'), '/pages/results/results?movie=21542&date=2026-11-17');
  assert.equal(theaterUrl('sm-megamall', '2026-11-17'), '/pages/theater/theater?slug=sm-megamall&date=2026-11-17');
  assert.equal(theaterUrl('sm-megamall', '2026-11-17', 21542), '/pages/theater/theater?slug=sm-megamall&date=2026-11-17&movieId=21542');
  assert.equal(moviesUrl('2026-11-18'), '/pages/movies/movies?date=2026-11-18');
  assert.equal(moviesUrl(), '/pages/movies/movies');
  assert.equal(chooseMoviesUrl('pick', '2026-11-17', [movie(1), movie(2)], ''), '/pages/choose/choose?mode=pick&date=2026-11-17&ids=1,2');
  assert.equal(chooseMoviesUrl('confirm', '2026-11-17', [movie(1)], 'the-podium'), '/pages/choose/choose?mode=confirm&date=2026-11-17&ids=1&theater=the-podium');
  assert.equal(chooseTheatersUrl('pick', '2026-11-17', [theater('a'), theater('b')], 0), '/pages/choose/choose?kind=theater&mode=pick&date=2026-11-17&slugs=a,b');
  assert.equal(chooseTheatersUrl('pick', '2026-11-17', [theater('a')], 7), '/pages/choose/choose?kind=theater&mode=pick&date=2026-11-17&slugs=a&movie=7');
});

test('routeFor maps every navigation action, and nothing else', () => {
  assert.equal(routeFor({ type: 'search', movie: movie(5), date: '2026-11-17' }), '/pages/results/results?movie=5&date=2026-11-17');
  assert.equal(routeFor({ type: 'theater', theater: theater('x'), date: '2026-11-17' }), '/pages/theater/theater?slug=x&date=2026-11-17');
  assert.equal(routeFor({ type: 'theater-movie', theater: theater('x'), movie: movie(5), date: '2026-11-17' }), '/pages/theater/theater?slug=x&date=2026-11-17&movieId=5');
  assert.equal(routeFor({ type: 'theaters' }), '/pages/theaters/theaters');
  assert.equal(routeFor({ type: 'list', date: '2026-11-18' }), '/pages/movies/movies?date=2026-11-18');
  assert.equal(routeFor({ type: 'diagnostics' }), '/pages/diagnostics/diagnostics');
  assert.equal(routeFor({ type: 'toast', text: 'x' }), null);
  assert.equal(routeFor(null), null);
  assert.equal(routeFor({ type: 'mystery' }), null);
});

test('routeFor choose: movies carry a matched cinema only; cinemas carry the movie', () => {
  const base = { type: 'choose', mode: 'pick', date: '2026-11-17' };
  assert.equal(routeFor({ ...base, kind: 'movie', candidates: [movie(1), movie(2)], theater: null }), '/pages/choose/choose?mode=pick&date=2026-11-17&ids=1,2');
  assert.equal(routeFor({ ...base, kind: 'movie', candidates: [movie(1)], theater: { status: 'match', theater: theater('the-podium') } }),
    '/pages/choose/choose?mode=pick&date=2026-11-17&ids=1&theater=the-podium');
  assert.equal(routeFor({ ...base, kind: 'movie', candidates: [movie(1)], theater: { status: 'ambiguous', candidates: [] } }),
    '/pages/choose/choose?mode=pick&date=2026-11-17&ids=1', 'an unresolved cinema cannot be carried');
  assert.equal(routeFor({ ...base, kind: 'theater', candidates: [theater('a'), theater('b')], movie: movie(9) }),
    '/pages/choose/choose?kind=theater&mode=pick&date=2026-11-17&slugs=a,b&movie=9');
  assert.equal(routeFor({ ...base, kind: 'theater', candidates: [theater('a')], movie: null }),
    '/pages/choose/choose?kind=theater&mode=pick&date=2026-11-17&slugs=a');
});
