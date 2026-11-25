/**
 * Spoken date phrases -> 'YYYY-MM-DD' (Manila). Pure functions.
 *
 *   extractDate(tokens, nowMs) -> { date, tokens }
 *
 * `tokens` are lower-case words (see tokenize() in voiceCommand.js). The phrase
 * is cut out of the token list and the rest is returned, so "where is godzilla
 * on friday" becomes date = next Friday, tokens = [where, is, godzilla].
 *
 * Understood:
 *   today, tonight, tomorrow, day after tomorrow, yesterday
 *   monday ... sunday  (+ "this"/"next"/"on")
 *       "friday"/"this friday": the next one, today if today is that day
 *       "next friday":          the next one, but a full week out if today is Friday
 *   november 18, nov 18th, 18 november, the 18th of november, november 18 2026
 *   the 18th, eighteenth       (day of the month: this month, else next)
 *   numeric 11/18 and ISO 2026-11-18 are converted to words before tokenizing
 *
 * A bare number is never a date ("2 Valid IDs" is a movie), only a month
 * name + number or an ordinal is.
 */
import { manilaNow, addDays, weekdayOf, isValidDate } from './dates.js';

const WEEKDAYS = {
  sunday: 0, monday: 1, tuesday: 2, tues: 2, wednesday: 3, weds: 3,
  thursday: 4, thurs: 4, friday: 5, saturday: 6,
};

export const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

const UNITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30 };
const ORDINAL_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
  ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14,
  fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19,
  twentieth: 20, thirtieth: 30,
};
// Words that may sit in front of a date phrase and belong to it.
const LEAD_IN = ['on', 'this', 'next', 'coming', 'upcoming', 'for', 'by', 'the', 'of'];

// A day number at tokens[i]: digits, spelled-out ("eighteen", "twenty one"),
// with `ordinal` true when it was an ordinal ("18th", "eighteenth", "twenty first").
function dayAt(tokens, i) {
  const t = tokens[i];
  if (t === undefined) return null;
  let m = /^(\d{1,2})(st|nd|rd|th)$/.exec(t);
  if (m) return { value: Number(m[1]), len: 1, ordinal: true };
  if (/^\d{1,2}$/.test(t)) return { value: Number(t), len: 1, ordinal: false };
  if (t in ORDINAL_WORDS) return { value: ORDINAL_WORDS[t], len: 1, ordinal: true };
  if (t in TENS && tokens[i + 1] !== undefined) {
    const next = tokens[i + 1];
    if (next in ORDINAL_WORDS && ORDINAL_WORDS[next] < 10) {
      return { value: TENS[t] + ORDINAL_WORDS[next], len: 2, ordinal: true };
    }
    if (next in UNITS && UNITS[next] > 0 && UNITS[next] < 10) {
      return { value: TENS[t] + UNITS[next], len: 2, ordinal: false };
    }
  }
  if (t in UNITS) return { value: UNITS[t], len: 1, ordinal: false };
  if (t in TENS) return { value: TENS[t], len: 1, ordinal: false };
  return null;
}

function yearAt(tokens, i) {
  return /^20\d{2}$/.test(tokens[i] || '') ? Number(tokens[i]) : null;
}

function iso(y, m, d) {
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

// Month + day (no year given): this year, rolled to next year only when the
// date is long past (so "january 5" said in December means next January,
// but "november 10" said on the 17th stays in the past and simply has no showings).
function monthDay(month, day, today, explicitYear) {
  const year = explicitYear || Number(today.slice(0, 4));
  let candidate = iso(year, month, day);
  if (!isValidDate(candidate)) return null;
  if (!explicitYear && candidate < today) {
    const daysAgo = (Date.parse(today) - Date.parse(candidate)) / 86400000;
    if (daysAgo > 180) {
      const rolled = iso(year + 1, month, day);
      if (isValidDate(rolled)) candidate = rolled;
    }
  }
  return candidate;
}

// Day of month only: this month if it has not passed, else the next month that has that day.
function dayOfMonth(day, today) {
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  for (let i = 0; i < 13; i++) {
    const candidate = iso(y, m, day);
    if (isValidDate(candidate) && candidate >= today) return candidate;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return null;
}

function weekdayDate(target, today, nextWeek) {
  let delta = (target - weekdayOf(today) + 7) % 7;
  if (nextWeek && delta === 0) delta = 7;
  return addDays(today, delta);
}

// Try to read a date phrase starting at tokens[i]. Returns { len, date } or null.
function matchAt(tokens, i, today) {
  const t = tokens[i];

  if (t === 'day' && tokens[i + 1] === 'after' && (tokens[i + 2] === 'tomorrow' || tokens[i + 2] === 'tmrw')) {
    return { len: 3, date: addDays(today, 2) };
  }
  if (t === 'tomorrow' || t === 'tmrw' || t === 'bukas') return { len: 1, date: addDays(today, 1) };
  if (t === 'today' || t === 'tonight' || t === 'ngayon') return { len: 1, date: today };
  if (t === 'ngayong' && (tokens[i + 1] === 'gabi' || tokens[i + 1] === 'araw')) return { len: 2, date: today };
  if (t === 'yesterday') return { len: 1, date: addDays(today, -1) };

  if (t in WEEKDAYS) {
    return { len: 1, date: weekdayDate(WEEKDAYS[t], today, tokens[i - 1] === 'next') };
  }

  // "november 18 [2026]", "nov 18th"
  if (t in MONTHS) {
    const day = dayAt(tokens, i + 1);
    if (day && day.value >= 1 && day.value <= 31) {
      const year = yearAt(tokens, i + 1 + day.len);
      const date = monthDay(MONTHS[t], day.value, today, year);
      if (date) return { len: 1 + day.len + (year ? 1 : 0), date: date };
    }
  }

  // "18 november", "18th of november", "twenty first of november"
  const day = dayAt(tokens, i);
  if (day && day.value >= 1 && day.value <= 31) {
    let j = i + day.len;
    if (tokens[j] === 'of') j++;
    if (tokens[j] in MONTHS) {
      const year = yearAt(tokens, j + 1);
      const date = monthDay(MONTHS[tokens[j]], day.value, today, year);
      if (date) return { len: j + 1 + (year ? 1 : 0) - i, date: date };
    }
    // "the 18th" / "18th": an ordinal on its own is a day of the month. A bare
    // spoken ordinal ("second") only counts after "the", so titles and phrases
    // like "second showing" are left alone.
    if (day.ordinal && (/\d/.test(tokens[i]) || tokens[i - 1] === 'the')) {
      const date = dayOfMonth(day.value, today);
      if (date) return { len: day.len, date: date };
    }
  }
  return null;
}

/**
 * A date handed to a page as a parameter (by the host assistant or another
 * page): an ISO date as-is, or any phrase this module understands ("tomorrow",
 * "friday", "november 18"). Returns null when it is neither.
 */
export function resolveDateParam(value, nowMs) {
  const s = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
  if (!s) return null;
  if (isValidDate(s)) return s;
  return extractDate(s.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean), nowMs).date;
}

export function extractDate(tokens, nowMs) {
  const today = manilaNow(nowMs).date;
  for (let i = 0; i < tokens.length; i++) {
    const m = matchAt(tokens, i, today);
    if (!m) continue;
    let start = i;
    // Absorb lead-in words ("on friday", "for the 18th", "this friday").
    while (start > 0 && LEAD_IN.indexOf(tokens[start - 1]) >= 0 && i - start < 2) start--;
    const rest = tokens.slice(0, start).concat(tokens.slice(i + m.len));
    return { date: m.date, tokens: rest };
  }
  return { date: null, tokens: tokens.slice() };
}
