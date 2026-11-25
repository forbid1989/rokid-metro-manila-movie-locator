import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, interpret } from '../../utils/voiceCommand.js';
import { planAction } from '../../utils/voiceFlow.js';
import { extractTheater } from '../../utils/theaterPhrase.js';
import { loadCatalog } from '../../utils/search.js';
import { loadDirectory } from '../../utils/theaters.js';
import { normalizeTokens } from '../../utils/titleMatch.js';
import { makeFakeGet, at, ORTIGAS } from '../helpers.mjs';

const NOW = at('2026-11-17', 10, 0); // Tuesday
const { theaters: directory } = await loadDirectory(makeFakeGet());
const catalog = await loadCatalog(makeFakeGet());
const ctx = { directory, origin: ORTIGAS };
const parse = (text) => parseCommand(text, NOW, ctx);
const theaterOf = (c) => (c && c.theater && c.theater.theater ? c.theater.theater.name : c && c.theater ? c.theater.status : null);
const interp = (alts, extra) => interpret(alts, catalog, NOW, Object.assign({}, ctx, extra));

test('without a directory, nothing about cinemas is recognised and everything else is unchanged', () => {
  // Listing the nearest cinemas needs no directory; naming one does.
  assert.equal(parseCommand('what are the nearest theaters', NOW).intent, 'theaters');
  assert.equal(parseCommand('godzilla at megamall', NOW).theater, undefined);
  assert.equal(parseCommand('where is godzilla showing today', NOW).intent, 'find');
});

test('"what are the nearest theaters" lists the cinemas near the user', () => {
  for (const said of [
    'what are the nearest theaters to me',
    'nearest theaters',
    'cinemas near me',
    'what theaters are nearby',
    'show me nearby malls',
    'which cinema is closest',
    'is there a cinema nearby',
    'where are the nearest cinemas',
    'list theaters',
    'theaters',
    'hey rokid what are the closest movie theaters',
  ]) {
    const c = parse(said);
    assert.equal(c && c.intent, 'theaters', said);
  }
});

test('a movie named with "theaters" is still a movie search', () => {
  for (const said of ['what theaters are showing godzilla', 'which cinemas have wicker tonight', 'what theaters are showing godzilla near me']) {
    assert.equal(parse(said).intent, 'find', said);
  }
  // "what is showing" with no cinema or movie is still the list.
  assert.equal(parse("what's showing today").intent, 'list');
  assert.equal(parse('movies near me').intent, 'list');
});

test('naming a cinema asks what is showing there', () => {
  const table = [
    ['what are the movies being shown in robinsons galleria ortigas', 'Robinsons Galleria Ortigas', null],
    ["what's showing at megamall tomorrow", 'SM MegaMall', '2026-11-18'],
    ['movies at the podium today', 'The Podium', '2026-11-17'],
    ["what's playing at eastwood mall on friday", 'Eastwood Mall', '2026-11-20'],
    ['show me the schedule for opus mall', 'Opus Mall', null],
    ['what movies are showing in fisher mall malabon', 'Fisher Mall Malabon', null],
    ['robinsons galleria ortigas', 'Robinsons Galleria Ortigas', null],
    ['megamall showtimes', 'SM MegaMall', null],
    ["what's on at gateway mall 2", 'Gateway Mall 2', null],
    ["what's showing sa megamall", 'SM MegaMall', null],
    ['megamall', 'SM MegaMall', null],
    ['the podium', 'The Podium', null],
    ['gateway mall two showtimes', 'Gateway Mall 2', null],
    ['what is showing at trinoma on november 18', 'TriNoma Mall', '2026-11-18'],
    ['can you tell me what movies are showing at greenhills right now', 'Greenhills Cinemas', null],
  ];
  for (const [said, name, date] of table) {
    const c = parse(said);
    assert.equal(c && c.intent, 'theater', said);
    assert.equal(theaterOf(c), name, said);
    assert.equal(c.date, date, said);
    assert.deepEqual(c.queries, [], said);
  }
});

test('naming a movie and a cinema asks whether it is showing there', () => {
  const table = [
    ['is godzilla showing at robinsons galleria ortigas today', ['godzilla'], 'Robinsons Galleria Ortigas', '2026-11-17'],
    ['Is the movie Godzilla being shown in Robinsons Galleria Ortigas today', ['godzilla'], 'Robinsons Galleria Ortigas', '2026-11-17'],
    ['godzilla at megamall', ['godzilla'], 'SM MegaMall', null],
    ['godzilla at the podium tomorrow', ['godzilla'], 'The Podium', '2026-11-18'],
    ['where can i watch godzilla in sm megamall', ['godzilla'], 'SM MegaMall', null],
    ['what time is godzilla at robinsons galleria ortigas tonight', ['godzilla'], 'Robinsons Galleria Ortigas', '2026-11-17'],
    ['showtimes of wicker at opus mall', ['wicker'], 'Opus Mall', null],
    ['godzilla sa megamall', ['godzilla'], 'SM MegaMall', null],
    ['does megamall have godzilla', ['godzilla'], 'SM MegaMall', null],
    ['can you check if street fighter is showing at eastwood mall on friday', ['street fighter'], 'Eastwood Mall', '2026-11-20'],
    ['is the cat in the hat showing at gateway mall', ['cat in the hat'], 'Gateway Mall', null],
    ['the cat in the hat at megamall', ['cat in the hat'], 'SM MegaMall', null],
  ];
  for (const [said, queries, name, date] of table) {
    const c = parse(said);
    assert.equal(c && c.intent, 'find', said);
    assert.deepEqual(c.queries, queries, said);
    assert.equal(theaterOf(c), name, said);
    assert.equal(c.date, date, said);
  }
});

test('a name that fits several cinemas is carried as ambiguous, nearest first', () => {
  const c = parse("what's showing at robinsons");
  assert.equal(c.intent, 'theater');
  assert.equal(c.theater.status, 'ambiguous');
  assert.equal(c.theater.candidates[0].theater.name, 'Robinsons Galleria Ortigas');
  const f = parse('is godzilla showing at sm');
  assert.equal(f.intent, 'find');
  assert.equal(f.theater.status, 'ambiguous');
  // An area is a choice among its cinemas (a place search comes later).
  const area = parse("what's showing in ortigas");
  assert.equal(area.theater.status, 'ambiguous');
});

test('requests with no cinema in them are untouched', () => {
  for (const [said, queries] of [
    ['the cat in the hat', ['cat in the hat']],
    ['where is godzilla showing', ['godzilla']],
    ['i rarely wake up dreaming', ['rarely wake up dreaming']],
    ['showtimes for 2 valid ids', ['2 valid ids']],
    ['what places are showing godzilla', ['godzilla']],
    ['is godzilla showing in theaters', ['godzilla']],
    ['where can i watch dune part two in cinemas tomorrow', ['dune part two']],
  ]) {
    const c = parse(said);
    assert.equal(c.intent, 'find', said);
    assert.equal(c.theater, undefined, said);
    assert.deepEqual(c.queries, queries, said);
  }
});

test('every catalog title, asked any way, still resolves to itself and never to a cinema', () => {
  const templates = [
    (t) => 'where is ' + t + ' showing tomorrow',
    (t) => t,
    (t) => 'show me ' + t + ' on friday',
    (t) => 'I want to watch ' + t,
    (t) => 'showtimes for ' + t + ' today',
    (t) => 'is ' + t + ' showing in theaters',
  ];
  const misses = [];
  for (const movie of catalog) {
    for (const [i, tpl] of templates.entries()) {
      const said = tpl(movie.title.replace(/[:!]/g, ''));
      const r = interp([said]);
      const ok = r && r.intent === 'find' && !r.theater && r.resolution.status === 'match' && r.resolution.movie.id === movie.id;
      if (!ok) misses.push('template ' + i + ': "' + said + '" -> ' + (r && r.intent) + (r && r.theater ? ' @' + theaterOf(r) : ''));
    }
  }
  assert.deepEqual(misses, []);
});

test('every catalog title can be asked about at a cinema', () => {
  const misses = [];
  for (const movie of catalog) {
    const said = 'is ' + movie.title.replace(/[:!]/g, '') + ' showing at robinsons galleria ortigas today';
    const r = interp([said]);
    const ok = r && r.intent === 'find' && r.resolution.status === 'match' && r.resolution.movie.id === movie.id &&
      theaterOf(r) === 'Robinsons Galleria Ortigas';
    if (!ok) misses.push(said);
  }
  assert.deepEqual(misses, []);
});

// ── a cinema word that is also a film ───────────────────

test('a bare word that is both a film and a cinema is the film; with "at" it is the cinema', () => {
  const films = [{ id: 1, title: 'Aura', hash: 'a', releaseDate: '2026-01-01' }, { id: 2, title: 'Opus', hash: 'b', releaseDate: '2026-01-01' }];
  const asked = (said) => interpret([said], films, NOW, ctx);
  assert.equal(asked('aura').intent, 'find');
  assert.equal(asked('aura').resolution.movie.title, 'Aura');
  assert.equal(asked('where is opus showing').intent, 'find');
  assert.equal(asked("what's showing at aura").intent, 'theater');
  assert.equal(theaterOf(asked("what's showing at aura")), 'SM Aura Premier');
  assert.equal(asked('megamall').intent, 'theater'); // not a film, so the cinema
});

// ── recognizer guesses ──────────────────────────────────

test('interpret reads the movie and the cinema and keeps the best guess', () => {
  const r = interp(['is godzilla showing at robinsons galleria ortigas today']);
  assert.equal(r.intent, 'find');
  assert.equal(r.resolution.movie.title, 'Godzilla Minus Zero');
  assert.equal(theaterOf(r), 'Robinsons Galleria Ortigas');
  assert.equal(r.date, '2026-11-17');

  const worse = interp(['godzilla minus one at megamall', 'godzilla minus zero at megamall']);
  assert.equal(worse.resolution.status, 'match');
  const swapped = interp(['what is showing at robinsons', 'what is showing at robinsons galleria ortigas']);
  assert.equal(swapped.theater.status, 'match');
});

test('interpret keeps non-cinema commands working with a directory present', () => {
  assert.equal(interp(["what's showing tomorrow"]).intent, 'list');
  assert.equal(interp(['open diagnostics']).intent, 'diagnostics');
  assert.equal(interp(['tomorrow']).intent, 'date');
  assert.equal(interp(['the', '']), null);
  assert.equal(interp(['nearest theaters']).intent, 'theaters');
});

// ── planning ────────────────────────────────────────────

const plan = (said, context) => planAction(interp([said]), context || { movie: null, theater: null }, NOW);

test('planAction: the cinema commands', () => {
  assert.deepEqual(plan('what are the nearest theaters'), { type: 'theaters' });

  const t = plan("what's showing at megamall tomorrow");
  assert.equal(t.type, 'theater');
  assert.equal(t.theater.slug, 'sm-megamall');
  assert.equal(t.date, '2026-11-18');

  const tm = plan('is godzilla showing at the podium');
  assert.equal(tm.type, 'theater-movie');
  assert.equal(tm.theater.slug, 'the-podium');
  assert.equal(tm.movie.title, 'Godzilla Minus Zero');
  assert.equal(tm.date, '2026-11-17');
});

test('planAction: an ambiguous cinema asks which, and remembers the movie', () => {
  const a = plan('is godzilla showing at robinsons');
  assert.equal(a.type, 'choose');
  assert.equal(a.kind, 'theater');
  assert.equal(a.mode, 'pick');
  assert.equal(a.movie.title, 'Godzilla Minus Zero');
  assert.equal(a.candidates[0].slug, 'robinsons-galleria-ortigas');
  assert.ok(a.candidates.length > 1);

  const none = plan("what's showing at robinsons");
  assert.equal(none.kind, 'theater');
  assert.equal(none.movie, null);
});

test('planAction: an unsure movie asks first and carries the cinema along', () => {
  const a = plan('is godzilla minus one showing at the podium');
  assert.equal(a.type, 'choose');
  assert.equal(a.kind, 'movie');
  assert.equal(a.mode, 'confirm');
  assert.equal(a.theater.status, 'match');
  assert.equal(a.theater.theater.slug, 'the-podium');
  // Ordinary movie choices carry no cinema.
  const plain = plan('godzilla minus one');
  assert.equal(plain.kind, 'movie');
  assert.equal(plain.theater, null);
});

test('planAction: a bare day on a cinema page reloads that cinema', () => {
  const megamall = directory.find((t) => t.slug === 'sm-megamall');
  const godzilla = catalog.find((m) => m.title === 'Godzilla Minus Zero');
  const a = plan('tomorrow', { movie: null, theater: megamall });
  assert.deepEqual({ type: a.type, slug: a.theater.slug, date: a.date }, { type: 'theater', slug: 'sm-megamall', date: '2026-11-18' });
  const b = plan('what about friday', { movie: godzilla, theater: megamall });
  assert.deepEqual({ type: b.type, movie: b.movie.title, date: b.date }, { type: 'theater-movie', movie: 'Godzilla Minus Zero', date: '2026-11-20' });
  // Without a cinema on the page it is the same as before.
  assert.equal(plan('tomorrow', { movie: godzilla, theater: null }).type, 'search');
  assert.equal(plan('tomorrow', { movie: null, theater: null }).type, 'list');
});

test('planAction: a past day is refused for cinema commands too', () => {
  const a = plan("what's showing at megamall on november 10");
  assert.equal(a.type, 'toast');
});

// ── extractTheater on its own ───────────────────────────

test('extractTheater leaves the rest of the request intact', () => {
  const run = (s) => extractTheater(normalizeTokens(s), directory, { origin: ORTIGAS });
  const r = run('is godzilla showing at robinsons galleria ortigas please');
  assert.equal(r.resolution.theater.name, 'Robinsons Galleria Ortigas');
  assert.ok(r.tokens.includes('godzilla') && !r.tokens.includes('galleria'));
  assert.equal(r.weak, false);
  assert.equal(run('the cat in the hat'), null);
  assert.equal(run('what is showing today'), null);
  assert.equal(extractTheater([], directory), null);
  assert.equal(extractTheater(['megamall'], []), null);
  assert.equal(run('opus').weak, true);
});
