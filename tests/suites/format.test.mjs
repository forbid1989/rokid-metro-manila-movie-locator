import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKm, shortRuntime, sortTimes, screenFormat, truncate } from '../../utils/format.js';

test('parseKm', () => {
  assert.equal(parseKm('1.7 km'), 1.7);
  assert.equal(parseKm('12.0 km'), 12);
  assert.equal(parseKm('850 m'), 0.85);
  assert.equal(parseKm(''), null);
  assert.equal(parseKm('far'), null);
  assert.equal(parseKm(undefined), null);
});

test('shortRuntime', () => {
  assert.equal(shortRuntime('2 hrs 14 min'), '2h 14m');
  assert.equal(shortRuntime('1 hr 40 min'), '1h 40m');
  assert.equal(shortRuntime('2 hrs 00 min'), '2h 00m');
  assert.equal(shortRuntime('45 min'), '45m');
  assert.equal(shortRuntime(''), '');
  assert.equal(shortRuntime(undefined), '');
});

test('sortTimes orders chronologically and removes duplicates', () => {
  assert.deepEqual(
    sortTimes(['8:00 PM', '12:00 PM', '11:30 AM', '12:00 AM', '8:00 PM']),
    ['12:00 AM', '11:30 AM', '12:00 PM', '8:00 PM']
  );
  assert.deepEqual(sortTimes([]), []);
  assert.deepEqual(sortTimes(undefined), []);
});

test('screenFormat labels special screens and merges ordinary rooms', () => {
  // Real screen names from the recorded schedules.
  assert.equal(screenFormat('IMAX'), 'IMAX');
  assert.equal(screenFormat('Gateway Cineplex 10 (Platinum Cinema)'), 'Platinum');
  assert.equal(screenFormat('Gateway Premiere Club B'), 'Premiere');
  assert.equal(screenFormat('GH Mall Cine-Luxe Cinema'), 'Luxe');
  assert.equal(screenFormat('OPUS Premier VIP Cinema 5'), 'VIP');
  assert.equal(screenFormat("Director's Club 2"), "Director's");
  assert.equal(screenFormat('Ultra Cinema 7'), 'Ultra');
  for (const plain of ['Cinema 5', 'Digital Cinema 3', 'Digital Cinema  4', '1', 'GH Promenade Cinema 7', 'Gateway Cineplex 4']) {
    assert.equal(screenFormat(plain), '', plain);
  }
  assert.equal(screenFormat('Cinema 2', true), '3D');
  assert.equal(screenFormat('IMAX', true), 'IMAX 3D');
});

test('truncate', () => {
  assert.equal(truncate('Godzilla Minus Zero', 30), 'Godzilla Minus Zero');
  assert.equal(truncate('Godzilla Minus Zero', 10), 'Godzilla…'); // no dangling space before the ellipsis
  assert.equal(truncate(undefined, 5), '');
});
