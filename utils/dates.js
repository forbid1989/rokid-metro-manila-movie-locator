/**
 * Date and time helpers. Everything is anchored to Manila time (UTC+8, no DST),
 * regardless of the device's own time zone. Pure functions: the clock is always
 * passed in (`nowMs`), defaulting to Date.now().
 *
 * Dates are 'YYYY-MM-DD' strings. Showtimes are the API's 12-hour strings,
 * e.g. '12:00 PM'.
 */

const MANILA_OFFSET_MS = 8 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function toIso(d) {
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

// 'YYYY-MM-DD' -> ms at 00:00 UTC of that calendar day, or null if invalid
// (including impossible dates such as 2026-02-30).
function parseIso(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toIso(new Date(ms)) === str ? ms : null;
}

export function isValidDate(str) {
  return parseIso(str) !== null;
}

/** The current Manila date, minutes since local midnight, and weekday (0 = Sunday). */
export function manilaNow(nowMs) {
  const t = new Date((nowMs === undefined ? Date.now() : nowMs) + MANILA_OFFSET_MS);
  return {
    date: toIso(t),
    minutes: t.getUTCHours() * 60 + t.getUTCMinutes(),
    weekday: t.getUTCDay(),
  };
}

export function addDays(dateStr, n) {
  const ms = parseIso(dateStr);
  if (ms === null) return null;
  return toIso(new Date(ms + n * DAY_MS));
}

/** 0 = Sunday ... 6 = Saturday, or null for an invalid date. */
export function weekdayOf(dateStr) {
  const ms = parseIso(dateStr);
  return ms === null ? null : new Date(ms).getUTCDay();
}

/**
 * '3:30 PM' -> minutes since midnight (930). '12:00 AM' -> 0, '12:00 PM' -> 720.
 * Returns null for anything that is not a 12-hour time.
 */
export function parseTime12h(str) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\.?\s*$/.exec(String(str || ''));
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const pm = m[3].toLowerCase() === 'p';
  return (hour % 12 + (pm ? 12 : 0)) * 60 + minute;
}

/**
 * Has this showtime already started? Only meaningful for today (Manila):
 * earlier dates are all past, later dates are all upcoming. Unparseable times
 * are kept (treated as not past) rather than silently dropped.
 */
export function isPastShowtime(timeStr, dateStr, nowMs) {
  const now = manilaNow(nowMs);
  if (dateStr < now.date) return true;
  if (dateStr > now.date) return false;
  const minutes = parseTime12h(timeStr);
  return minutes !== null && minutes < now.minutes;
}

/** 'Tue Nov 17' */
export function formatDateLabel(dateStr) {
  const ms = parseIso(dateStr);
  if (ms === null) return String(dateStr || '');
  const d = new Date(ms);
  return WEEKDAYS[d.getUTCDay()] + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate();
}

/** 'Today' / 'Tomorrow' / 'Tue Nov 17' relative to Manila's today. */
export function relativeDateLabel(dateStr, nowMs) {
  const today = manilaNow(nowMs).date;
  if (dateStr === today) return 'Today';
  if (dateStr === addDays(today, 1)) return 'Tomorrow';
  return formatDateLabel(dateStr);
}
