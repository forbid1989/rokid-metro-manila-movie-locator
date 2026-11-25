import test from 'node:test';
import assert from 'node:assert/strict';
import { makeContext, score } from '../corpus/score.mjs';
import { SET_A } from '../corpus/setA.mjs';
import { SET_B } from '../corpus/setB.mjs';
import { SET_C } from '../corpus/setC.mjs';

/**
 * The classifier against phrase sets written independently of it. First-contact
 * scores (before any tuning on that set) were: A 88%, B 92%, C 93%. They are
 * regression tests now: every phrase in them must keep working.
 * `node --no-warnings tools/evalIntents.mjs` prints a readable report.
 */
const { catalog, ctx } = await makeContext();

for (const [name, rows] of [['A', SET_A], ['B', SET_B], ['C', SET_C]]) {
  test('phrase set ' + name + ': every phrase means what it should', () => {
    const r = score(rows, catalog, ctx);
    const report = r.failures.map((f) => '"' + f.say + '" wanted ' + JSON.stringify(f.expected) + ' got ' + JSON.stringify(f.actual));
    assert.deepEqual(report, []);
  });
}

test('the sets are large and varied enough to mean something', () => {
  const rows = [...SET_A, ...SET_B, ...SET_C];
  assert.ok(rows.length >= 180, String(rows.length));
  const intents = new Set(rows.map(([, e]) => e.intent));
  assert.deepEqual([...intents].sort(), ['date', 'diagnostics', 'find', 'list', 'nothing', 'theater', 'theaters']);
  assert.equal(new Set(rows.map(([s]) => s)).size, rows.length, 'no phrase appears twice');
});

test('without the cinema directory, cinema questions still do something sensible', () => {
  // The directory is best effort: when it could not load, a cinema name is just words.
  const noDir = { origin: ctx.origin };
  const r = score([
    ['is godzilla showing at sm megamall', { intent: 'find', movie: 'Godzilla Minus Zero' }],
    ['what are the nearest theaters', { intent: 'theaters' }],
    ["what's showing today", { intent: 'list', date: '2026-11-17' }],
  ], catalog, noDir);
  assert.deepEqual(r.failures, []);
});
