import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from '../pageHarness.mjs';

let env;
beforeEach(() => { env = createEnv(); });
afterEach(() => env.close());

const open = async (query) => {
  const page = await env.openPage('choose', query);
  await env.waitFor(() => page.data.state !== 'loading', 'choose page to load');
  return page;
};

test('confirm mode asks "Did you mean…?" with the one candidate', async () => {
  const page = await open({ mode: 'confirm', ids: '21542', date: '2026-11-17' });
  assert.equal(page.data.title, 'Did you mean…?');
  assert.equal(page.data.hint, 'Tap yes · Double-tap cancel');
  assert.deepEqual(page.data.rows.map((r) => r.title), ['Godzilla Minus Zero']);
  assert.equal(page.data.rows[0].meta, '2026 · PG · 2h 14m', 'the year helps tell similar films apart');
});

test('Enter on the candidate leaves a note for the page underneath and goes back', async () => {
  const page = await open({ mode: 'confirm', ids: '21542', date: '2026-11-18' });
  env.key(page, 'Enter');
  assert.deepEqual(env.wx.getStorageSync('handoff'), { type: 'search', movieId: 21542, date: '2026-11-18', ts: env.clock });
  assert.ok(env.wx.calls.some((c) => c.fn === 'navigateBack'));
});

test('pick mode lists the candidates in the order given and lets you choose one', async () => {
  const page = await open({ mode: 'pick', ids: '21542,20719,21580', date: '2026-11-17' });
  assert.equal(page.data.title, 'Which movie?');
  assert.deepEqual(page.data.rows.map((r) => r.title), ['Godzilla Minus Zero', 'The Cat in the Hat', 'Wicker']);
  env.key(page, 'ArrowDown');
  assert.equal(page.data.selectedIdx, 1);
  env.key(page, 'Enter');
  assert.equal(env.wx.getStorageSync('handoff').movieId, 20719);
});

test('tapping a row chooses it', async () => {
  const page = await open({ mode: 'pick', ids: '21542,21580', date: '2026-11-17' });
  page.onTapRow({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(env.wx.getStorageSync('handoff').movieId, 21580);
});

test('ids that are no longer listed are skipped; none left is an error', async () => {
  let page = await open({ mode: 'pick', ids: '999999,21580', date: '2026-11-17' });
  assert.deepEqual(page.data.rows.map((r) => r.title), ['Wicker']);
  page = await open({ mode: 'pick', ids: '999999', date: '2026-11-17' });
  assert.equal(page.data.state, 'error');
});

test('nothing is chosen until the user acts (double-tap just goes back via the host)', async () => {
  const page = await open({ mode: 'confirm', ids: '21542', date: '2026-11-17' });
  page.onKeyUp({ code: 'Backspace' });
  assert.equal(env.wx.getStorageSync('handoff'), undefined);
  assert.deepEqual(env.wx.calls, []);
});

test('the catalog failing is shown, not a blank list', async () => {
  env.offline = true;
  const page = await open({ mode: 'pick', ids: '21542', date: '2026-11-17' });
  assert.equal(page.data.state, 'error');
  assert.match(page.data.message, /connection/i);
});

// ── choosing a cinema ───────────────────────────────────

test('which theater: the candidates in order with their distances', async () => {
  const page = await open({ kind: 'theater', mode: 'pick', date: '2026-11-17', slugs: 'sm-megamall,the-podium,robinsons-galleria-ortigas' });
  assert.equal(page.data.title, 'Which theater?');
  assert.deepEqual(page.data.rows.map((r) => r.title), ['SM MegaMall', 'The Podium', 'Robinsons Galleria Ortigas']);
  assert.ok(page.data.rows.every((r) => /^\d+\.\d km$/.test(r.meta)));
});

test('did you mean a theater: one candidate to confirm', async () => {
  const page = await open({ kind: 'theater', mode: 'confirm', date: '2026-11-17', slugs: 'sm-megamall' });
  assert.equal(page.data.title, 'Did you mean…?');
  assert.equal(page.data.hint, 'Tap yes · Double-tap cancel');
});

test('choosing a cinema leaves a note for the page underneath, with the movie to look for', async () => {
  const page = await open({ kind: 'theater', mode: 'pick', date: '2026-11-18', slugs: 'sm-megamall,the-podium', movie: '21542' });
  env.key(page, 'ArrowDown');
  env.key(page, 'Enter');
  assert.deepEqual(env.wx.getStorageSync('handoff'), { type: 'theater', slug: 'the-podium', movieId: 21542, date: '2026-11-18', ts: env.clock });
  assert.ok(env.wx.calls.some((c) => c.fn === 'navigateBack'));
});

test('choosing a cinema with no movie asked about', async () => {
  const page = await open({ kind: 'theater', mode: 'pick', date: '2026-11-17', slugs: 'sm-megamall' });
  env.key(page, 'Enter');
  assert.equal(env.wx.getStorageSync('handoff').movieId, 0);
});

test('choosing a movie when a cinema was asked about too goes on to that cinema', async () => {
  const page = await open({ mode: 'pick', ids: '21542,20719', date: '2026-11-17', theater: 'the-podium' });
  env.key(page, 'ArrowDown');
  env.key(page, 'Enter');
  assert.deepEqual(env.wx.getStorageSync('handoff'), { type: 'theater', slug: 'the-podium', movieId: 20719, date: '2026-11-17', ts: env.clock });
});

test('cinemas that are no longer listed are skipped; none left is an error', async () => {
  let page = await open({ kind: 'theater', mode: 'pick', date: '2026-11-17', slugs: 'gone-mall,the-podium' });
  assert.deepEqual(page.data.rows.map((r) => r.title), ['The Podium']);
  page = await open({ kind: 'theater', mode: 'pick', date: '2026-11-17', slugs: 'gone-mall' });
  assert.equal(page.data.state, 'error');
});
