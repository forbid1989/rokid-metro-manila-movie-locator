/**
 * Decide what a spoken command should do. Pure: pages execute the action.
 *
 *   planAction(cmd, { movie, theater, date }, nowMs)
 *
 * `cmd` is the result of interpret() (voiceCommand.js) or null. `ctx.movie` is
 * the movie the page is showing, if any ("tomorrow" then means that movie
 * tomorrow); a page that shows a list passes movie: null. `ctx.theater` is the
 * cinema the page is showing, if any.
 *
 * Returns one of:
 *   { type: 'search', movie, date }                   show where `movie` is on `date`
 *   { type: 'list', date }                            show what is on `date`
 *   { type: 'theaters' }                              list the cinemas nearest the user
 *   { type: 'theater', theater, date }                what is showing at `theater` on `date`
 *   { type: 'theater-movie', theater, movie, date }   is `movie` showing at `theater` on `date`
 *   { type: 'choose', kind: 'movie', mode: 'confirm'|'pick', candidates: [movie], date, theater }
 *        `theater` is the cinema resolution to carry on with once the movie is chosen (or null)
 *   { type: 'choose', kind: 'theater', mode: 'confirm'|'pick', candidates: [theater], date, movie }
 *        `movie` is the movie to carry on with once the cinema is chosen (or null)
 *   { type: 'diagnostics' }
 *   { type: 'toast', text }
 */
import { manilaNow } from './dates.js';
import { truncate } from './format.js';

export function planAction(cmd, ctx, nowMs) {
  const today = manilaNow(nowMs).date;
  const context = ctx || {};

  if (!cmd) return { type: 'toast', text: "Say a movie name or 'what's showing'" };
  if (cmd.intent === 'diagnostics') return { type: 'diagnostics' };

  if (cmd.date && cmd.date < today) return { type: 'toast', text: 'That day has already passed' };
  const date = cmd.date || today;

  if (cmd.intent === 'theaters') return { type: 'theaters' };
  if (cmd.intent === 'list') return { type: 'list', date: date };
  if (cmd.intent === 'theater') return planTheater(cmd.theater, null, date);

  if (cmd.intent === 'date') {
    if (context.theater) {
      return context.movie
        ? { type: 'theater-movie', theater: context.theater, movie: context.movie, date: date }
        : { type: 'theater', theater: context.theater, date: date };
    }
    return context.movie
      ? { type: 'search', movie: context.movie, date: date }
      : { type: 'list', date: date };
  }

  // find
  const res = cmd.resolution;
  if (!res || res.status === 'none') {
    return { type: 'toast', text: "No movie matching '" + truncate(cmd.queries[0] || '', 24) + "'" };
  }
  // On a cinema's page, a movie named without a cinema means "at this cinema".
  const here = context.theater
    ? { status: 'match', theater: context.theater, candidates: [{ theater: context.theater, score: 1, coverage: 1 }] }
    : null;
  const theater = cmd.theater || here;
  if (res.status === 'match') {
    return theater ? planTheater(theater, res.movie, date) : { type: 'search', movie: res.movie, date: date };
  }
  if (res.status === 'confirm') {
    return { type: 'choose', kind: 'movie', mode: 'confirm', candidates: [res.movie], date: date, theater: theater };
  }
  return {
    type: 'choose',
    kind: 'movie',
    mode: 'pick',
    candidates: res.candidates.map(function (c) { return c.movie; }),
    date: date,
    theater: theater,
  };
}

// What to do with a cinema resolution, with a movie to look for there if one was named.
function planTheater(res, movie, date) {
  if (res.status === 'match') {
    return movie
      ? { type: 'theater-movie', theater: res.theater, movie: movie, date: date }
      : { type: 'theater', theater: res.theater, date: date };
  }
  if (res.status === 'confirm') {
    return { type: 'choose', kind: 'theater', mode: 'confirm', candidates: [res.theater], date: date, movie: movie };
  }
  return {
    type: 'choose',
    kind: 'theater',
    mode: 'pick',
    candidates: res.candidates.map(function (c) { return c.theater; }),
    date: date,
    movie: movie,
  };
}
