import test from 'node:test';
import assert from 'node:assert/strict';
import { planAction } from '../../utils/voiceFlow.js';
import { interpret } from '../../utils/voiceCommand.js';
import { loadCatalog } from '../../utils/search.js';
import { makeFakeGet, at } from '../helpers.mjs';

const NOW = at('2026-11-17', 10, 0); // Tue
const catalog = await loadCatalog(makeFakeGet());
const movie = catalog.find((m) => m.title === 'Godzilla Minus Zero');
const say = (text, ctx) => planAction(interpret([text], catalog, NOW), ctx || { movie: null, date: '2026-11-17' }, NOW);

test('a clear movie name searches today by default', () => {
  const a = say('where is godzilla showing');
  assert.equal(a.type, 'search');
  assert.equal(a.movie.id, movie.id);
  assert.equal(a.date, '2026-11-17');
});

test('a named day is used', () => {
  assert.equal(say('godzilla tomorrow').date, '2026-11-18');
  assert.equal(say('godzilla on friday').date, '2026-11-20');
});

test('a near-miss title asks to confirm; an ambiguous one asks which', () => {
  const confirm = say('godzilla minus one');
  assert.deepEqual({ type: confirm.type, mode: confirm.mode, ids: confirm.candidates.map((m) => m.id) },
    { type: 'choose', mode: 'confirm', ids: [movie.id] });

  const pick = planAction(interpret(['dune or street fighter'], catalog, NOW), { movie: null }, NOW);
  assert.equal(pick.type, 'choose');
  assert.equal(pick.mode, 'pick');
  assert.deepEqual(pick.candidates.map((m) => m.title).sort(), ['Dune', 'Street Fighter']);
});

test('an unknown name is a toast that quotes it', () => {
  const a = say('where is zzzz qqqq showing');
  assert.equal(a.type, 'toast');
  assert.match(a.text, /No movie matching 'zzzz qqqq'/);
});

test('"what\'s showing" lists, with its day', () => {
  assert.deepEqual(say("what's showing"), { type: 'list', date: '2026-11-17' });
  assert.deepEqual(say('what movies are showing tomorrow'), { type: 'list', date: '2026-11-18' });
});

test('a bare day re-runs the current view: the same movie on a movie page, the list otherwise', () => {
  assert.deepEqual(say('tomorrow', { movie, date: '2026-11-17' }), { type: 'search', movie, date: '2026-11-18' });
  assert.deepEqual(say('tomorrow', { movie: null, date: '2026-11-17' }), { type: 'list', date: '2026-11-18' });
});

test('a day that has passed is refused', () => {
  const a = say('godzilla yesterday');
  assert.equal(a.type, 'toast');
  assert.match(a.text, /passed/);
});

test('diagnostics and nothing-understood', () => {
  assert.deepEqual(say('open diagnostics'), { type: 'diagnostics' });
  const none = planAction(null, {}, NOW);
  assert.equal(none.type, 'toast');
  assert.match(none.text, /movie name/);
});
