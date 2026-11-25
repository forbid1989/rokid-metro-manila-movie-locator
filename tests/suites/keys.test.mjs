import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyGuard, KEY_TIMING } from '../../utils/keys.js';
import { createHandoff } from '../../utils/handoff.js';

const key = (code) => ({ code });

test('keys right after the page appears are ignored (the opening tap)', () => {
  const g = createKeyGuard();
  g.arm(1000);
  assert.equal(g.classify(key('Enter'), 1000 + KEY_TIMING.phantomMs - 1), null);
  assert.equal(g.classify(key('Enter'), 1000 + KEY_TIMING.phantomMs), 'enter');
});

test('Enter and Space are enter; arrows map to next/prev; other keys are left to the host', () => {
  const g = createKeyGuard({ phantomMs: 0, aliasMs: 0, repeatMs: 0, enterMs: 0 });
  g.arm(0);
  assert.equal(g.classify(key('Enter'), 10), 'enter');
  assert.equal(g.classify(key('Space'), 20), 'enter');
  assert.equal(g.classify(key('ArrowDown'), 30), 'next');
  assert.equal(g.classify(key('ArrowRight'), 40), 'next');
  assert.equal(g.classify(key('ArrowUp'), 50), 'prev');
  assert.equal(g.classify(key('ArrowLeft'), 60), 'prev');
  assert.equal(g.classify(key('Backspace'), 70), null);
  assert.equal(g.classify(key('Escape'), 80), null);
  assert.equal(g.classify(key('GlobalHook'), 90), null);
  assert.equal(g.classify({}, 100), null);
  assert.equal(g.classify(undefined, 110), null);
});

test('a repeated Enter inside the repeat window counts once', () => {
  const g = createKeyGuard({ phantomMs: 0 });
  g.arm(0);
  assert.equal(g.classify(key('Enter'), 1000), 'enter');
  assert.equal(g.classify(key('Enter'), 1000 + KEY_TIMING.enterMs - 1), null);
  assert.equal(g.classify(key('Enter'), 1000 + KEY_TIMING.enterMs), 'enter');
});

test('one swipe that arrives as two arrow events moves once; a later swipe moves again', () => {
  const g = createKeyGuard({ phantomMs: 0 });
  g.arm(0);
  assert.equal(g.classify(key('ArrowDown'), 5000), 'next');
  assert.equal(g.classify(key('ArrowRight'), 5100), null);                       // alias of the same swipe
  assert.equal(g.classify(key('ArrowDown'), 5000 + KEY_TIMING.aliasMs), 'next');  // a new swipe
  assert.equal(g.classify(key('ArrowUp'), 6200 + 100), null);                     // other direction too soon after
  assert.equal(g.classify(key('ArrowUp'), 6200 + KEY_TIMING.repeatMs), 'prev');   // ... but fine after the repeat window
});

// ── handoff ───────────────────────────────────────────────

function memoryStorage() {
  const m = new Map();
  return { getStorageSync: (k) => m.get(k), setStorageSync: (k, v) => { m.set(k, v); } };
}

test('handoff delivers a message once', () => {
  let t = 1000;
  const h = createHandoff(memoryStorage(), () => t);
  assert.equal(h.take(), null);
  h.set({ type: 'search', movieId: 5, date: '2026-11-17' });
  t = 2000;
  assert.deepEqual(h.take(), { type: 'search', movieId: 5, date: '2026-11-17', ts: 1000 });
  assert.equal(h.take(), null);
});

test('a stale handoff is discarded', () => {
  let t = 0;
  const h = createHandoff(memoryStorage(), () => t);
  h.set({ type: 'list', date: '2026-11-17' });
  t = 6000;
  assert.equal(h.take(), null);
});

test('handoff never throws when storage does', () => {
  const broken = { getStorageSync() { throw new Error('x'); }, setStorageSync() { throw new Error('x'); } };
  const h = createHandoff(broken);
  h.set({ type: 'list' });
  assert.equal(h.take(), null);
});
