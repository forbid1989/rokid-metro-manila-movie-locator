/**
 * Find a cinema named inside a spoken request ("is godzilla showing at
 * robinsons galleria ortigas") and cut its words out, leaving the rest for the
 * movie parser. Pure functions.
 *
 *   extractTheater(tokens, directory, { origin })
 *     -> { tokens, resolution, weak } | null
 *
 * `tokens` are the request's words (lowercase, punctuation-free). `tokens` in
 * the result are what is left; `words` are the words that were cut. `resolution`
 * is a resolveTheater() result: 'match', or 'ambiguous'/'confirm' when the name
 * fits several cinemas.
 *
 * A cinema is looked for after "at / in / sa / inside" first, because that is
 * how people place a request; then as a distinctive run of words anywhere.
 * `weak` marks a single word accepted with no preposition ("opus", "aura"): it
 * may really be a movie, so the caller should prefer a movie of that name.
 */
import { resolveTheater, findTheaterInTokens } from './theaterMatch.js';
import { trimBounds } from './fillerWords.js';

const PREPOSITIONS = ['at', 'in', 'sa', 'inside'];
const MIN_COVERAGE = 0.8;

function cut(tokens, from, to) {
  return tokens.slice(0, from).concat(tokens.slice(to));
}

function mk(tokens, from, to, resolution, weak) {
  return { tokens: cut(tokens, from, to), words: tokens.slice(from, to).join(' '), resolution: resolution, weak: !!weak };
}

export function extractTheater(tokens, directory, options) {
  const list = tokens || [];
  if (!directory || !directory.length || !list.length) return null;
  const o = options || {};

  for (let i = list.length - 1; i >= 0; i--) {
    if (PREPOSITIONS.indexOf(list[i]) < 0) continue;
    const phrase = list.slice(i + 1);
    if (!phrase.length) continue;

    // The whole rest of the request is the name.
    const whole = resolveTheater([phrase.join(' ')], directory, o);
    if (whole.status === 'match') return mk(list, i, list.length, whole);

    // A distinctive name inside it, with words trailing ("... megamall please").
    const hit = findTheaterInTokens(phrase, directory, o);
    if (hit) return mk(list, i, i + 1 + hit.end, hit.result);

    // A brand or area that fits several cinemas, once the wrapping words are trimmed.
    const b = trimBounds(phrase);
    if (b.end > b.start) {
      const trimmed = resolveTheater([phrase.slice(b.start, b.end).join(' ')], directory, o);
      // Only when the words genuinely fit a cinema: "in the blue night" is not "SM Light Mall".
      const fits = trimmed.candidates[0] && trimmed.candidates[0].coverage >= MIN_COVERAGE;
      if (trimmed.status !== 'none' && fits) return mk(list, i, i + 1 + b.end, trimmed);
    }
  }

  // No preposition: a distinctive run of words.
  const hit = findTheaterInTokens(list, directory, o);
  if (!hit) return null;
  const length = hit.end - hit.start;
  return mk(list, hit.start, hit.end, hit.result, length === 1);
}
