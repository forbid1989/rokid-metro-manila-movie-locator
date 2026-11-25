import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, interpret } from '../../utils/voiceCommand.js';
import { loadCatalog } from '../../utils/search.js';
import { makeFakeGet, at } from '../helpers.mjs';

const NOW = at('2026-11-17', 10, 0); // Tuesday
const cmd = (text) => parseCommand(text, NOW);
const shape = (c) => c && { intent: c.intent, queries: c.queries, date: c.date };

test('finding a movie, with and without a day', () => {
  const find = (queries, date) => ({ intent: 'find', queries, date });
  assert.deepEqual(shape(cmd('where is godzilla showing today')), find(['godzilla'], '2026-11-17'));
  assert.deepEqual(shape(cmd('godzilla')), find(['godzilla'], null));
  assert.deepEqual(shape(cmd('is godzilla showing tomorrow')), find(['godzilla'], '2026-11-18'));
  assert.deepEqual(shape(cmd('showtimes for 2 valid IDs')), find(['2 valid ids'], null));
  assert.deepEqual(shape(cmd('show me the beast on friday')), find(['beast'], '2026-11-20'));
  assert.deepEqual(shape(cmd('where can I watch Dune Part Two tomorrow')), find(['dune part two'], '2026-11-18'));
  assert.deepEqual(shape(cmd('I want to see Wicker')), find(['wicker'], null));
  assert.deepEqual(shape(cmd("I'd like to watch Street Fighter tonight")), find(['street fighter'], '2026-11-17'));
  assert.deepEqual(shape(cmd('hey rokid find clayface')), find(['clayface'], null));
  assert.deepEqual(shape(cmd('is Remember showing on the 18th of November')), find(['remember'], '2026-11-18'));
});

test('the example sentence from the brief, with two names', () => {
  const c = cmd('Can search any movie theaters that is showing Godzilla or Godzilla minus zero today');
  assert.deepEqual(shape(c), { intent: 'find', queries: ['godzilla', 'godzilla minus zero'], date: '2026-11-17' });
});

test('dates in digit form', () => {
  assert.equal(cmd('godzilla minus zero on 11/18').date, '2026-11-18');
  assert.equal(cmd('godzilla 2026-11-19').date, '2026-11-19');
  assert.equal(cmd('godzilla nov 18th').date, '2026-11-18');
});

test('titles that begin or end with everyday words keep their meaning', () => {
  // Leading/trailing filler is trimmed, so the distinctive words remain.
  assert.deepEqual(cmd('where is a long winter showing').queries, ['long winter']);
  assert.deepEqual(cmd('we are aliens').queries, ['aliens']);
  assert.deepEqual(cmd('i rarely wake up dreaming').queries, ['rarely wake up dreaming']);
  assert.deepEqual(cmd('the cat in the hat').queries, ['cat in the hat']); // middle words untouched
});

test("asking what's on", () => {
  const list = (date) => ({ intent: 'list', queries: [], date });
  assert.deepEqual(shape(cmd('what movies are showing today')), list('2026-11-17'));
  assert.deepEqual(shape(cmd("what's showing on November 18")), list('2026-11-18'));
  assert.deepEqual(shape(cmd("what's on friday")), list('2026-11-20'));
  assert.deepEqual(shape(cmd('movies showing tomorrow')), list('2026-11-18'));
  assert.deepEqual(shape(cmd("what's showing")), list(null));
  assert.deepEqual(shape(cmd('what can I watch tonight')), list('2026-11-17'));
  assert.deepEqual(shape(cmd('hey rokid whats playing')), list(null));
});

test('only a day means "same thing, another day"', () => {
  const date = (d) => ({ intent: 'date', queries: [], date: d });
  assert.deepEqual(shape(cmd('tomorrow')), date('2026-11-18'));
  assert.deepEqual(shape(cmd('what about friday')), date('2026-11-20'));
  assert.deepEqual(shape(cmd('how about the 19th')), date('2026-11-19'));
});

test('diagnostics', () => {
  assert.equal(cmd('open diagnostics').intent, 'diagnostics');
  assert.equal(cmd('diagnostic').intent, 'diagnostics');
});

test('things that are not commands', () => {
  assert.equal(cmd(''), null);
  assert.equal(cmd('   '), null);
  assert.equal(cmd('the'), null);
  assert.equal(cmd('what is'), null);
  assert.equal(parseCommand(undefined, NOW), null);
});

// ── interpret: several recognizer guesses ────────────────

const catalog = await loadCatalog(makeFakeGet());
const interp = (alts) => interpret(alts, catalog, NOW);

test('interpret resolves the movie against the catalog', () => {
  const r = interp(['where is godzilla showing today']);
  assert.equal(r.intent, 'find');
  assert.equal(r.date, '2026-11-17');
  assert.equal(r.resolution.status, 'match');
  assert.equal(r.resolution.movie.title, 'Godzilla Minus Zero');
});

test('interpret prefers the recognizer guess that leads to a movie', () => {
  const r = interp(['godzilla minus one', 'godzilla minus zero', 'godzilla and minus zero']);
  assert.equal(r.resolution.status, 'match');
  assert.equal(r.resolution.movie.title, 'Godzilla Minus Zero');
});

test('interpret keeps a confirmable guess when nothing matches outright', () => {
  const r = interp(['godzilla minus one']);
  assert.equal(r.resolution.status, 'confirm');
});

test('interpret passes through non-movie commands and ignores empty guesses', () => {
  assert.equal(interp(["what's showing tomorrow"]).intent, 'list');
  assert.equal(interp(['', "what's showing tomorrow"]).date, '2026-11-18');
  assert.equal(interp(['open diagnostics']).intent, 'diagnostics');
  assert.equal(interp([]), null);
  assert.equal(interp(undefined), null);
  assert.equal(interp(['the', '']), null);
});

test('interpret: a movie guess beats a list guess for the same utterance', () => {
  const r = interp(["what's showing", 'street fighter']);
  assert.equal(r.intent, 'find');
  assert.equal(r.resolution.movie.title, 'Street Fighter');
});

test('every title in the recorded catalog can be asked for naturally and resolves to itself', () => {
  const templates = [
    (t) => 'where is ' + t + ' showing tomorrow',
    (t) => t,
    (t) => 'show me ' + t + ' on friday',
    (t) => 'I want to watch ' + t,
    (t) => 'showtimes for ' + t + ' today',
  ];
  const misses = [];
  for (const movie of catalog) {
    for (const [i, tpl] of templates.entries()) {
      // Speech recognizers do not output the punctuation that is in the title.
      const said = tpl(movie.title.replace(/[:!]/g, ''));
      const r = interp([said]);
      const ok = r && r.intent === 'find' && r.resolution.status === 'match' && r.resolution.movie.id === movie.id;
      if (!ok) misses.push('template ' + i + ': "' + said + '"');
    }
  }
  assert.deepEqual(misses, []);
});

test('conversational phrasings, including "right now" and polite wrappers', () => {
  const find = (q, d) => ({ intent: 'find', queries: [q], date: d });
  const list = (d) => ({ intent: 'list', queries: [], date: d });
  // The sentence from the Studio session.
  assert.deepEqual(shape(cmd('What theaters are showing godzilla right now?')), find('godzilla', null));
  assert.deepEqual(shape(cmd('what cinemas are showing godzilla near me')), find('godzilla', null));
  assert.deepEqual(shape(cmd('is godzilla playing right now')), find('godzilla', null));
  assert.deepEqual(shape(cmd('what theaters have godzilla tonight')), find('godzilla', '2026-11-17'));
  assert.deepEqual(shape(cmd('do you have street fighter tomorrow')), find('street fighter', '2026-11-18'));
  assert.deepEqual(shape(cmd('Can you check what are the available movies today?')), list('2026-11-17'));
  assert.deepEqual(shape(cmd('is there any movie showing tomorrow')), list('2026-11-18'));
  assert.deepEqual(shape(cmd('get me the list of movies')), list(null));
});

test('those phrasings resolve to the right movie end to end', () => {
  for (const said of ['What theaters are showing godzilla right now?', 'what theaters have godzilla tonight']) {
    const r = interp([said]);
    assert.equal(r.resolution.status, 'match', said);
    assert.equal(r.resolution.movie.title, 'Godzilla Minus Zero', said);
  }
});

test('however the question is worded, the movie is found (including words the parser has never seen)', () => {
  for (const said of [
    'Can you check if Godzilla is showing in theaters',
    'where can I watch godzilla?',
    'What places are showing Godzilla?',
    'What theaters are showing godzilla right now?',
    'is godzilla in theaters',
    'is godzilla out yet',
    'is godzilla still showing',
    'any showings of godzilla today',
    "I'd like to see Godzilla, where is it showing",
    'are there any cinemas showing godzilla',
    'which malls have godzilla',
    'does any cinema have godzilla',
    'godzilla showtimes',
    'hey rokid is godzilla playing anywhere near ortigas',
    'tell me whether godzilla is on at the cinema tonight',
  ]) {
    const r = interp([said]);
    assert.equal(r.intent, 'find', said);
    assert.equal(r.resolution.status, 'match', said);
    assert.equal(r.resolution.movie.title, 'Godzilla Minus Zero', said);
  }
});

test('the wording around a title never turns a non-movie request into a movie search', () => {
  for (const said of ['check the weather', "what's the time", 'play some music', 'call my mom']) {
    const r = interp([said]);
    assert.ok(!r || r.intent !== 'find' || r.resolution.status === 'none', said + ' -> ' + JSON.stringify(r && r.resolution && r.resolution.status));
  }
});
