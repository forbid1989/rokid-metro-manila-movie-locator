/**
 * Turn what the user said into an action. Pure functions, no platform APIs.
 *
 * parseCommand() is the older syntax-only reading (no movie list needed, used by
 * its own tests); interpret() is what the app uses.
 *
 *   parseCommand("where is godzilla showing on friday", nowMs)
 *     -> { intent: 'find', queries: ['godzilla'], date: '2026-11-20', transcript }
 *
 *   interpret(alternatives, catalog, nowMs, { directory, origin })
 *     -> { intent, date, queries, resolution, theater, transcript }   (best of several recognizer guesses)
 *
 * intent:
 *   'find'         a movie was named: where / when is it showing. With `theater` (a
 *                  resolveTheater result) the question is "is it showing at <cinema>"
 *   'theater'      a cinema was named without a movie: what is showing at `theater`
 *   'theaters'     "what are the nearest theaters": list cinemas near the user
 *   'list'         "what's showing (today / tomorrow ...)" with no movie named
 *   'date'         only a day was said ("tomorrow", "what about friday"): re-run the current view on that day
 *   'diagnostics'  open the diagnostics page
 * `date` is null when the user did not name one (callers use today).
 * Anything else parses to null.
 *
 * Cinema names need the cinema directory (`ctx.directory`); without it the
 * theater intents are never produced and everything works as before.
 */
import { extractDate } from './datePhrase.js';
import { resolveMovie } from './titleMatch.js';
import { trimFiller } from './fillerWords.js';
import { extractTheater } from './theaterPhrase.js';
import { THEATER_WORDS, toWords, splitNames, wantsList } from './phrase.js';
import { classify } from './classifier.js';

export function parseCommand(transcript, nowMs, ctx) {
  const words = toWords(transcript);
  if (!words.length) return null;
  const base = { transcript: String(transcript) };

  if (words.some(function (w) { return w === 'diagnostics' || w === 'diagnostic'; })) {
    return Object.assign(base, { intent: 'diagnostics', queries: [], date: null });
  }

  const d = extractDate(words, nowMs);
  // Judged on the original words: the date extractor absorbs "on" in "what's on friday".
  const list = wantsList(words);

  // A cinema named in the request ("... at robinsons galleria ortigas") is cut out first.
  const ctxOptions = ctx || {};
  const found = ctxOptions.directory ? extractTheater(d.tokens, ctxOptions.directory, { origin: ctxOptions.origin }) : null;
  const queries = splitNames(trimFiller(found ? found.tokens : d.tokens));

  if (found) {
    return Object.assign(base, {
      intent: queries.length ? 'find' : 'theater',
      queries: queries, date: d.date, theater: found.resolution,
      // A bare single word may be a movie instead ("aura"); interpret() decides.
      weak: found.weak, theaterWords: found.words, altQueries: found.weak ? splitNames(trimFiller(d.tokens)) : [],
    });
  }
  if (queries.length) return Object.assign(base, { intent: 'find', queries: queries, date: d.date });
  if (!list && words.some(function (w) { return THEATER_WORDS.indexOf(w) >= 0; })) {
    return Object.assign(base, { intent: 'theaters', queries: [], date: null });
  }
  if (list) return Object.assign(base, { intent: 'list', queries: [], date: d.date });
  if (d.date) return Object.assign(base, { intent: 'date', queries: [], date: d.date });
  return null;
}

/**
 * The recognizer returns several guesses; read them all and keep the one that
 * leads somewhere (a movie or cinema that matches beats one that does not).
 * `ctx` is { directory, origin } for cinema names. Returns null when nothing in
 * any guess is a command.
 *
 * This is the entity-first classifier (classifier.js): it finds the movie, the
 * cinema and the day in the words and derives the intent from those.
 */
export function interpret(transcripts, catalog, nowMs, ctx) {
  return classify(transcripts, catalog, nowMs, ctx);
}
