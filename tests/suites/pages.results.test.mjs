import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from '../pageHarness.mjs';
import { at } from '../helpers.mjs';

let env;
beforeEach(() => { env = createEnv(); });
afterEach(() => env.close());

const GODZILLA = { movie: '21542', date: '2026-11-17' };
const open = async (query) => {
  const page = await env.openPage('results', query || GODZILLA);
  await env.waitFor(() => page.data.state !== 'loading', 'results to load');
  return page;
};

test('shows where Godzilla is on, nearest first, with the showtimes', async () => {
  const page = await open();
  assert.equal(page.data.state, 'ready');
  assert.equal(page.data.title, 'Godzilla Minus Zero');
  assert.equal(page.data.meta, 'PG · 2h 14m');
  assert.equal(page.data.header, 'Today · Tue Nov 17');
  assert.equal(page.data.location, 'Near you');
  const rows = page.data.rows;
  assert.deepEqual({ text: rows[0].text, right: rows[0].right }, { text: 'The Podium', right: '1.7 km' });
  assert.deepEqual({ text: rows[1].text, label: rows[1].label }, { text: '12:00 PM · 8:00 PM', label: "Director's" });
  assert.equal(rows.filter((r) => r.kind === 'mall').length, 5);
  assert.equal(page.data.note, '');
});

test('hides the shows that have already started', async () => {
  env.clock = at('2026-11-17', 16, 0);
  const page = await open();
  assert.equal(page.data.rows[1].text, '8:00 PM');
});

test('a day with no showings says so and offers the days that have them', async () => {
  const page = await open({ movie: '21542', date: '2026-11-25' });
  assert.equal(page.data.state, 'message');
  assert.equal(page.data.message, 'Not showing on Wed Nov 25');
  assert.deepEqual(page.data.lines.map((l) => l.text), ['Showing on: Today, Tomorrow, Thu Nov 19']);
  assert.equal(page.data.title, 'Godzilla Minus Zero');
});

test('nothing left today', async () => {
  env.clock = at('2026-11-17', 23, 0);
  const page = await open();
  assert.equal(page.data.state, 'message');
  assert.equal(page.data.message, 'No more showings today');
});

test('a movie playing only further out shows just the malls inside the 20 km cap', async () => {
  const page = await open({ movie: '21543', date: '2026-11-17' }); // He's Dating a Boldstar
  assert.equal(page.data.state, 'ready');
  assert.deepEqual(page.data.rows.map((r) => [r.kind, r.text, r.right]), [
    ['mall', 'Sta. Lucia East Grand Mall', '4.1 km'],
    ['times', '2:00 PM · 7:00 PM', ''],
    ['mall', 'Robinsons Place Manila', '9.3 km'],
    ['times', '1:40 PM · 6:35 PM', ''],
  ]);
});

test('an unknown movie id', async () => {
  const page = await open({ movie: '999999', date: '2026-11-17' });
  assert.equal(page.data.state, 'message');
  assert.equal(page.data.message, 'Movie not found');
});

test('a blocked or offline service is an error with a retry', async () => {
  env.forbidden = true;
  let page = await open();
  assert.equal(page.data.state, 'error');
  assert.match(page.data.message, /403/);
  env.forbidden = false;
  env.key(page, 'Enter');
  await env.waitFor(() => page.data.state === 'ready');
  env.close();

  env = createEnv();
  env.offline = true;
  page = await open();
  assert.equal(page.data.state, 'error');
  assert.match(page.data.message, /connection/i);
});

const visibleMalls = (page) => [...new Set(page.data.visible.map((r) => r.mallIdx))];

test('swipe moves the highlight between malls; the list stays put until the highlight reaches an edge', async () => {
  const page = await open();
  assert.equal(page.data.selectedMall, 0);
  assert.equal(page.data.position, '1/5');
  // Five malls do not all fit: four are shown to start with.
  assert.deepEqual(visibleMalls(page), [0, 1, 2, 3]);
  assert.equal(page.data.below, 1);

  env.swipe(page, 'down');
  env.swipe(page, 'down');
  env.swipe(page, 'down'); // highlight on the 4th mall, the last one visible
  assert.equal(page.data.selectedMall, 3);
  assert.deepEqual(visibleMalls(page), [0, 1, 2, 3], 'no movement yet');

  env.swipe(page, 'down'); // 5th: now the window has to slide
  assert.equal(page.data.selectedMall, 4);
  assert.deepEqual(visibleMalls(page), [1, 2, 3, 4]);
  assert.equal(page.data.above, 1);
  assert.equal(page.data.below, 0);
  assert.equal(page.data.position, '5/5');

  // Back up: the highlight moves, the window does not, until the top edge.
  env.swipe(page, 'up');
  env.swipe(page, 'up');
  env.swipe(page, 'up'); // selected mall 1, the first visible
  assert.equal(page.data.selectedMall, 1);
  assert.deepEqual(visibleMalls(page), [1, 2, 3, 4]);
  env.swipe(page, 'up'); // past the top edge
  assert.equal(page.data.selectedMall, 0);
  assert.deepEqual(visibleMalls(page), [0, 1, 2, 3]);

  env.swipe(page, 'up'); // nothing above the first
  assert.equal(page.data.selectedMall, 0);
});

test('a mall is never shown cut in half: its name and all its time rows go together', async () => {
  const page = await open();
  for (const mall of visibleMalls(page)) {
    const rows = page.data.visible.filter((r) => r.mallIdx === mall);
    const full = page.data.rows.filter((r) => r.mallIdx === mall);
    assert.deepEqual(rows.map((r) => r.id), full.map((r) => r.id));
    assert.equal(rows[0].kind, 'mall');
  }
});

test('saying "tomorrow" shows the same movie tomorrow, in place', async () => {
  const page = await open();
  env.say(page, 'tomorrow');
  await env.waitFor(() => page.data.header === 'Tomorrow · Wed Nov 18', 'header');
  await env.waitFor(() => page.data.state !== 'loading');
  assert.equal(page.data.title, 'Godzilla Minus Zero');
  assert.deepEqual(env.navigations(), [], 'no new screen was stacked');
  // Only SM MegaMall has a recorded 11-18 schedule: shown, with a note about the rest.
  assert.equal(page.data.state, 'ready');
  assert.equal(page.data.rows[0].text, 'SM MegaMall');
  assert.equal(page.data.note, 'Some cinemas could not be checked');
});

test('saying another movie replaces this one in place', async () => {
  const page = await open();
  env.say(page, 'where is street fighter showing');
  await env.waitFor(() => page.data.title === 'Street Fighter', 'title');
  assert.deepEqual(env.navigations(), []);
});

test('"what\'s showing" goes back to the list and asks it to reload for that day', async () => {
  const page = await open();
  env.say(page, "what's showing tomorrow");
  await env.waitFor(() => env.wx.calls.some((c) => c.fn === 'navigateBack'), 'navigateBack');
  assert.deepEqual(env.wx.getStorageSync('handoff'), { type: 'list', date: '2026-11-18', ts: env.clock });
});

test('a near-miss title opens the confirm screen', async () => {
  const page = await open();
  env.say(page, 'godzilla minus one');
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/choose/choose?mode=confirm&date=2026-11-17&ids=21542']);
});

test('a choice made on the choose page loads in place', async () => {
  const page = await open();
  env.wx.setStorageSync('handoff', { type: 'search', movieId: 21543, date: '2026-11-17', ts: env.clock });
  page.onShow();
  await env.waitFor(() => page.data.title === "He's Dating a Boldstar", 'title');
});

test('a day that has passed is refused without leaving the screen', async () => {
  const page = await open();
  env.say(page, 'yesterday');
  await env.waitFor(() => page.data.toastVisible);
  assert.match(page.data.toastText, /passed/);
  assert.equal(page.data.state, 'ready');
});

test('a stale load never overwrites a newer one', async () => {
  env.delay = (p) => (p.includes('date=2026-11-17') ? 60 : 0); // today is slow
  const page = await env.openPage('results', GODZILLA);
  page.load(21542, '2026-11-18');
  await env.waitFor(() => page.data.state === 'ready', 'tomorrow to load');
  await env.sleep(200); // let today's slow load finish too
  assert.equal(page.data.header, 'Tomorrow · Wed Nov 18');
  assert.equal(page.data.rows[0].text, 'SM MegaMall', "today's rows (The Podium first) must not replace tomorrow's");
});

test('leaving the page while it loads stops it touching its data', async () => {
  const page = await env.openPage('results', GODZILLA);
  let writes = 0;
  const original = page.setData;
  page.setData = function (patch) { writes++; original.call(page, patch); };
  page.onUnload();
  await env.sleep(80);
  assert.equal(writes, 0);
});

// ── opened by the host assistant with a movie name ───────

const openByName = async (query) => {
  const page = await env.openPage('results', query);
  await env.waitFor(() => page.data.state !== 'loading' || env.navigations().length > 0, 'results to load');
  return page;
};

test('opened with a spoken movie name and no date: today', async () => {
  const page = await openByName({ name: 'godzilla' });
  await env.waitFor(() => page.data.state === 'ready');
  assert.equal(page.data.title, 'Godzilla Minus Zero');
  assert.equal(page.data.header, 'Today · Tue Nov 17');
  assert.equal(page.data.rows[0].text, 'The Podium');
});

test('opened with a name and a spoken or ISO date', async () => {
  let page = await openByName({ name: 'godzilla minus zero', date: 'tomorrow' });
  await env.waitFor(() => page.data.header === 'Tomorrow · Wed Nov 18');
  env.close();
  env = createEnv();
  page = await openByName({ name: 'godzilla', date: '2026-11-25' });
  await env.waitFor(() => page.data.state === 'message');
  assert.equal(page.data.message, 'Not showing on Wed Nov 25');
});

test('a near-miss name goes to the confirm screen, and the answer comes back here', async () => {
  const page = await openByName({ name: 'godzilla minus one', date: '2026-11-17' });
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/choose/choose?mode=confirm&date=2026-11-17&ids=21542']);
  env.wx.setStorageSync('handoff', { type: 'search', movieId: 21542, date: '2026-11-17', ts: env.clock });
  page.onShow();
  await env.waitFor(() => page.data.state === 'ready');
  assert.equal(page.data.title, 'Godzilla Minus Zero');
});

test('an unknown name is said so, not a blank screen', async () => {
  const page = await openByName({ name: 'zzzz qqqq' });
  assert.equal(page.data.state, 'message');
  assert.match(page.data.message, /No movie matching 'zzzz qqqq'/);
});

test('opened with nothing prompts for a movie name', async () => {
  const page = await env.openPage('results', {});
  assert.equal(page.data.state, 'message');
  assert.equal(page.data.message, 'Say a movie name');
});

test('asking for the nearest theaters opens the theaters page', async () => {
  const page = await open();
  env.say(page, 'cinemas near me');
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/theaters/theaters']);
});

test('"is it at <cinema>" from a movie screen opens that cinema for that movie', async () => {
  const page = await open();
  env.say(page, 'is godzilla showing at sm megamall');
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/theater/theater?slug=sm-megamall&date=2026-11-17&movieId=21542']);
});

test('a cinema chosen on the choose screen opens from the results screen', async () => {
  const page = await open();
  env.wx.setStorageSync('handoff', { type: 'theater', slug: 'the-podium', movieId: 21542, date: '2026-11-17', ts: env.clock });
  page.onShow();
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/theater/theater?slug=the-podium&date=2026-11-17&movieId=21542']);
});

// ── the host assistant opening this screen for the wrong kind of question ──

test('a movie name of "null" (no movie named) is not a movie: the movie list opens instead', async () => {
  const page = await env.openPage('results', { name: 'null' });
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/movies/movies?date=2026-11-17']);
  assert.equal(page.data.message, 'Say a movie name');
  assert.ok(!/null/.test(page.data.message));
});

test('no parameters at all behaves the same', async () => {
  await env.openPage('results', {});
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/movies/movies?date=2026-11-17']);
});

test('a cinema named with no movie goes to that cinema', async () => {
  await env.openPage('results', { name: 'null', theater: 'SM Megamall' });
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/theater/theater?theater=SM%20Megamall&date=2026-11-17']);
});

test('a movie and a cinema go to that cinema for that movie, on the day said', async () => {
  await env.openPage('results', { name: 'Godzilla', theater: 'Galleria', date: 'tomorrow' });
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/theater/theater?theater=Galleria&movie=Godzilla&date=2026-11-18']);
});

test('a cinema\'s name given as the movie is recognised as a cinema', async () => {
  const page = await env.openPage('results', { name: 'SM Megamall' });
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/theater/theater?theater=SM%20Megamall&date=2026-11-17']);
  assert.notEqual(page.data.state, 'message', 'no "No movie matching" flash');
});

test('a name that is neither a movie nor a cinema is still said plainly', async () => {
  const page = await env.openPage('results', { name: 'zzzz qqqq' });
  await env.waitFor(() => page.data.state === 'message', 'a message');
  assert.equal(page.data.message, "No movie matching 'zzzz qqqq'");
  assert.deepEqual(env.navigations(), []);
});

test('our own screens still open by movie id', async () => {
  const page = await env.openPage('results', { movie: '21542', date: '2026-11-17' });
  await env.waitFor(() => page.data.state !== 'loading', 'results to load');
  assert.equal(page.data.title, 'Godzilla Minus Zero');
});
