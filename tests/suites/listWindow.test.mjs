import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleWindow, uniformHeights } from '../../utils/listWindow.js';
import { mallHeights, resultRows, RESULTS_BUDGET_PX } from '../../utils/viewModel.js';

const win = (n, prev, sel, size) => visibleWindow(uniformHeights(n, 1), prev, sel, size);

test('the window starts at the top and the highlight walks down inside it', () => {
  assert.deepEqual(win(10, 0, 0, 5), { start: 0, end: 5 });
  for (let sel = 1; sel <= 4; sel++) assert.deepEqual(win(10, 0, sel, 5), { start: 0, end: 5 }, 'sel ' + sel);
});

test('past the bottom edge the window slides one row at a time, keeping the highlight on the last row', () => {
  assert.deepEqual(win(10, 0, 5, 5), { start: 1, end: 6 });
  assert.deepEqual(win(10, 1, 6, 5), { start: 2, end: 7 });
});

test('past the top edge it slides back so the highlight is on the first row', () => {
  assert.deepEqual(win(10, 4, 3, 5), { start: 3, end: 8 });
  assert.deepEqual(win(10, 4, 4, 5), { start: 4, end: 9 }, 'inside the window: unchanged');
});

test('it never runs past the end, and it can reach both ends', () => {
  assert.deepEqual(win(10, 5, 9, 5), { start: 5, end: 10 });
  assert.deepEqual(win(10, 0, 9, 5), { start: 5, end: 10 });
  assert.deepEqual(win(10, 5, 0, 5), { start: 0, end: 5 });
});

test('a list shorter than the window shows everything', () => {
  assert.deepEqual(win(3, 0, 2, 5), { start: 0, end: 3 });
  assert.deepEqual(win(1, 0, 0, 5), { start: 0, end: 1 });
});

test('empty list, and out-of-range input, are safe', () => {
  assert.deepEqual(win(0, 0, 0, 5), { start: 0, end: 0 });
  assert.deepEqual(win(10, 0, 99, 5), { start: 5, end: 10 });
  assert.deepEqual(win(10, 99, 2, 5), { start: 2, end: 7 });
  assert.deepEqual(win(10, undefined, 0, 5), { start: 0, end: 5 });
});

test('with unequal heights, items are added while they fit', () => {
  const heights = [50, 70, 70, 50, 50]; // px
  assert.deepEqual(visibleWindow(heights, 0, 0, 250), { start: 0, end: 4 }); // 50+70+70+50 = 240
  assert.deepEqual(visibleWindow(heights, 0, 4, 250), { start: 1, end: 5 }); // 70+70+50+50 = 240
});

test('an item taller than the budget is still shown', () => {
  assert.deepEqual(visibleWindow([400, 50], 0, 0, 250), { start: 0, end: 1 });
  assert.deepEqual(visibleWindow([50, 400], 0, 1, 250), { start: 1, end: 2 });
});

test('mallHeights estimates each mall block, including wrapped time lines', () => {
  const rows = resultRows([
    { name: 'A', distanceLabel: '1 km', groups: [{ label: '', times: ['1:00 PM', '3:00 PM'] }] },
    { name: 'B', distanceLabel: '2 km', groups: [{ label: '', times: ['1:00 PM'] }, { label: 'IMAX', times: ['2:00 PM'] }] },
    { name: 'C', distanceLabel: '3 km', groups: [{ label: '', times: Array(8).fill('12:00 PM') }] }, // 8*8 + 7*3 = 85 chars: wraps to 3 lines
  ]).rows;
  assert.deepEqual(mallHeights(rows), [32 + 19, 32 + 19 + 19, 32 + 3 * 19]);
  assert.ok(RESULTS_BUDGET_PX >= 200);
});
