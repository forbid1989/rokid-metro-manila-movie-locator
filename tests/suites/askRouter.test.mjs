import test from 'node:test';
import assert from 'node:assert/strict';
import { routeRequest, echoFor, suggestions } from '../../utils/askRouter.js';
import { makeContext, NOW } from '../corpus/score.mjs';
import { SET_A } from '../corpus/setA.mjs';
import { SET_B } from '../corpus/setB.mjs';
import { SET_C } from '../corpus/setC.mjs';

const { catalog, ctx } = await makeContext();
const full = { catalog, directory: ctx.directory, origin: ctx.origin };
const route = (text, c) => routeRequest([text], c || full, NOW);

test('each kind of request opens the screen that suits it', () => {
  assert.equal(route("what's showing tomorrow").url, '/pages/movies/movies?date=2026-11-18');
  assert.equal(route('what are the nearest theaters').url, '/pages/theaters/theaters');
  assert.equal(route('where is godzilla showing').url, '/pages/results/results?movie=21542&date=2026-11-17');
  assert.equal(route("what's showing at sm megamall tomorrow").url, '/pages/theater/theater?slug=sm-megamall&date=2026-11-18');
  assert.equal(route('is godzilla showing at the podium').url, '/pages/theater/theater?slug=the-podium&date=2026-11-17&movieId=21542');
  assert.equal(route('open diagnostics').url, '/pages/diagnostics/diagnostics');
  assert.equal(route('tomorrow').url, '/pages/movies/movies?date=2026-11-18', 'a day alone, with no screen to reload, is the list');
});

test('the failing phrases from real use', () => {
  assert.equal(route('What movies are showing in SM megamall').url, '/pages/theater/theater?slug=sm-megamall&date=2026-11-17');
  assert.equal(route('what movies are being listed in sm megamall').url, '/pages/theater/theater?slug=sm-megamall&date=2026-11-17');
  assert.equal(route('Can you check if Godzilla is being shown in SM Megamall').url, '/pages/theater/theater?slug=sm-megamall&date=2026-11-17&movieId=21542');
  assert.equal(route('is Godzilla showing at Galleria').url, '/pages/theater/theater?slug=robinsons-galleria-ortigas&date=2026-11-17&movieId=21542');
});

test('a name that fits several cinemas or movies goes to the choose screen', () => {
  assert.match(route("what's showing at robinsons").url, /^\/pages\/choose\/choose\?kind=theater&mode=pick&date=2026-11-17&slugs=robinsons-galleria-ortigas,/);
  assert.match(route('godzilla minus one').url, /^\/pages\/choose\/choose\?mode=confirm&date=2026-11-17&ids=21542$/);
  assert.match(route('is godzilla minus one showing at the podium').url, /ids=21542&theater=the-podium$/);
});

test('what was understood is echoed in a few words', () => {
  assert.equal(route('is godzilla showing at sm megamall today').echo, 'Godzilla Minus Zero at SM MegaMall · today');
  assert.equal(route("what's showing at the podium tomorrow").echo, 'The Podium · tomorrow');
  assert.equal(route('nearest cinemas').echo, 'Nearest theaters');
  assert.equal(route("what's showing friday").echo, "What's showing · fri nov 20");
  assert.equal(route('godzilla').echo, 'Godzilla Minus Zero · today');
  assert.equal(echoFor({ type: 'mystery' }, NOW), '');
});

test('what it cannot make sense of says so and offers a way on', () => {
  for (const [said, message] of [
    ['zzzz qqqq', "No movie matching 'zzzz qqqq'"],
    ['what time is it', "Didn't catch that"],
    ['', 'Say a movie, a cinema or a day'],
    ['the', "Didn't catch that"],
  ]) {
    const r = route(said);
    assert.equal(r.kind, 'unsure', said);
    assert.equal(r.message, message, said);
    assert.deepEqual(r.options.map((o) => o.url), ['/pages/movies/movies?date=2026-11-17', '/pages/theaters/theaters']);
  }
  assert.deepEqual(suggestions(NOW).map((o) => o.id), ['list', 'theaters']);
});

test('a day that has passed is said, not searched', () => {
  const r = route('godzilla on november 10');
  assert.equal(r.kind, 'unsure');
  assert.equal(r.message, 'That day has already passed');
});

test('several recognizer guesses: the best one wins', () => {
  const r = routeRequest(['godzila at mega mall', 'godzilla at megamall'], full, NOW);
  assert.equal(r.kind, 'route');
  assert.match(r.url, /slug=sm-megamall.*movieId=21542$/);
  assert.equal(routeRequest([], full, NOW).kind, 'unsure');
  assert.equal(routeRequest(undefined, full, NOW).kind, 'unsure');
  assert.equal(routeRequest(['', '  '], full, NOW).kind, 'unsure');
});

test('without the cinema directory a cinema name is not recognised, but nothing breaks', () => {
  const r = route('is godzilla showing at sm megamall', { catalog, directory: null, origin: ctx.origin });
  assert.equal(r.kind, 'route');
  assert.equal(r.url, '/pages/results/results?movie=21542&date=2026-11-17');
});

test('every phrase in the phrase sets opens the screen its intent calls for', () => {
  const where = {
    list: /^\/pages\/movies\/movies\?date=/,
    date: /^\/pages\/movies\/movies\?date=/,
    theaters: /^\/pages\/theaters\/theaters$/,
    diagnostics: /^\/pages\/diagnostics\/diagnostics$/,
  };
  const misses = [];
  for (const [say, want] of [...SET_A, ...SET_B, ...SET_C]) {
    const r = route(say);
    if ((want.intent === 'find' && want.movie === null) || want.intent === 'nothing') {
      if (r.kind !== 'unsure') misses.push(say + ' should be unsure');
      continue;
    }
    if (r.kind !== 'route') {
      misses.push(say + ' was not routed: ' + r.message);
      continue;
    }
    let ok;
    if (want.intent === 'find' && want.theater) ok = /^\/pages\/theater\/theater\?slug=.*&movieId=\d+$/.test(r.url);
    else if (want.intent === 'find') ok = /^\/pages\/results\/results\?movie=\d+&date=/.test(r.url);
    else if (want.intent === 'theater') ok = /^\/pages\/theater\/theater\?slug=[a-z0-9-]+&date=\d{4}-\d\d-\d\d$/.test(r.url);
    else ok = where[want.intent].test(r.url);
    if (!ok) misses.push(say + ' -> ' + r.url);
  }
  assert.deepEqual(misses, []);
});
