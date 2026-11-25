import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, ORTIGAS_FIX } from '../pageHarness.mjs';
import { at } from '../helpers.mjs';
import { haversineKm, formatKm } from '../../utils/geo.js';

let env;
beforeEach(() => { env = createEnv(); });
afterEach(() => env.close());

const open = async (query) => {
  const page = await env.openPage('theater', query);
  await env.waitFor(() => page.data.state !== 'loading', 'theater page to load');
  return page;
};
const MEGAMALL = { slug: 'sm-megamall', date: '2026-11-17' };
const km = (lat, lng) => formatKm(haversineKm({ lat: ORTIGAS_FIX.latitude, lng: ORTIGAS_FIX.longitude }, { lat, lng }));
const mallRows = (page) => page.data.rows.filter((r) => r.kind === 'mall').map((r) => r.text);

// ── everything at one cinema ────────────────────────────

test('a cinema is a list of its movies, in the same format as the other lists', async () => {
  const page = await open(MEGAMALL);
  assert.equal(page.data.state, 'list');
  assert.equal(page.data.title, 'SM MegaMall');
  assert.equal(page.data.meta, km(14.584455639498714, 121.0572123527526));
  assert.equal(page.data.header, 'Today · Tue Nov 17');
  assert.equal(page.data.location, 'Near you');
  const titles = page.data.items.map((i) => i.title.replace(/…$/, ''));
  assert.ok(titles.length >= 5);
  assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b)));
  const godzilla = page.data.items.find((i) => i.title === 'Godzilla Minus Zero');
  assert.deepEqual({ meta: godzilla.meta, times: godzilla.times }, { meta: 'PG · 2h 14m', times: '11:30 AM · 3:30 PM · 6:30 PM · 9:30 PM' });
  assert.ok(page.data.items.every((i) => i.times && i.meta !== undefined));
  assert.equal(page.data.position, '1/' + titles.length);
});

test('five rows are on screen; the highlight moves first, then the list slides', async () => {
  const page = await open(MEGAMALL);
  assert.equal(page.data.itemsVisible.length, 5);
  assert.equal(page.data.itemsBelow, page.data.items.length - 5);
  for (let i = 0; i < 4; i++) env.swipe(page, 'down');
  assert.equal(page.data.itemSel, 4);
  assert.equal(page.data.itemsVisible[0].i, 0);
  env.swipe(page, 'down');
  assert.equal(page.data.itemsVisible[0].i, 1);
  env.swipe(page, 'up');
  assert.equal(page.data.itemSel, 4);
  assert.equal(page.data.itemsVisible[0].i, 1, 'moving back up does not slide the list');
});

test("Enter or a tap opens that movie's showtimes at this cinema, on a screen of its own", async () => {
  const page = await open(MEGAMALL);
  env.swipe(page, 'down');
  const second = page.data.items[1];
  env.key(page, 'Enter');
  await env.waitFor(() => env.navigations().length > 0);
  assert.equal(env.navigations()[0], '/pages/theater/theater?slug=sm-megamall&date=2026-11-17&movieId=' + second.movieId);
  page.onTapItem({ currentTarget: { dataset: { index: 3 } } });
  await env.waitFor(() => env.navigations().length > 1);
  assert.match(env.navigations()[1], new RegExp('movieId=' + page.data.items[3].movieId + '$'));
});

test('the host asking "what movies are being shown at <cinema>" gets that list', async () => {
  const page = await open({ theater: 'Robinsons Galleria Ortigas' });
  assert.equal(page.data.state, 'list');
  assert.equal(page.data.title, 'Robinsons Galleria Ortigas');
  assert.ok(page.data.items.length >= 8);
});

test("a cinema's other days work", async () => {
  const later = await open({ slug: 'sm-megamall', date: '2026-11-18' });
  assert.equal(later.data.header, 'Tomorrow · Wed Nov 18');
  assert.equal(later.data.state, 'list');
});

test('when the day is over there is a message, not an empty list', async () => {
  env.clock = at('2026-11-17', 23, 30);
  const page = await open(MEGAMALL);
  assert.equal(page.data.state, 'message');
  assert.equal(page.data.message, 'No more showings today');
  assert.deepEqual(page.data.lines.map((l) => l.text), ["Say 'tomorrow' for later"]);
});

test('a day with no schedule says so', async () => {
  const page = await open({ slug: 'sm-megamall', date: '2026-12-30' });
  assert.equal(page.data.state, 'message');
  assert.match(page.data.message, /No showtimes listed/);
});

// ── is this movie at this cinema ────────────────────────

test('a movie that is there shows its times at that cinema', async () => {
  const page = await open({ ...MEGAMALL, movieId: 21542 });
  assert.equal(page.data.state, 'ready');
  assert.equal(page.data.title, 'Godzilla Minus Zero');
  assert.equal(page.data.meta, 'PG · 2h 14m');
  assert.deepEqual(mallRows(page), ['SM MegaMall']);
  const times = page.data.rows.filter((r) => r.kind === 'times');
  assert.deepEqual(times.map((r) => [r.label, r.text]), [['', '3:30 PM · 6:30 PM · 9:30 PM'], ['IMAX', '11:30 AM']]);
  env.key(page, 'Enter');
  await env.waitFor(() => env.navigations().length > 0);
  assert.equal(env.navigations()[0], '/pages/results/results?movie=21542&date=2026-11-17');
});

test('a movie that is not there says so and lists the nearest cinemas that have it', async () => {
  const page = await open({ slug: 'robinsons-galleria-ortigas', date: '2026-11-17', movieId: 21542 });
  assert.equal(page.data.state, 'ready');
  assert.equal(page.data.title, 'Godzilla Minus Zero');
  assert.equal(page.data.header, 'Not at Robinsons Galleria Ortigas · today');
  assert.deepEqual(mallRows(page), ['The Podium', 'Greenhills Cinemas', 'SM MegaMall']);
  assert.equal(page.data.note, 'Nearest showing · Tap open');
  env.swipe(page, 'down');
  env.key(page, 'Enter');
  await env.waitFor(() => env.navigations().length > 0);
  assert.equal(env.navigations()[0], '/pages/theater/theater?slug=greenhills-cinemas&date=2026-11-17&movieId=21542');
});

test('other cinemas that have it are offered even when they are further out', async () => {
  const page = await open({ slug: 'sm-megamall', date: '2026-11-17', movieId: 21543 }); // He's Dating a Boldstar
  assert.equal(page.data.state, 'ready');
  assert.deepEqual(mallRows(page), ['Sta. Lucia East Grand Mall', 'Robinsons Place Manila']);
});

test('a movie not there, with nothing to suggest, is a message with the reasons', async () => {
  // Wicker is not at MegaMall, and the movie search for it has no recorded data, so no alternatives load.
  const page = await open({ slug: 'sm-megamall', date: '2026-11-17', movieId: 21580 });
  assert.equal(page.data.state, 'message');
  assert.equal(page.data.message, 'Not showing at SM MegaMall today');
  assert.deepEqual(page.data.lines.map((l) => l.text), ['Could not look at other cinemas']);
});

// ── names as the host assistant says them ───────────────

test('a cinema and movie by name', async () => {
  const page = await open({ theater: 'megamall', movie: 'godzilla', date: 'tomorrow' });
  assert.equal(page.data.title, 'Godzilla Minus Zero');
  assert.equal(page.data.header, 'Tomorrow · Wed Nov 18');
  assert.deepEqual(mallRows(page), ['SM MegaMall']);
});

test('a cinema name that fits several goes to the choose screen, carrying the movie', async () => {
  const page = await env.openPage('theater', { theater: 'robinsons', movie: 'godzilla' });
  await env.waitFor(() => env.navigations().length > 0);
  assert.match(env.navigations()[0], /^\/pages\/choose\/choose\?kind=theater&mode=pick&date=2026-11-17&slugs=robinsons-galleria-ortigas,[a-z0-9,-]+&movie=21542$/);
  assert.equal(page.data.state, 'loading');
});

test('an unsure movie name goes to the choose screen, carrying the cinema', async () => {
  await env.openPage('theater', { theater: 'the podium', movie: 'godzilla minus one' });
  await env.waitFor(() => env.navigations().length > 0);
  assert.equal(env.navigations()[0], '/pages/choose/choose?mode=confirm&date=2026-11-17&ids=21542&theater=the-podium');
});

test('unknown names are said, not guessed', async () => {
  let page = await open({ theater: 'zzzz qqqq' });
  assert.equal(page.data.state, 'message');
  assert.equal(page.data.message, "No theater matching 'zzzz qqqq'");
  page = await open({ theater: 'megamall', movie: 'zzzz qqqq' });
  assert.equal(page.data.message, "No movie matching 'zzzz qqqq'");
  page = await open({ slug: 'nowhere-mall' });
  assert.equal(page.data.message, 'Theater not found');
});

test('a cinema the service no longer has says so and drops the saved directory', async () => {
  const page = await open({ slug: 'fisher-mall', date: '2026-11-17' }); // listed, but no schedule recorded: a 404
  assert.equal(page.data.state, 'message');
  assert.equal(page.data.message, 'This theater is no longer listed');
  assert.equal(env.wx.getStorageSync('directory.v1'), null);
});

test('offline shows an error that retries on Enter', async () => {
  const warm = await open(MEGAMALL); // load the directory (and location) while online
  assert.equal(warm.data.state, 'list');
  env.offline = true;
  const page = await open({ slug: 'sm-megamall', date: '2026-11-21' }); // a day not fetched yet
  assert.equal(page.data.state, 'error');
  assert.match(page.data.message, /connection/i);
  env.offline = false;
  env.key(page, 'Enter');
  await env.waitFor(() => page.data.state === 'list', 'retry to succeed');
});

// ── voice ────────────────────────────────────────────────

test('"tomorrow" reloads the same cinema for that day', async () => {
  const page = await open(MEGAMALL);
  env.say(page, 'tomorrow');
  await env.waitFor(() => page.data.header === 'Tomorrow · Wed Nov 18' && page.data.state === 'list', 'tomorrow');
  assert.equal(page.data.title, 'SM MegaMall');
  assert.deepEqual(env.navigations(), []);
});

test('a movie name on a cinema screen means "at this cinema"', async () => {
  const page = await open(MEGAMALL);
  env.say(page, 'godzilla');
  await env.waitFor(() => page.data.title === 'Godzilla Minus Zero' && page.data.state === 'ready', 'godzilla at megamall');
  assert.deepEqual(mallRows(page), ['SM MegaMall']);
  assert.deepEqual(env.navigations(), []);
  // And "tomorrow" now means that movie at that cinema tomorrow.
  env.say(page, 'tomorrow');
  await env.waitFor(() => page.data.header === 'Tomorrow · Wed Nov 18' && page.data.state === 'ready', 'tomorrow');
  assert.equal(page.data.title, 'Godzilla Minus Zero');
});

test('naming another cinema switches to it in place', async () => {
  const page = await open(MEGAMALL);
  env.say(page, "what's showing at the podium");
  await env.waitFor(() => page.data.title === 'The Podium' && page.data.state === 'list', 'the podium');
  assert.deepEqual(env.navigations(), []);
});

test('"is godzilla showing at the podium" from a cinema screen', async () => {
  const page = await open(MEGAMALL);
  env.say(page, 'is godzilla showing at the podium');
  await env.waitFor(() => page.data.title === 'Godzilla Minus Zero' && page.data.state === 'ready', 'godzilla at the podium');
  assert.deepEqual(mallRows(page), ['The Podium']);
});

test('an ambiguous cinema asks which, an unsure movie asks first', async () => {
  const page = await open(MEGAMALL);
  env.say(page, 'is godzilla showing at robinsons');
  await env.waitFor(() => env.navigations().length > 0);
  assert.match(env.navigations()[0], /^\/pages\/choose\/choose\?kind=theater&mode=pick&date=2026-11-17&slugs=robinsons-galleria-ortigas,.*&movie=21542$/);
});

test('"nearest theaters", "what\'s showing" and diagnostics navigate', async () => {
  const page = await open(MEGAMALL);
  env.say(page, 'what are the nearest theaters');
  await env.waitFor(() => env.navigations().length === 1);
  assert.equal(env.navigations()[0], '/pages/theaters/theaters');
  env.say(page, "what's showing tomorrow at");
});

test('a choice made on the choose screen is picked up', async () => {
  const page = await open(MEGAMALL);
  env.wx.setStorageSync('handoff', { type: 'theater', slug: 'the-podium', movieId: 21542, date: '2026-11-17', ts: env.clock });
  page.onShow();
  await env.waitFor(() => page.data.title === 'Godzilla Minus Zero' && page.data.state === 'ready', 'handoff to load');
  assert.deepEqual(mallRows(page), ['The Podium']);
});

// ── the host assistant naming things its own way ────────

test('the host assistant may call the cinema and movie by other names', async () => {
  const page = await open({ cinema: 'sm megamall', title: 'godzilla' });
  assert.equal(page.data.title, 'Godzilla Minus Zero');
  assert.deepEqual(mallRows(page), ['SM MegaMall']);
});

test('the host assistant may nest what it sends', async () => {
  const page = await open({ data: { theater: 'galleria' } });
  assert.equal(page.data.title, 'Robinsons Galleria Ortigas');
});

test('the phrasings from real use: Megamall and Galleria, with the movie', async () => {
  let page = await open({ theater: 'SM Megamall', movie: 'Godzilla' });
  assert.equal(page.data.state, 'ready');
  assert.deepEqual(mallRows(page), ['SM MegaMall']);
  page = await open({ theater: 'Galleria', movie: 'Godzilla' });
  assert.equal(page.data.state, 'ready');
  assert.equal(page.data.header, 'Not at Robinsons Galleria Ortigas · today');
});

test('with no cinema at all it says what to say, rather than "not found"', async () => {
  const page = await open({});
  assert.equal(page.data.state, 'message');
  assert.equal(page.data.message, 'Say a theater name');
});

test('a movie with no cinema is a plain movie search', async () => {
  const page = await env.openPage('theater', { movie: 'godzilla', date: 'tomorrow' });
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/results/results?name=godzilla&date=2026-11-18']);
  assert.equal(page.data.message, 'Which theater?');
});

test('"null" for both is "no cinema", not a search for null', async () => {
  const page = await open({ theater: 'null', movie: 'null' });
  assert.equal(page.data.message, 'Say a theater name');
});
