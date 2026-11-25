/**
 * Shared word-level helpers for reading what the user said. Pure functions.
 */
import { MONTH_NAMES } from './datePhrase.js';

// Words that point at cinemas rather than movies.
export const THEATER_WORDS = ['theater', 'theaters', 'theatre', 'theatres', 'cinema', 'cinemas', 'mall', 'malls', 'sinehan', 'house', 'houses', 'cineplex', 'multiplex', 'venue', 'venues'];

// Words that ask for the closest ones.
export const NEAREST_WORDS = ['nearest', 'closest', 'near', 'nearby', 'around', 'close', 'malapit', 'pinakamalapit', 'kalapit'];

// Said with no movie named, these mean "list what is on".
export const LIST_WORDS = ['showing', 'playing', 'movies', 'films', 'screening', 'screenings', 'watch', 'palabas', 'pelikula', 'listings', 'listing', 'schedule', 'schedules', 'showtimes', 'showtime'];

// The firmer ones: "watch a movie" alone is not a request for the list.
export const STRONG_LIST_WORDS = ['showing', 'playing', 'movies', 'films', 'screening', 'screenings', 'palabas', 'pelikula', 'listed', 'lineup', 'listings', 'listing', 'schedule', 'schedules', 'showtimes', 'showtime'];

// Words that ask for "what is on" without naming a movie.
export const LISTISH_WORDS = ['anything', 'everything', 'something', 'whatever'];

// Words that describe the request without naming anything: never a movie title.
export const DESCRIPTIVE_WORDS = ['good', 'great', 'nice', 'new', 'latest', 'best', 'top', 'popular', 'recent', 'current',
  'upcoming', 'hot', 'interesting', 'week', 'weekend', 'month', 'area', 'neighborhood', 'neighbourhood', 'vicinity',
  'should', 'go', 'going', 'head', 'visit', 'pick', 'recommend', 'suggest', 'one', 'ones', 'lineup', 'out', 'all',
  'everything', 'anything', 'something', 'whatever', 'town', 'around', 'out'];

// "where can I watch X", "I want to see X": remove the whole phrase up front.
const LEADING_PHRASES = [
  /\b(where|when|what time)\s+(can|could|do|does)\s+(i|we|you)\s+(watch|see|find|catch)\b/g,
  /\b(i|we)\s*(want|wanna|need|would like|d like|ll like)\s*(to)?\s*(watch|see|catch)?\b/g,
];

/** The words of an utterance: lower-case, no accents or punctuation, dates in digit form made into month names. */
export function toWords(text) {
  let s = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’]/g, "'");
  // "11/18" and "2026-11-18" -> month names, so the date matcher sees one form.
  s = s.replace(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g, function (m, y, mo, d) {
    return MONTH_NAMES[Number(mo) - 1] ? MONTH_NAMES[Number(mo) - 1] + ' ' + Number(d) + ' ' + y : m;
  });
  s = s.replace(/\b(\d{1,2})\/(\d{1,2})\b/g, function (m, mo, d) {
    return MONTH_NAMES[Number(mo) - 1] ? MONTH_NAMES[Number(mo) - 1] + ' ' + Number(d) : m;
  });
  s = s.replace(/'/g, '');
  for (const re of LEADING_PHRASES) s = s.replace(re, ' ');
  return s.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

/** Several names joined by "or" ("godzilla or godzilla minus zero"). */
export function splitNames(name) {
  const queries = [];
  let current = [];
  for (const w of name) {
    if (w === 'or') {
      if (current.length) queries.push(current.join(' '));
      current = [];
    } else {
      current.push(w);
    }
  }
  if (current.length) queries.push(current.join(' '));
  return queries;
}

/** "what's showing", "movies", "what's on": asking for the list. */
export function wantsList(tokens) {
  if (tokens.some(function (t) { return LIST_WORDS.indexOf(t) >= 0; })) return true;
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (tokens[i] === 'whats' && tokens[i + 1] === 'on') return true;
    if (tokens[i] === 'what' && tokens[i + 1] === 'on') return true;
    if (tokens[i] === 'what' && tokens[i + 1] === 'is' && tokens[i + 2] === 'on') return true;
  }
  return false;
}

/** "what can I watch", "what should we see", "what to watch": asking what is on, whatever else is said. */
export function asksWhatToWatch(text) {
  return /\bwhat\s+(can|could|should|shall|do|would)\s+(i|we|you)\s+(watch|see|catch)\b|\bwhat\s+to\s+(watch|see)\b|\bwhat\s+(is|s)\s+there\s+to\s+(watch|see)\b/i
    .test(String(text || '').replace(/['’]/g, ''));
}

/**
 * Join neighbouring words that a recognizer split but a name spells as one
 * ("mega mall" -> "megamall", "clay face" -> "clayface"), when the joined word
 * is one that `vocabulary` (an object of known words) contains.
 */
export function mergeSplits(tokens, vocabulary) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const joined = i + 1 < tokens.length ? tokens[i] + tokens[i + 1] : '';
    if (joined && vocabulary[joined] && !vocabulary[tokens[i] + ' ' + tokens[i + 1]]) {
      out.push(joined);
      i++;
    } else {
      out.push(tokens[i]);
    }
  }
  return out;
}
