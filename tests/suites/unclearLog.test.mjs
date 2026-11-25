import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUnclear, readUnclear, clearUnclear } from '../../utils/unclearLog.js';

const store = () => {
  const data = {};
  return { data, getStorageSync: (k) => data[k], setStorageSync: (k, v) => { data[k] = v; } };
};

test('remembers what was not understood, newest first, without repeats', () => {
  const s = store();
  recordUnclear(s, 'zzzz', 1);
  recordUnclear(s, 'qqqq', 2);
  recordUnclear(s, 'zzzz', 3);
  assert.deepEqual(readUnclear(s).map((e) => e.text), ['zzzz', 'qqqq']);
  assert.equal(readUnclear(s)[0].at, 3);
});

test('keeps only the last 20, and long text is cut', () => {
  const s = store();
  for (let i = 0; i < 30; i++) recordUnclear(s, 'phrase ' + i, i);
  const list = readUnclear(s);
  assert.equal(list.length, 20);
  assert.equal(list[0].text, 'phrase 29');
  recordUnclear(s, 'x'.repeat(500), 99);
  assert.equal(readUnclear(s)[0].text.length, 140);
});

test('empty text and missing or hostile storage are harmless', () => {
  const s = store();
  recordUnclear(s, '   ', 1);
  recordUnclear(s, undefined, 1);
  assert.deepEqual(readUnclear(s), []);
  assert.doesNotThrow(() => recordUnclear(null, 'x', 1));
  assert.deepEqual(readUnclear(null), []);
  const hostile = { getStorageSync() { throw new Error('no'); }, setStorageSync() { throw new Error('no'); } };
  assert.doesNotThrow(() => recordUnclear(hostile, 'x', 1));
  assert.deepEqual(readUnclear(hostile), []);
  assert.deepEqual(readUnclear({ getStorageSync: () => 'junk' }), []);
});

test('it can be cleared', () => {
  const s = store();
  recordUnclear(s, 'x', 1);
  clearUnclear(s);
  assert.deepEqual(readUnclear(s), []);
});
