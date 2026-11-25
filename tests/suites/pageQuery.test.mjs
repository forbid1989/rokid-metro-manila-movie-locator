import test from 'node:test';
import assert from 'node:assert/strict';
import { readTheaterQuery } from '../../utils/pageQuery.js';

const empty = { slug: '', theater: '', movieId: 0, movie: '', date: '' };

test('our own screens: slug, movieId and date', () => {
  assert.deepEqual(readTheaterQuery({ slug: 'sm-megamall', movieId: '21542', date: '2026-11-17' }),
    { slug: 'sm-megamall', theater: '', movieId: 21542, movie: '', date: '2026-11-17' });
});

test('the host assistant, following the schema', () => {
  assert.deepEqual(readTheaterQuery({ theater: 'SM Megamall', movie: 'Godzilla', date: 'tomorrow' }),
    { ...empty, theater: 'SM Megamall', movie: 'Godzilla', date: 'tomorrow' });
});

test('other names for the same things', () => {
  assert.equal(readTheaterQuery({ cinema: 'Galleria' }).theater, 'Galleria');
  assert.equal(readTheaterQuery({ mall: 'The Podium' }).theater, 'The Podium');
  assert.equal(readTheaterQuery({ theater_name: 'Opus' }).theater, 'Opus');
  assert.equal(readTheaterQuery({ THEATER: 'Opus' }).theater, 'Opus');
  assert.equal(readTheaterQuery({ theater: 'Opus', movie_name: 'Wicker' }).movie, 'Wicker');
  assert.equal(readTheaterQuery({ theater: 'Opus', title: 'Wicker' }).movie, 'Wicker');
  assert.equal(readTheaterQuery({ theater: 'Opus', day: 'friday' }).date, 'friday');
});

test('nested under data, or sent as a JSON string', () => {
  assert.equal(readTheaterQuery({ data: { theater: 'Galleria', movie: 'Godzilla' } }).movie, 'Godzilla');
  assert.equal(readTheaterQuery({ data: JSON.stringify({ theater: 'Galleria' }) }).theater, 'Galleria');
  assert.equal(readTheaterQuery({ params: { data: { cinema: 'Galleria' } } }).theater, 'Galleria');
});

test('an unrecognised text parameter is taken as the cinema; blanks and junk are not', () => {
  assert.equal(readTheaterQuery({ venue_description: 'SM Megamall' }).theater, 'SM Megamall');
  assert.equal(readTheaterQuery({ theater: '   ', movie: 'Godzilla' }).theater, '');
  assert.deepEqual(readTheaterQuery({}), empty);
  assert.deepEqual(readTheaterQuery(undefined), empty);
  assert.deepEqual(readTheaterQuery(null), empty);
  assert.equal(readTheaterQuery({ theater: 'x', date: 'today', slug: 'a' }).theater, 'x');
  assert.equal(readTheaterQuery({ data: '{not json' }).theater, '{not json', 'garbage is at worst an unknown name');
});

test('a cinema key wins over a guess', () => {
  assert.equal(readTheaterQuery({ whatever: 'zzz', theater: 'Galleria' }).theater, 'Galleria');
});

// ── stand-ins for "nothing" ─────────────────────────────

import { cleanText, readMovieQuery } from '../../utils/pageQuery.js';

test('"null" and friends are not names', () => {
  for (const v of ['null', 'NULL', ' none ', 'undefined', 'N/A', 'n/a', 'nil', 'unknown', 'not specified', '', '   ', '-']) {
    assert.equal(cleanText(v), '', JSON.stringify(v));
  }
  assert.equal(cleanText('Godzilla'), 'Godzilla');
  assert.equal(cleanText(' SM Megamall '), 'SM Megamall');
  assert.equal(cleanText(null), '');
  assert.equal(cleanText(42), '');
});

test('the theater query ignores them too', () => {
  assert.deepEqual(readTheaterQuery({ theater: 'null', movie: 'null', date: 'null' }), empty);
  assert.equal(readTheaterQuery({ theater: 'null', cinema: 'Galleria' }).theater, 'Galleria');
});

test('movie query: our own id, the assistant\'s title, and an optional cinema', () => {
  assert.deepEqual(readMovieQuery({ movie: '21542', date: '2026-11-17' }), { movieId: 21542, name: '', theater: '', date: '2026-11-17' });
  assert.deepEqual(readMovieQuery({ name: 'Godzilla', date: 'tomorrow' }), { movieId: 0, name: 'Godzilla', theater: '', date: 'tomorrow' });
  assert.deepEqual(readMovieQuery({ name: 'Godzilla', theater: 'SM Megamall' }), { movieId: 0, name: 'Godzilla', theater: 'SM Megamall', date: '' });
  assert.equal(readMovieQuery({ movie: 'Godzilla' }).name, 'Godzilla', 'a text `movie` is a title, not an id');
  assert.equal(readMovieQuery({ movie_name: 'Dune' }).name, 'Dune');
  assert.equal(readMovieQuery({ title: 'Dune' }).name, 'Dune');
  assert.equal(readMovieQuery({ data: { name: 'Dune' } }).name, 'Dune');
});

test('movie query: null is nothing, and the cinema is not mistaken for the movie', () => {
  assert.deepEqual(readMovieQuery({ name: 'null' }), { movieId: 0, name: '', theater: '', date: '' });
  assert.deepEqual(readMovieQuery({ name: 'null', theater: 'SM Megamall' }), { movieId: 0, name: '', theater: 'SM Megamall', date: '' });
  assert.deepEqual(readMovieQuery({}), { movieId: 0, name: '', theater: '', date: '' });
  assert.deepEqual(readMovieQuery(undefined), { movieId: 0, name: '', theater: '', date: '' });
});

// ── the Ask screen's query ──────────────────────────────

import { readAskQuery } from '../../utils/pageQuery.js';

test('ask query: the words as said', () => {
  assert.deepEqual(readAskQuery({ request: 'is godzilla showing at megamall' }), { request: 'is godzilla showing at megamall' });
  assert.equal(readAskQuery({ query: 'nearest theaters' }).request, 'nearest theaters');
  assert.equal(readAskQuery({ Request: ' tomorrow ' }).request, 'tomorrow');
  assert.equal(readAskQuery({ data: { request: 'what is on' } }).request, 'what is on');
});

test('ask query: separate fields are put back together as a sentence', () => {
  assert.equal(readAskQuery({ movie: 'Godzilla', theater: 'SM Megamall', date: 'tomorrow' }).request, 'Godzilla at SM Megamall tomorrow');
  assert.equal(readAskQuery({ name: 'Godzilla' }).request, 'Godzilla');
  assert.equal(readAskQuery({ theater: 'Galleria' }).request, 'at Galleria');
});

test('ask query: nothing, or stand-ins for nothing', () => {
  assert.equal(readAskQuery({}).request, '');
  assert.equal(readAskQuery({ request: 'null' }).request, '');
  assert.equal(readAskQuery(undefined).request, '');
  assert.equal(readAskQuery({ request: 'null', movie: 'Godzilla' }).request, 'Godzilla');
});
