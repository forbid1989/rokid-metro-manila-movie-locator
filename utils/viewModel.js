/**
 * Turn search results into what the screens display. Pure functions.
 */
import { truncate, shortRuntime } from './format.js';
import { relativeDateLabel, formatDateLabel } from './dates.js';
import { DEFAULTS } from './search.js';
import { formatKm } from './geo.js';

/** 'Today · Tue Nov 17', 'Tomorrow · Wed Nov 18', or 'Fri Nov 20'. */
export function dateHeader(date, nowMs) {
  const rel = relativeDateLabel(date, nowMs);
  const abs = formatDateLabel(date);
  return rel === abs ? abs : rel + ' · ' + abs;
}

/** 'PG · 2h 14m'; either part may be missing. */
export function ratingRuntime(rating, runtime) {
  return [rating, shortRuntime(runtime)].filter(Boolean).join(' · ');
}

/**
 * Rows for a list of movies ({id, hash, title, rating, runtime, releaseDate?}).
 * With { year: true } the release year leads the details, to tell apart films
 * with similar names ("2026 · PG · 2h 14m").
 */
export function movieRows(movies, options) {
  const withYear = !!(options && options.year);
  return (movies || []).map(function (m) {
    const year = withYear && m.releaseDate ? String(m.releaseDate).slice(0, 4) : '';
    return {
      id: 'm' + m.id,
      movieId: m.id,
      title: truncate(m.title, 34),
      meta: [year, ratingRuntime(m.rating, m.runtime)].filter(Boolean).join(' · '),
    };
  });
}

/**
 * Flatten malls into display rows: one 'mall' row (name + distance) followed by
 * one 'times' row per screen group. `mallStarts[i]` is the row index where mall
 * i begins, for scrolling it into view.
 */
export function resultRows(malls) {
  const rows = [];
  const mallStarts = [];
  (malls || []).forEach(function (mall, mi) {
    mallStarts.push(rows.length);
    rows.push({ id: 'm' + mi, kind: 'mall', mallIdx: mi, text: truncate(mall.name, 30), right: mall.distanceLabel || '', label: '' });
    mall.groups.forEach(function (g, gi) {
      rows.push({ id: 'm' + mi + 't' + gi, kind: 'times', mallIdx: mi, text: g.times.join(' · '), right: '', label: g.label });
    });
  });
  return { rows: rows, mallStarts: mallStarts };
}

// Layout used to decide how many malls fit on the results screen (px, from the
// styles in results.ink): a mall's name row, and one line of showtimes.
export const MALL_HEADER_PX = 32;
export const TIMES_LINE_PX = 19;
export const RESULTS_BUDGET_PX = 250;
const TIMES_CHARS_PER_LINE = 40; // conservative: monospace 13px beside a screen label

/** The estimated on-screen height of each mall's block, in px, indexed by mall. */
export function mallHeights(rows) {
  const heights = [];
  for (const r of rows || []) {
    if (r.kind === 'mall') {
      heights[r.mallIdx] = MALL_HEADER_PX;
    } else {
      const lines = Math.max(1, Math.ceil(String(r.text).length / TIMES_CHARS_PER_LINE));
      heights[r.mallIdx] += lines * TIMES_LINE_PX;
    }
  }
  return heights;
}

function km(n) {
  return (Math.round(n * 10) / 10) + ' km';
}

/**
 * The message for a search that found no malls: { headline, lines }.
 * Returns null for an 'ok' result.
 */
export function resultMessage(result, nowMs) {
  const when = relativeDateLabel(result.date, nowMs).toLowerCase();
  switch (result.status) {
    case 'ok':
      return null;
    case 'no-date': {
      const days = (result.availableDates || []).slice(0, 4).map(function (d) { return relativeDateLabel(d, nowMs); });
      return {
        headline: 'Not showing ' + (when === 'today' || when === 'tomorrow' ? when : 'on ' + formatDateLabel(result.date)),
        lines: days.length ? ['Showing on: ' + days.join(', ')] : [],
      };
    }
    case 'not-showing':
      return { headline: 'No showtimes listed', lines: ['Try another movie'] };
    case 'none-left-today':
      return { headline: 'No more showings today', lines: ["Say 'tomorrow' for later"] };
    case 'none-in-range': {
      const lines = [];
      if (result.nearest && result.nearest.distanceKm !== null) {
        lines.push('Nearest: ' + result.nearest.name + ', ' + km(result.nearest.distanceKm));
      }
      return { headline: 'Not showing within ' + DEFAULTS.maxKm + ' km ' + (when === 'today' ? 'today' : when === 'tomorrow' ? 'tomorrow' : 'on ' + formatDateLabel(result.date)), lines: lines };
    }
    default:
      return { headline: 'No results', lines: [] };
  }
}

/** The message for a "what's showing" list that came back empty. */
export function emptyListMessage(date, nowMs) {
  const rel = relativeDateLabel(date, nowMs);
  if (rel === 'Today') return { headline: 'No more showings today', lines: ["Say 'tomorrow' for later"] };
  return { headline: 'No showings ' + (rel === 'Tomorrow' ? 'tomorrow' : 'on ' + formatDateLabel(date)), lines: [] };
}

/** Rows for the nearest-cinemas list: name, city and distance. */
export function theaterRows(theaters) {
  return (theaters || []).map(function (t) {
    return {
      id: 't' + t.slug,
      slug: t.slug,
      title: truncate(t.name, 30),
      city: truncate(t.city, 24),
      meta: formatKm(t.distanceKm),
    };
  });
}

/** The message when no cinema is within range. */
export function noTheatersMessage(maxKm) {
  return { headline: 'No cinemas within ' + maxKm + ' km', lines: ['Say a movie name to search'] };
}

function whenLabel(date, nowMs) {
  const rel = relativeDateLabel(date, nowMs);
  return rel === 'Today' ? 'today' : rel === 'Tomorrow' ? 'tomorrow' : 'on ' + formatDateLabel(date);
}

/** The message for a cinema's day that has no movies: { headline, lines }. */
export function theaterDayMessage(result, nowMs) {
  const when = whenLabel(result.date, nowMs);
  switch (result.status) {
    case 'none-left-today':
      return { headline: 'No more showings today', lines: ["Say 'tomorrow' for later"] };
    case 'no-date': {
      const days = (result.availableDates || []).slice(0, 4).map(function (d) { return relativeDateLabel(d, nowMs); });
      return { headline: 'No schedule ' + when, lines: days.length ? ['Listed: ' + days.join(', ')] : [] };
    }
    default:
      return { headline: 'No showtimes listed ' + when, lines: ['Try another day'] };
  }
}

/** The subtitle on "not at this cinema" screens, e.g. 'Not at The Podium · today'. */
export function notHereHeader(theaterName, date, nowMs) {
  return 'Not at ' + truncate(theaterName, 26) + ' · ' + whenLabel(date, nowMs);
}

/**
 * The message when a movie is not at the cinema and there is nothing nearby to
 * suggest either: { headline, lines }.
 */
export function notHereMessage(result, nowMs) {
  const when = whenLabel(result.date, nowMs);
  const lines = [];
  if (result.reason === 'started') lines.push('Its showings here have started');
  else if (result.reason === 'no-schedule') lines.push('No schedule listed that day');
  if (result.alternativesError) lines.push('Could not look at other cinemas');
  else if (result.alternativesStatus === 'none-in-range') lines.push('Not within ' + DEFAULTS.maxKm + ' km either');
  else if (result.alternativesStatus === 'none-left-today') lines.push('No more showings today anywhere near');
  else if (result.alternativesStatus === 'no-date' || result.alternativesStatus === 'not-showing') lines.push('Not showing anywhere ' + when);
  return { headline: 'Not showing at ' + truncate(result.theater.name, 24) + ' ' + when, lines: lines };
}

/** Rows for the list of movies at one cinema: title, rating and runtime, and the day's times. */
export function theaterMovieRows(movies) {
  return (movies || []).map(function (m) {
    return {
      id: 'm' + m.id,
      movieId: m.id,
      title: truncate(m.title, 30),
      meta: ratingRuntime(m.rating, m.runtime),
      times: truncate((m.times || []).join(' · '), 46),
    };
  });
}
