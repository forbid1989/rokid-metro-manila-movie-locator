import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from '../pageHarness.mjs';
import { at } from '../helpers.mjs';

let env;
beforeEach(() => { env = createEnv(); });
afterEach(() => env.close());

const ready = (page) => env.waitFor(() => page.data.state !== 'loading', 'movies page to load');

test("opens on today's movies near the device", async () => {
  const page = await env.openPage('movies');
  await ready(page);
  assert.equal(page.data.state, 'ready');
  assert.equal(page.data.header, 'Today · Tue Nov 17');
  assert.equal(page.data.location, 'Near you');
  assert.equal(page.data.rows[0].title, 'Remember'); // shown at all five nearest malls
  assert.ok(page.data.rows.length >= 10);
  assert.equal(page.data.selectedIdx, 0);
});

test('with no location the default is used and labelled', async () => {
  env.geo = { error: 1 }; // permission denied
  const page = await env.openPage('movies');
  await ready(page);
  assert.equal(page.data.state, 'ready');
  assert.equal(page.data.location, 'Near Ortigas (default)');
});

test('a position outside Metro Manila (the simulator default 0,0) falls back to the default', async () => {
  env.geo = { latitude: 0, longitude: 0, accuracy: 1 };
  const page = await env.openPage('movies');
  await ready(page);
  assert.equal(page.data.location, 'Near Ortigas (default)');
  // ... and the search really was made from the default point.
  assert.ok(env.calls.some((p) => p.includes('latitude=14.5989')));
});

test('late at night there is nothing left to show', async () => {
  env.clock = at('2026-11-17', 23, 0);
  const page = await env.openPage('movies');
  await ready(page);
  assert.equal(page.data.state, 'empty');
  assert.equal(page.data.message, 'No more showings today');
});

test('a blocked service shows the 403, and Enter retries', async () => {
  env.forbidden = true;
  const page = await env.openPage('movies');
  await ready(page);
  assert.equal(page.data.state, 'error');
  assert.match(page.data.message, /403/);

  env.forbidden = false;
  env.key(page, 'Enter');
  await env.waitFor(() => page.data.state === 'ready', 'retry to succeed');
  assert.equal(page.data.state, 'ready');
});

test('offline shows a connection message', async () => {
  env.offline = true;
  const page = await env.openPage('movies');
  await ready(page);
  assert.equal(page.data.state, 'error');
  assert.match(page.data.message, /connection/i);
});

test('swipe moves the selection and Enter opens that movie', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  env.key(page, 'ArrowDown');
  assert.equal(page.data.selectedIdx, 1);
  env.key(page, 'ArrowUp');
  assert.equal(page.data.selectedIdx, 0);
  env.key(page, 'ArrowUp'); // already at the top
  assert.equal(page.data.selectedIdx, 0);

  const first = page.data.rows[0];
  env.key(page, 'Enter');
  await env.waitFor(() => env.navigations().length > 0, 'navigation');
  assert.deepEqual(env.navigations(), ['/pages/results/results?movie=' + first.movieId + '&date=2026-11-17']);
});

const visibleIdx = (page) => page.data.visible.map((r) => r.i);

test('the highlight moves down the visible rows without scrolling the list', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  const total = page.data.rows.length;
  assert.ok(total > 8, 'needs more rows than fit');
  assert.deepEqual(visibleIdx(page), [0, 1, 2, 3, 4]);
  assert.equal(page.data.above, 0);
  assert.equal(page.data.below, total - 5);
  assert.equal(page.data.position, '1/' + total);

  // Rows 1..4: the highlight travels, the list stays put.
  for (let want = 1; want <= 4; want++) {
    env.swipe(page, 'down');
    assert.equal(page.data.selectedIdx, want);
    assert.deepEqual(visibleIdx(page), [0, 1, 2, 3, 4], 'list must not move while the highlight is inside it');
  }
});

test('at the bottom edge the list slides by one row per swipe, highlight on the last row', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  for (let i = 0; i < 4; i++) env.swipe(page, 'down'); // highlight on the 5th (last visible) row
  env.swipe(page, 'down');                              // 6th: now the list has to move
  assert.equal(page.data.selectedIdx, 5);
  assert.deepEqual(visibleIdx(page), [1, 2, 3, 4, 5]);
  assert.equal(page.data.above, 1);
  env.swipe(page, 'down');
  assert.deepEqual(visibleIdx(page), [2, 3, 4, 5, 6]);
  assert.equal(page.data.visible[page.data.visible.length - 1].i, page.data.selectedIdx);
});

test('swiping back up moves the highlight first; the list only moves at the top edge', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  for (let i = 0; i < 7; i++) env.swipe(page, 'down'); // selected 7, window [3..7]
  assert.deepEqual(visibleIdx(page), [3, 4, 5, 6, 7]);
  for (let want = 6; want >= 3; want--) {
    env.swipe(page, 'up');
    assert.equal(page.data.selectedIdx, want);
    assert.deepEqual(visibleIdx(page), [3, 4, 5, 6, 7], 'list stays while the highlight is inside it');
  }
  env.swipe(page, 'up'); // past the top edge
  assert.equal(page.data.selectedIdx, 2);
  assert.deepEqual(visibleIdx(page), [2, 3, 4, 5, 6]);
  assert.equal(page.data.visible[0].i, page.data.selectedIdx);
});

test('the last movie can be reached and the window ends flush with the list', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  const total = page.data.rows.length;
  for (let i = 0; i < total + 3; i++) env.swipe(page, 'down'); // more than there are
  assert.equal(page.data.selectedIdx, total - 1);
  assert.deepEqual(visibleIdx(page), [total - 5, total - 4, total - 3, total - 2, total - 1]);
  assert.equal(page.data.below, 0);
  assert.equal(page.data.position, total + '/' + total);
});

test('keys during the opening touch are ignored', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  page.onShow(); // re-arm, as when returning to the page
  page.onKeyUp({ code: 'Enter' });
  await env.sleep(80);
  assert.deepEqual(env.navigations(), []);
});

test('tapping a row selects and opens it', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  const target = page.data.rows[2];
  page.onTapRow({ currentTarget: { dataset: { index: 2 } } });
  await env.waitFor(() => env.navigations().length > 0);
  assert.equal(page.data.selectedIdx, 2);
  assert.match(env.navigations()[0], new RegExp('movie=' + target.movieId));
});

test('saying a movie and a day opens its results for that day', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  assert.equal(page.data.voiceListening, false);
  env.say(page, 'where is godzilla showing tomorrow');
  await env.waitFor(() => env.navigations().length > 0, 'navigation');
  assert.deepEqual(env.navigations(), ['/pages/results/results?movie=21542&date=2026-11-18']);
  assert.equal(page.data.voiceListening, false);
});

test('listening shows the banner until the result arrives', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  page.onVoiceWakeup({ preventDefault() {} });
  assert.equal(page.data.voiceListening, true);
});

test('a near-miss title goes to the confirm screen', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  env.say(page, 'godzilla minus one');
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/choose/choose?mode=confirm&date=2026-11-17&ids=21542']);
});

test('an unknown movie is a toast, and the list stays', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  env.say(page, 'where is zzzz qqqq showing');
  await env.waitFor(() => page.data.toastVisible, 'toast');
  assert.match(page.data.toastText, /No movie matching 'zzzz qqqq'/);
  assert.equal(page.data.state, 'ready');
  assert.deepEqual(env.navigations(), []);
});

test('"what\'s showing tomorrow" reloads the list for that day', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  env.say(page, "what's showing tomorrow");
  await env.waitFor(() => page.data.header === 'Tomorrow · Wed Nov 18', 'header for tomorrow');
  await ready(page);
  assert.equal(page.data.header, 'Tomorrow · Wed Nov 18');
});

test('a stale load never overwrites a newer one', async () => {
  // Today's schedules are slow, so the older request finishes after the newer one.
  env.delay = (p) => (p.includes('date=2026-11-17') ? 60 : 0);
  const page = await env.openPage('movies');
  page.load('2026-11-25'); // a week out: no recorded schedules, so it ends in an error
  await env.waitFor(() => page.data.state === 'error', 'the later day to fail');
  await env.sleep(400); // let today's slow load finish too (it now checks every mall in range)
  assert.equal(page.data.header, 'Wed Nov 25');
  assert.equal(page.data.state, 'error', "today's rows must not replace the newer result");
  assert.deepEqual(page.data.rows, []);
});

test('saying diagnostics opens the diagnostics page', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  env.say(page, 'open diagnostics');
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/diagnostics/diagnostics']);
});

test('a choice made on the choose page is picked up and opens the results', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  env.wx.setStorageSync('handoff', { type: 'search', movieId: 21542, date: '2026-11-18', ts: env.clock });
  page.onShow();
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/results/results?movie=21542&date=2026-11-18']);
  // It is consumed: showing again does not navigate twice.
  page.onShow();
  await env.sleep(80);
  assert.equal(env.navigations().length, 1);
});

test('a list request left by the results page reloads the list for that day', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  env.wx.setStorageSync('handoff', { type: 'list', date: '2026-11-19', ts: env.clock });
  page.onShow();
  await env.waitFor(() => page.data.header === 'Thu Nov 19', 'header');
});

test('leaving the page while it loads stops it touching its data', async () => {
  const page = await env.openPage('movies'); // the first load is still in flight
  let writes = 0;
  const original = page.setData;
  page.setData = function (patch) { writes++; original.call(page, patch); };
  page.onUnload();
  await env.sleep(80); // long enough for the whole load to have finished
  assert.equal(writes, 0);
  assert.ok(env.calls.length > 0, 'the load did run');
});

test('opened with a date by the host assistant (spoken or ISO)', async () => {
  let page = await env.openPage('movies', { date: 'tomorrow' });
  assert.equal(page.data.header, 'Tomorrow · Wed Nov 18');
  await ready(page).catch(() => {});
  env.close();
  env = createEnv();
  page = await env.openPage('movies', { date: '2026-11-17' });
  await ready(page);
  assert.equal(page.data.header, 'Today · Tue Nov 17');
  env.close();
  env = createEnv();
  page = await env.openPage('movies', { date: 'gibberish' }); // unreadable: falls back to today
  await ready(page);
  assert.equal(page.data.header, 'Today · Tue Nov 17');
});

test('asking for the nearest theaters opens the theaters page', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  env.say(page, 'what are the nearest theaters to me');
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/theaters/theaters']);
});

// ── cinema commands ─────────────────────────────────────

test('naming a cinema and a movie opens that cinema for the movie', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  env.say(page, 'is godzilla showing at the podium today');
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/theater/theater?slug=the-podium&date=2026-11-17&movieId=21542']);
});

test('naming a cinema alone opens what is showing there, on the day said', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  env.say(page, "what's showing at sm megamall tomorrow");
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/theater/theater?slug=sm-megamall&date=2026-11-18']);
});

test('a cinema name that fits several asks which', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  env.say(page, "what's showing at robinsons");
  await env.waitFor(() => env.navigations().length > 0);
  assert.match(env.navigations()[0], /^\/pages\/choose\/choose\?kind=theater&mode=pick&date=2026-11-17&slugs=robinsons-galleria-ortigas,/);
});

test('a cinema chosen on the choose screen opens', async () => {
  const page = await env.openPage('movies');
  await ready(page);
  env.wx.setStorageSync('handoff', { type: 'theater', slug: 'the-podium', movieId: 0, date: '2026-11-17', ts: env.clock });
  page.onShow();
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/theater/theater?slug=the-podium&date=2026-11-17']);
});

// ── the host assistant opening this screen ──────────────

test('a cinema named here goes to that cinema ("what movies are showing at SM Megamall")', async () => {
  await env.openPage('movies', { theater: 'SM Megamall' });
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/theater/theater?theater=SM%20Megamall&date=2026-11-17']);
  assert.ok(!env.calls.some((p) => p.includes('/theater/')), 'the movie list was not fetched first');
});

test('"null" for the cinema or the day is ignored', async () => {
  const page = await env.openPage('movies', { theater: 'null', date: 'null' });
  await ready(page);
  assert.equal(page.data.state, 'ready');
  assert.equal(page.data.header, 'Today · Tue Nov 17');
  assert.deepEqual(env.navigations(), []);
});
