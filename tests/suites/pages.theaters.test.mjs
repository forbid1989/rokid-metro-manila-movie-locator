import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from '../pageHarness.mjs';

let env;
beforeEach(() => { env = createEnv(); });
afterEach(() => env.close());

const open = async () => {
  const page = await env.openPage('theaters');
  await env.waitFor(() => page.data.state !== 'loading', 'theaters page to load');
  return page;
};

test('opens on the 15 nearest cinemas, nearest first, with distance and city', async () => {
  const page = await open();
  assert.equal(page.data.state, 'ready');
  assert.equal(page.data.location, 'Near you');
  assert.equal(page.data.rows.length, 15);
  assert.deepEqual(page.data.rows[0], {
    id: 'trobinsons-galleria-ortigas', slug: 'robinsons-galleria-ortigas',
    title: 'Robinsons Galleria Ortigas', city: 'Quezon', meta: '1.2 km',
  });
  const km = page.data.rows.map((r) => parseFloat(r.meta));
  for (let i = 1; i < km.length; i++) assert.ok(km[i - 1] <= km[i]);
  assert.equal(page.data.position, '1/15');
  assert.equal(page.data.selectedIdx, 0);
});

test('only five rows are on screen; the window slides at the edge', async () => {
  const page = await open();
  assert.equal(page.data.visible.length, 5);
  assert.equal(page.data.below, 10);
  for (let i = 0; i < 4; i++) env.swipe(page, 'down');
  assert.equal(page.data.selectedIdx, 4);
  assert.equal(page.data.visible[0].i, 0, 'the highlight moved; the list did not');
  env.swipe(page, 'down');
  assert.equal(page.data.selectedIdx, 5);
  assert.equal(page.data.visible[0].i, 1, 'now the list slides');
  assert.equal(page.data.position, '6/15');
});

test('the directory is fetched once and then kept', async () => {
  await open();
  const directoryCalls = () => env.calls.filter((p) => p.includes('latitude=14.5995')).length;
  assert.equal(directoryCalls(), 7);
  await open();
  assert.equal(directoryCalls(), 7, 'a second visit does not refetch');
  assert.ok(env.wx.getStorageSync('directory.v1'), 'and it is saved for the next session');
});

test('Enter or a tap opens that cinema for today', async () => {
  const page = await open();
  env.swipe(page, 'down');
  env.key(page, 'Enter');
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/theater/theater?slug=opus-mall&date=2026-11-17']);
});

test('tapping a row selects and opens it', async () => {
  const page = await open();
  page.onTapRow({ currentTarget: { dataset: { index: 2 } } });
  await env.waitFor(() => env.navigations().length > 0);
  assert.equal(env.navigations()[0], '/pages/theater/theater?slug=the-podium&date=2026-11-17');
  assert.equal(page.data.selectedIdx, 2);
});

test('with no location the default is used and labelled', async () => {
  env.geo = { error: 1 };
  const page = await open();
  assert.equal(page.data.location, 'Near Ortigas (default)');
  assert.equal(page.data.rows[0].slug, 'robinsons-galleria-ortigas');
});

test('offline shows an error that retries on Enter', async () => {
  env.offline = true;
  const page = await open();
  assert.equal(page.data.state, 'error');
  assert.match(page.data.message, /connection/i);
  env.offline = false;
  env.key(page, 'Enter');
  await env.waitFor(() => page.data.state === 'ready', 'retry to succeed');
  assert.equal(page.data.rows.length, 15);
});

// ── voice ────────────────────────────────────────────────

test('saying a movie opens its results', async () => {
  const page = await open();
  env.say(page, 'where is godzilla showing tomorrow');
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/results/results?movie=21542&date=2026-11-18']);
});

test("saying what's showing opens the movie list for that day", async () => {
  const page = await open();
  env.say(page, "what's showing tomorrow");
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/movies/movies?date=2026-11-18']);
});

test('asking for the nearest theaters again reloads the list', async () => {
  const page = await open();
  env.swipe(page, 'down');
  env.say(page, 'what are the nearest theaters');
  await env.waitFor(() => page.data.state === 'ready' && page.data.selectedIdx === 0, 'the list to reload');
  assert.deepEqual(env.navigations(), []);
});

test('an unsure movie name goes to the choose screen; the choice comes back through onShow', async () => {
  const page = await open();
  env.say(page, 'godzilla minus one');
  await env.waitFor(() => env.navigations().length > 0);
  assert.match(env.navigations()[0], /^\/pages\/choose\/choose\?mode=confirm&date=2026-11-17&ids=21542$/);
  env.wx.setStorageSync('handoff', { type: 'search', movieId: 21542, date: '2026-11-17', ts: env.clock });
  page.onShow();
  await env.waitFor(() => env.navigations().length > 1);
  assert.equal(env.navigations()[1], '/pages/results/results?movie=21542&date=2026-11-17');
});

test('diagnostics and nonsense', async () => {
  const page = await open();
  env.say(page, 'open diagnostics');
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/diagnostics/diagnostics']);
  env.say(page, 'zzzz qqqq');
  await env.waitFor(() => page.data.toastVisible, 'a toast');
});

test('naming a cinema from the theaters list opens it', async () => {
  const page = await open();
  env.say(page, "what's playing at the podium tomorrow");
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/theater/theater?slug=the-podium&date=2026-11-18']);
});

test('a cinema chosen on the choose screen opens from the theaters list', async () => {
  const page = await open();
  env.wx.setStorageSync('handoff', { type: 'theater', slug: 'opus-mall', movieId: 0, date: '2026-11-17', ts: env.clock });
  page.onShow();
  await env.waitFor(() => env.navigations().length > 0);
  assert.deepEqual(env.navigations(), ['/pages/theater/theater?slug=opus-mall&date=2026-11-17']);
});
