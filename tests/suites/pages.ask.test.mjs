import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from '../pageHarness.mjs';

let env;
beforeEach(() => { env = createEnv(); });
afterEach(() => env.close());

const open = async (query) => {
  const page = await env.openPage('ask', query);
  await env.waitFor(() => page.data.state !== 'loading' || env.navigations().length + env.redirections().length > 0, 'ask page to decide');
  return page;
};

test('a clear request is sent straight to the right screen', async () => {
  await open({ request: 'is godzilla showing at sm megamall today' });
  assert.deepEqual(env.navigations(), ['/pages/theater/theater?slug=sm-megamall&date=2026-11-17&movieId=21542']);
});

test('what the user said, however it is worded, finds its screen', async () => {
  for (const [said, url] of [
    ['What movies are showing in SM megamall', '/pages/theater/theater?slug=sm-megamall&date=2026-11-17'],
    ['hey rokid any chance you could tell me where street fighter is playing', '/pages/results/results?movie=21078&date=2026-11-17'],
    ['anong palabas ngayon', '/pages/movies/movies?date=2026-11-17'],
    ['cinemas close to me', '/pages/theaters/theaters'],
  ]) {
    env.wx.reset();
    await open({ request: said });
    assert.equal(env.navigations()[0], url, said);
  }
});

test('when the runtime can replace a screen, it does', async () => {
  env.wx.makeRedirect();
  await open({ request: 'nearest theaters' });
  assert.deepEqual(env.redirections(), ['/pages/theaters/theaters']);
  assert.deepEqual(env.navigations(), []);
});

test('when it cannot, it stacks and then steps aside when you come back', async () => {
  const page = await open({ request: 'nearest theaters' });
  assert.deepEqual(env.navigations(), ['/pages/theaters/theaters']);
  assert.equal(env.backs(), 0);
  page.onShow(); // back from the screen it sent you to
  assert.equal(env.backs(), 1);
  page.onShow();
  assert.equal(env.backs(), 1, 'only once');
});

test('what it understood is shown while it goes', async () => {
  const page = await env.openPage('ask', { request: 'is godzilla showing at the podium' });
  await env.waitFor(() => env.navigations().length > 0, 'a route');
  assert.equal(page.data.heard, 'Godzilla Minus Zero at The Podium · today');
});

test('an unclear request says so, offers a way on, and is remembered', async () => {
  const page = await open({ request: 'zzzz qqqq' });
  assert.equal(page.data.state, 'unsure');
  assert.equal(page.data.message, "No movie matching 'zzzz qqqq'");
  assert.deepEqual(page.data.options.map((o) => o.label), ["What's showing today", 'Nearest theaters']);
  assert.deepEqual(env.navigations(), []);
  assert.equal(env.wx.getStorageSync('unclear.v1')[0].text, 'zzzz qqqq');
});

test('a way on, chosen, opens; coming back shows the options again instead of leaving', async () => {
  const page = await open({ request: 'zzzz qqqq' });
  env.swipe(page, 'down');
  assert.equal(page.data.selectedIdx, 1);
  env.key(page, 'Enter');
  assert.deepEqual(env.navigations(), ['/pages/theaters/theaters']);
  page.onShow();
  assert.equal(env.backs(), 0);
  assert.equal(page.data.state, 'unsure');
});

test('tapping an option opens it', async () => {
  const page = await open({ request: 'zzzz qqqq' });
  page.onTapRow({ currentTarget: { dataset: { index: 0 } } });
  assert.deepEqual(env.navigations(), ['/pages/movies/movies?date=2026-11-17']);
});

test('no request at all asks for one, without logging anything', async () => {
  const page = await open({});
  assert.equal(page.data.state, 'unsure');
  assert.equal(page.data.message, 'Say a movie, a cinema or a day');
  assert.equal(env.wx.getStorageSync('unclear.v1'), undefined);
  const nulled = await open({ request: 'null' });
  assert.equal(nulled.data.message, 'Say a movie, a cinema or a day');
});

test('separate fields from the assistant are put back together', async () => {
  await open({ movie: 'Godzilla', theater: 'SM Megamall', date: 'tomorrow' });
  assert.deepEqual(env.navigations(), ['/pages/theater/theater?slug=sm-megamall&date=2026-11-18&movieId=21542']);
});

test('saying it again on this screen works', async () => {
  const page = await open({ request: 'zzzz qqqq' });
  env.say(page, "what's showing tomorrow");
  await env.waitFor(() => env.navigations().length > 0, 'a route');
  assert.deepEqual(env.navigations(), ['/pages/movies/movies?date=2026-11-18']);
});

test('the movie and cinema lists failing shows an error that retries on Enter', async () => {
  env.offline = true;
  const page = await env.openPage('ask', { request: 'is godzilla showing at sm megamall' });
  await env.waitFor(() => page.data.state === 'error', 'an error');
  assert.match(page.data.message, /connection/i);
  env.offline = false;
  env.key(page, 'Enter');
  await env.waitFor(() => env.navigations().length > 0, 'the retry to route');
  assert.equal(env.navigations()[0], '/pages/theater/theater?slug=sm-megamall&date=2026-11-17&movieId=21542');
});

test('a late answer never overrides a newer request', async () => {
  env.delay = (p) => (p.includes('now-showing') ? 120 : 0);
  const page = await env.openPage('ask', { request: 'nearest theaters' });
  page.run(['zzzz qqqq']); // asked again before the first finished
  await env.waitFor(() => page.data.state === 'unsure', 'the second request to settle');
  await env.sleep(250);
  assert.equal(page.data.state, 'unsure');
  assert.deepEqual(env.navigations(), []);
});
