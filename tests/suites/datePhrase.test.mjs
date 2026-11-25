import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDate } from '../../utils/datePhrase.js';
import { at } from '../helpers.mjs';

// "Today" is Tuesday 2026-11-17 (Manila).
const NOW = at('2026-11-17', 10, 0);
const ex = (text) => extractDate(text.split(' '), NOW);
const dateOf = (text) => ex(text).date;

test('relative days', () => {
  assert.equal(dateOf('today'), '2026-11-17');
  assert.equal(dateOf('tonight'), '2026-11-17');
  assert.equal(dateOf('tomorrow'), '2026-11-18');
  assert.equal(dateOf('day after tomorrow'), '2026-11-19');
  assert.equal(dateOf('yesterday'), '2026-11-16');
});

test('weekday names mean the next one, including today', () => {
  assert.equal(dateOf('tuesday'), '2026-11-17'); // today is Tuesday
  assert.equal(dateOf('wednesday'), '2026-11-18');
  assert.equal(dateOf('friday'), '2026-11-20');
  assert.equal(dateOf('sunday'), '2026-11-22');
  assert.equal(dateOf('monday'), '2026-11-23');
  assert.equal(dateOf('this friday'), '2026-11-20');
  assert.equal(dateOf('thurs'), '2026-11-19');
});

test('"next <weekday>" skips a full week only when it is today\'s weekday', () => {
  assert.equal(dateOf('next tuesday'), '2026-11-24');
  assert.equal(dateOf('next friday'), '2026-11-20');
});

test('month and day, in either order, with ordinals and spoken numbers', () => {
  for (const phrase of ['november 18', 'nov 18', 'november 18th', '18 november', '18th of november',
    'the 18th of november', 'november eighteen', 'november eighteenth', 'eighteen november']) {
    assert.equal(dateOf(phrase), '2026-11-18', phrase);
  }
  assert.equal(dateOf('december 25'), '2026-12-25');
  assert.equal(dateOf('november twenty one'), '2026-11-21');
  assert.equal(dateOf('november 18 2026'), '2026-11-18');
  assert.equal(dateOf('december 5 2027'), '2027-12-05');
});

test('past dates stay in the past; long-past dates roll to next year', () => {
  assert.equal(dateOf('november 10'), '2026-11-10'); // a week ago: no showings, and the label says so
  assert.equal(dateOf('january 5'), '2027-01-05');   // 10 months ago: means next January
});

test('a day of the month on its own', () => {
  assert.equal(dateOf('the 20th'), '2026-11-20');
  assert.equal(dateOf('20th'), '2026-11-20');
  assert.equal(dateOf('the 5th'), '2026-12-05'); // already passed this month
  assert.equal(dateOf('the twenty first'), '2026-11-21');
  assert.equal(dateOf('the 31st'), '2026-12-31'); // November has no 31st
});

test('impossible dates are not dates', () => {
  assert.equal(dateOf('february 30'), null);
  assert.equal(dateOf('november 31'), null);
  assert.equal(dateOf('november 0'), null);
});

test('the date phrase and its lead-in words are removed, the rest is kept in order', () => {
  assert.deepEqual(ex('where is godzilla on friday'), { date: '2026-11-20', tokens: ['where', 'is', 'godzilla'] });
  assert.deepEqual(ex('godzilla for the 18th of november please'), { date: '2026-11-18', tokens: ['godzilla', 'please'] });
  assert.deepEqual(ex('what is showing this friday'), { date: '2026-11-20', tokens: ['what', 'is', 'showing'] });
  assert.deepEqual(ex('the beast tomorrow'), { date: '2026-11-18', tokens: ['the', 'beast'] });
  assert.deepEqual(ex('godzilla'), { date: null, tokens: ['godzilla'] });
});

test('numbers and words in movie titles are not mistaken for dates', () => {
  for (const title of ['2 valid ids', 'sine sindak 7 vhs', 'dune part two', 'godzilla minus one',
    'november', 'may', 'second showing', 'we are aliens', 'big little things', 'the cat in the hat']) {
    assert.equal(dateOf(title), null, title);
  }
});

test('resolveDateParam accepts ISO dates and spoken phrases, and nothing else', async () => {
  const { resolveDateParam } = await import('../../utils/datePhrase.js');
  assert.equal(resolveDateParam('2026-11-20', NOW), '2026-11-20');
  assert.equal(resolveDateParam('tomorrow', NOW), '2026-11-18');
  assert.equal(resolveDateParam(' Friday ', NOW), '2026-11-20');
  assert.equal(resolveDateParam('November 18', NOW), '2026-11-18');
  assert.equal(resolveDateParam('2026-02-30', NOW), null);
  assert.equal(resolveDateParam('whenever', NOW), null);
  assert.equal(resolveDateParam('', NOW), null);
  assert.equal(resolveDateParam(undefined, NOW), null);
  assert.equal(resolveDateParam(null, NOW), null);
});
