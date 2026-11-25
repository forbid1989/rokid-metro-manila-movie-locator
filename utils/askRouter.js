/**
 * The "Ask" entry: take what the user said, word for word, work out what they
 * want and say which screen to open. Pure functions.
 *
 *   routeRequest(texts, { catalog, directory, origin }, nowMs)
 *     -> { kind: 'route', url, action, cmd, echo }          open `url`
 *      | { kind: 'unsure', message, options: [{id,label,url}], heard }   say so and offer a way on
 *
 * It is the same chain the in-app voice uses (classify -> planAction -> routeFor),
 * so a phrase means the same thing wherever it is said.
 */
import { classify } from './classifier.js';
import { planAction } from './voiceFlow.js';
import { routeFor, moviesUrl, THEATERS_URL } from './pageRoutes.js';
import { manilaNow, relativeDateLabel } from './dates.js';
import { truncate } from './format.js';

function dayWord(date, nowMs) {
  return relativeDateLabel(date, nowMs).toLowerCase();
}

/** A few words saying what was understood, e.g. 'Godzilla Minus Zero at SM MegaMall · today'. */
export function echoFor(action, nowMs) {
  const day = action.date ? ' · ' + dayWord(action.date, nowMs) : '';
  switch (action.type) {
    case 'search': return truncate(action.movie.title, 30) + day;
    case 'theater': return truncate(action.theater.name, 30) + day;
    case 'theater-movie': return truncate(action.movie.title, 20) + ' at ' + truncate(action.theater.name, 22) + day;
    case 'theaters': return 'Nearest theaters';
    case 'list': return "What's showing" + day;
    case 'choose': return 'Which one?';
    case 'diagnostics': return 'Diagnostics';
    default: return '';
  }
}

/** Ways on when the request was not understood. */
export function suggestions(nowMs) {
  const today = manilaNow(nowMs).date;
  return [
    { id: 'list', label: "What's showing today", url: moviesUrl(today) },
    { id: 'theaters', label: 'Nearest theaters', url: THEATERS_URL },
  ];
}

export function routeRequest(texts, ctx, nowMs) {
  const list = (Array.isArray(texts) ? texts : [texts]).filter(function (t) { return String(t || '').trim(); });
  const heard = list[0] ? String(list[0]).trim() : '';
  const unsure = function (message) {
    return { kind: 'unsure', message: message, heard: heard, options: suggestions(nowMs) };
  };
  if (!list.length) return unsure('Say a movie, a cinema or a day');

  const cmd = classify(list, ctx.catalog, nowMs, { directory: ctx.directory, origin: ctx.origin });
  if (!cmd) return unsure("Didn't catch that");

  const action = planAction(cmd, { movie: null, theater: null, date: null }, nowMs);
  // A toast is the planner saying it cannot act ("no movie matching ...", "that day has passed").
  if (action.type === 'toast') return unsure(action.text.indexOf('Say a movie') === 0 ? "Didn't catch that" : action.text);

  const url = routeFor(action);
  if (!url) return unsure("Didn't catch that");
  return { kind: 'route', url: url, action: action, cmd: cmd, echo: echoFor(action, nowMs), heard: heard };
}
