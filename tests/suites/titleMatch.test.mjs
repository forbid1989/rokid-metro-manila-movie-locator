import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTokens, resolveMovie } from '../../utils/titleMatch.js';
import { loadCatalog } from '../../utils/search.js';
import { makeFakeGet } from '../helpers.mjs';

const catalog = await loadCatalog(makeFakeGet());
const resolve = (...queries) => resolveMovie(queries, catalog);
const titleOf = (r) => (r.movie ? r.movie.title : null);

test('normalizeTokens drops punctuation, articles and apostrophes, and turns number words into digits', () => {
  assert.deepEqual(normalizeTokens("Noah's Ark"), ['noahs', 'ark']);
  assert.deepEqual(normalizeTokens('Dune: Part Two'), ['dune', 'part', '2']);
  assert.deepEqual(normalizeTokens('The Cat in the Hat'), ['cat', 'in', 'hat']);
  assert.deepEqual(normalizeTokens('Sine Sindak 7 - VHS'), ['sine', 'sindak', '7', 'vhs']);
  assert.deepEqual(normalizeTokens('Ooops! Noah Is Gone...'), ['ooops', 'noah', 'is', 'gone']);
});

test('the full title, or any distinctive part of it, is a match', () => {
  for (const [said, title] of [
    ['godzilla minus zero', 'Godzilla Minus Zero'],
    ['godzilla', 'Godzilla Minus Zero'],
    ['how to rob a bank', 'How to Rob a Bank'],
    ['rob a bank', 'How to Rob a Bank'],
    ['the beast', 'The Beast'],
    ['beast', 'The Beast'],
    ['street fighter', 'Street Fighter'],
    ['resident evil', 'Resident Evil'],
    ['cat in the hat', 'The Cat in the Hat'],
    ['wicker', 'Wicker'],
    ['pee mak', 'Pee Mak'],
    ['clayface', 'Clayface'],
    ['valid ids', '2 Valid IDs'],
    ['two valid ids', '2 Valid IDs'],
    ['blue night', 'Lovers in the Blue Night'],
    ['sine sindak', 'Sine Sindak 7 - VHS'],
    ['aliens', 'We Are Aliens'],
  ]) {
    const r = resolve(said);
    assert.equal(r.status, 'match', said);
    assert.equal(titleOf(r), title, said);
  }
});

test('word order and number spelling do not matter', () => {
  assert.equal(titleOf(resolve('part two dune')), 'Dune: Part Two');
  assert.equal(titleOf(resolve('dune part 2')), 'Dune: Part Two');
  assert.equal(titleOf(resolve('dune part two')), 'Dune: Part Two');
});

test('an exact title beats longer titles that contain it', () => {
  const r = resolve('dune');
  assert.equal(r.status, 'match');
  assert.equal(titleOf(r), 'Dune'); // not Dune: Part Two
});

test('"godzilla minus one" asks for confirmation instead of guessing', () => {
  const r = resolve('godzilla minus one');
  assert.equal(r.status, 'confirm');
  assert.equal(titleOf(r), 'Godzilla Minus Zero');
});

test('a small spelling or recognition slip in a longer word still matches', () => {
  assert.equal(titleOf(resolve('godzila')), 'Godzilla Minus Zero');
  assert.equal(resolve('godzila').status, 'match');
  assert.equal(titleOf(resolve('resident evel')), 'Resident Evil');
});

test('a name that fits several titles is ambiguous and lists them', () => {
  // A controlled catalog: the live one changes day to day.
  const small = [
    { id: 1, title: "Noah's Ark" },
    { id: 2, title: 'Ooops! Noah Is Gone...' },
    { id: 3, title: 'Wicker' },
  ];
  const r = resolveMovie(['noah'], small);
  assert.equal(r.status, 'ambiguous');
  assert.deepEqual(r.candidates.map((c) => c.movie.title).sort(), ["Noah's Ark", 'Ooops! Noah Is Gone...']);
  // Saying more resolves it.
  assert.equal(resolveMovie(['noahs ark'], small).movie.id, 1);
  assert.equal(resolveMovie(['noah is gone'], small).movie.id, 2);
});

test('with only one title containing the word, saying that word is enough', () => {
  const r = resolve('noah'); // the recorded catalog has just "Ooops! Noah Is Gone..."
  assert.equal(r.status, 'match');
  assert.equal(titleOf(r), 'Ooops! Noah Is Gone...');
});

test('two names for the same movie are one answer', () => {
  const r = resolve('godzilla', 'godzilla minus zero');
  assert.equal(r.status, 'match');
  assert.equal(titleOf(r), 'Godzilla Minus Zero');
});

test('two names for different movies make the user choose', () => {
  const r = resolve('dune', 'street fighter');
  assert.equal(r.status, 'ambiguous');
  assert.deepEqual(r.candidates.map((c) => c.movie.title).sort(), ['Dune', 'Street Fighter']);
});

test('nonsense and empty input match nothing', () => {
  assert.equal(resolve('zzzz qqqq').status, 'none');
  assert.equal(resolve('the weather').status, 'none');
  assert.equal(resolve('').status, 'none');
  assert.equal(resolveMovie([], catalog).status, 'none');
  assert.equal(resolveMovie(undefined, catalog).status, 'none');
});

test('short or partial words do not match other titles by accident', () => {
  // "love" is not "lovers", "lost" must not pull in unrelated titles.
  assert.notEqual(titleOf(resolve('love')), 'Lovers in the Blue Night');
  assert.equal(titleOf(resolve('paradise lost')), 'Paradise Lost');
});

test('a title buried in words the matcher has never seen is still found', () => {
  for (const said of ['places are showing godzilla', 'godzilla out yet', 'zxq godzilla blorp', 'my friend said street fighter tomorrow']) {
    const r = resolve(said);
    assert.equal(r.status, 'match', said);
  }
  assert.equal(titleOf(resolve('zxq godzilla blorp')), 'Godzilla Minus Zero');
  assert.equal(titleOf(resolve('whenever street fighter opens')), 'Street Fighter');
});

test('a near-miss is still a question, not a silent guess, even with extra words', () => {
  // "minus one" is a different film: ask rather than quietly dropping it.
  assert.equal(resolve('godzilla minus one').status, 'confirm');
});

test('single short or common words never name a movie by themselves', () => {
  for (const said of ['it', 'out', 'yet', 'the weather', 'zzzz']) assert.equal(resolve(said).status, 'none', said);
});

test('when several films fit, the newer one is listed first', () => {
  const small = [
    { id: 1, title: 'Godzilla', releaseDate: '2014-05-14' },
    { id: 2, title: 'Godzilla: King of the Monsters', releaseDate: '2019-05-31' },
    { id: 3, title: 'Godzilla Minus Zero', releaseDate: '2026-11-04' },
  ];
  const r = resolveMovie(['godzilla'], small);
  // "Godzilla" is an exact title, so it wins outright; ask for something looser to see the ordering.
  assert.equal(r.status, 'match');
  const loose = resolveMovie(['godzilla monsters minus'], [
    { id: 2, title: 'Godzilla: King of the Monsters', releaseDate: '2019-05-31' },
    { id: 3, title: 'Godzilla Minus Zero', releaseDate: '2026-11-04' },
  ]);
  assert.notEqual(loose.status, 'none');
  const ordered = [
    { id: 10, title: 'Dune Part', releaseDate: '2021-10-22' },
    { id: 11, title: 'Dune Part', releaseDate: '2024-03-01' },
  ];
  const tie = resolveMovie(['dune'], ordered);
  assert.equal(tie.status, 'ambiguous');
  assert.deepEqual(tie.candidates.map((c) => c.movie.id), [11, 10], 'newest first');
});
