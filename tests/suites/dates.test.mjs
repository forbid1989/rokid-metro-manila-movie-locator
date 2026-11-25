import test from 'node:test';
import assert from 'node:assert/strict';
import {
  manilaNow, addDays, weekdayOf, parseTime12h, isPastShowtime,
  formatDateLabel, relativeDateLabel, isValidDate,
} from '../../utils/dates.js';
import { at } from '../helpers.mjs';

test('manilaNow is UTC+8, including across the UTC date line', () => {
  // 2026-11-16 17:00 UTC is already 01:00 on the 17th in Manila.
  const n = manilaNow(Date.UTC(2026, 10, 16, 17, 0));
  assert.equal(n.date, '2026-11-17');
  assert.equal(n.minutes, 60);
  assert.equal(n.weekday, 2); // Tuesday
  // 2026-11-17 15:59 UTC is 23:59 Manila, still the 17th.
  assert.equal(manilaNow(Date.UTC(2026, 10, 17, 15, 59)).date, '2026-11-17');
  assert.equal(manilaNow(Date.UTC(2026, 10, 17, 16, 0)).date, '2026-11-18');
});

test('addDays crosses month and year boundaries and rejects bad dates', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('nope', 1), null);
});

test('isValidDate rejects impossible dates', () => {
  assert.equal(isValidDate('2026-11-17'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('11/17/2026'), false);
  assert.equal(isValidDate(''), false);
});

test('weekdayOf', () => {
  assert.equal(weekdayOf('2026-11-17'), 2); // Tue
  assert.equal(weekdayOf('2026-11-22'), 0); // Sun
  assert.equal(weekdayOf('bad'), null);
});

test('parseTime12h handles noon, midnight and sloppy input', () => {
  assert.equal(parseTime12h('12:00 AM'), 0);
  assert.equal(parseTime12h('12:30 AM'), 30);
  assert.equal(parseTime12h('12:00 PM'), 720);
  assert.equal(parseTime12h('1:05 PM'), 13 * 60 + 5);
  assert.equal(parseTime12h('11:59 PM'), 23 * 60 + 59);
  assert.equal(parseTime12h(' 3:30 pm '), 15 * 60 + 30);
  assert.equal(parseTime12h('3:30 p.m.'), 15 * 60 + 30);
  assert.equal(parseTime12h('13:00 PM'), null);
  assert.equal(parseTime12h('0:30 AM'), null);
  assert.equal(parseTime12h('3:75 PM'), null);
  assert.equal(parseTime12h('15:30'), null);
  assert.equal(parseTime12h(''), null);
  assert.equal(parseTime12h(undefined), null);
});

test('isPastShowtime only filters today', () => {
  const now = at('2026-11-17', 16, 0); // 4:00 PM Manila
  assert.equal(isPastShowtime('12:00 PM', '2026-11-17', now), true);
  assert.equal(isPastShowtime('3:59 PM', '2026-11-17', now), true);
  assert.equal(isPastShowtime('4:00 PM', '2026-11-17', now), false); // starting now is still catchable
  assert.equal(isPastShowtime('8:00 PM', '2026-11-17', now), false);
  assert.equal(isPastShowtime('12:00 PM', '2026-11-18', now), false); // tomorrow
  assert.equal(isPastShowtime('8:00 PM', '2026-11-16', now), true);   // yesterday
  assert.equal(isPastShowtime('garbage', '2026-11-17', now), false);  // unparseable is kept
});

test('isPastShowtime uses Manila time, not the host time zone', () => {
  // 11:30 PM Manila on the 17th is 15:30 UTC the same day.
  const now = Date.UTC(2026, 10, 17, 15, 30);
  assert.equal(isPastShowtime('9:00 PM', '2026-11-17', now), true);
  assert.equal(isPastShowtime('11:45 PM', '2026-11-17', now), false);
});

test('date labels', () => {
  assert.equal(formatDateLabel('2026-11-17'), 'Tue Nov 17');
  assert.equal(formatDateLabel('2026-12-01'), 'Tue Dec 1');
  const now = at('2026-11-17', 10, 0);
  assert.equal(relativeDateLabel('2026-11-17', now), 'Today');
  assert.equal(relativeDateLabel('2026-11-18', now), 'Tomorrow');
  assert.equal(relativeDateLabel('2026-11-20', now), 'Fri Nov 20');
});
