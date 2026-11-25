/**
 * Work out what the user wants from what they mentioned, not from how they
 * phrased it. Pure functions, no platform APIs.
 *
 *   classifyOne("could you maybe tell me if godzilla is on at megamall", catalog, nowMs, { directory, origin })
 *     -> { intent: 'find', queries: ['godzilla'], date, theater, resolution, confidence, ... }
 *
 * The method:
 *   1. Find the real things in the words, each by fuzzy match against live data:
 *      a day, a cinema (the directory), a movie (the catalog).
 *   2. Derive the intent from which of those were found, with a few general
 *      signals ("nearest", "movies", "theaters").
 *   3. Ignore every other word. Unknown words never need to be recognised.
 *
 * Result shape matches what voiceFlow.planAction() reads (see voiceCommand.js),
 * plus `confidence` (0..1) and `leftover` (words that explained nothing).
 */
import { extractDate } from './datePhrase.js';
import { resolveMovie } from './titleMatch.js';
import { trimFiller, FILLER } from './fillerWords.js';
import { extractTheater } from './theaterPhrase.js';
import { normalizeTokens } from './titleMatch.js';
import { THEATER_WORDS, NEAREST_WORDS, LIST_WORDS, STRONG_LIST_WORDS, DESCRIPTIVE_WORDS, toWords, splitNames, wantsList, asksWhatToWatch, mergeSplits } from './phrase.js';

const RANK = { match: 3, confirm: 2, ambiguous: 1, none: 0 };

// A movie reading is "solid" when it is a match, or one worth asking about.
const FULL_MIN = 0.8;
function solid(res) {
  if (!res) return false;
  if (res.status === 'match' || res.status === 'confirm') return true;
  return res.status === 'ambiguous' && !!res.candidates[0] && res.candidates[0].coverage >= FULL_MIN;
}

// Words that appear in cinema names and cities: noise or a place, never a movie title.
const placeCache = new WeakMap();
function placeWords(directory) {
  if (!directory) return {};
  let set = placeCache.get(directory);
  if (set) return set;
  set = {};
  for (const t of directory) {
    for (const w of normalizeTokens(t.name + ' ' + t.city)) set[w] = true;
  }
  placeCache.set(directory, set);
  return set;
}

const NOISE = {};
for (const w of FILLER.concat(LIST_WORDS, NEAREST_WORDS, THEATER_WORDS, DESCRIPTIVE_WORDS, ['or', 'and'])) NOISE[w] = true;

/**
 * The words that are not filler, signals or place names: what is left to be
 * a movie title that did not resolve. `tokens` are the already-trimmed words.
 */
function contentWords(tokens, directory) {
  const places = placeWords(directory);
  return tokens.filter(function (t) { return !NOISE[t] && !places[t]; });
}

// Every word of every title, for joining words a recognizer split ("clay face" -> "clayface").
const titleVocabCache = new WeakMap();
function titleVocabulary(catalog) {
  let vocab = titleVocabCache.get(catalog);
  if (vocab) return vocab;
  vocab = {};
  for (const m of catalog) for (const w of normalizeTokens(m.title)) vocab[w] = true;
  titleVocabCache.set(catalog, vocab);
  return vocab;
}

// "which theaters carry resident evil": every word of the title was said, plus
// words that are not part of it. That is the title named among other words, not
// a near miss ("godzilla minus one" is a near miss: "zero" was not said).
function titleNamedAmongWords(res, queries) {
  if (!res || res.status !== 'confirm' || !res.movie) return res;
  const said = {};
  for (const q of queries) for (const w of normalizeTokens(q)) said[w] = (said[w] || 0) + 1;
  for (const w of normalizeTokens(res.movie.title)) {
    if (!said[w]) return res;
    said[w]--;
  }
  return Object.assign({}, res, { status: 'match' });
}

function topScore(res) {
  return res && res.candidates && res.candidates[0] ? res.candidates[0].score : 0;
}

export function classifyOne(text, catalog, nowMs, ctx) {
  const words = toWords(text);
  if (!words.length) return null;
  const base = { transcript: String(text), queries: [], date: null, resolution: null, theater: null, weak: false, theaterWords: '', altQueries: [], leftover: [] };

  if (words.some(function (w) { return w === 'diagnostics' || w === 'diagnostic'; })) {
    return Object.assign(base, { intent: 'diagnostics', confidence: 1 });
  }

  const c = ctx || {};
  const d = extractDate(words, nowMs);
  const list = wantsList(words);
  const nearest = words.some(function (w) { return NEAREST_WORDS.indexOf(w) >= 0; });
  const theaterWord = words.some(function (w) { return THEATER_WORDS.indexOf(w) >= 0; });
  const strongList = words.some(function (w) { return STRONG_LIST_WORDS.indexOf(w) >= 0; });
  const askList = asksWhatToWatch(text);
  base.date = d.date;

  // 1. A cinema named in the words.
  let found = c.directory ? extractTheater(d.tokens, c.directory, { origin: c.origin }) : null;

  // A bare single word that is also a film ("aura") is the film.
  if (found && found.weak) {
    const alone = resolveMovie([found.words], catalog);
    if (alone.status === 'match') found = null;
  }

  const rest = found ? found.tokens : d.tokens;
  const nameTokens = trimFiller(rest);
  const queries = splitNames(nameTokens);
  // Words a recognizer split ("clay face") may be one title word; try that too.
  const joinedQueries = splitNames(mergeSplits(nameTokens, titleVocabulary(catalog)));

  // 2. A movie named in what is left.
  let movie = queries.length ? resolveMovie(queries, catalog) : null;
  if (movie && movie.status !== 'match' && joinedQueries.join('|') !== queries.join('|')) {
    const alt = resolveMovie(joinedQueries, catalog);
    if (RANK[alt.status] > RANK[movie.status]) movie = alt;
  }
  // Judged against all the words (before filler was trimmed): a title can start with filler ("How to Rob a Bank").
  movie = titleNamedAmongWords(movie, [rest.join(' ')]);
  const isSolid = solid(movie);

  if (found) {
    if (isSolid) {
      return Object.assign(base, {
        intent: 'find', queries: queries, resolution: movie, theater: found.resolution,
        confidence: confidenceOf(movie, found),
      });
    }
    // A cinema and nothing that is a movie: the rest is padding ("being listed in ...").
    return Object.assign(base, {
      intent: 'theater', theater: found.resolution,
      leftover: contentWords(nameTokens, c.directory),
      confidence: confidenceOf(null, found),
    });
  }

  if (isSolid) {
    return Object.assign(base, { intent: 'find', queries: queries, resolution: movie, confidence: confidenceOf(movie, null) });
  }

  // 3. No cinema, no movie: the general signals decide. Words that are neither
  // filler, signals nor place names would be an unknown title.
  const content = contentWords(nameTokens, c.directory);
  // "which cinema should I go to, the nearest one": cinemas and nearness are said outright,
  // so whatever else was said is padding.
  if (nearest && theaterWord) return Object.assign(base, { intent: 'theaters', date: null, leftover: content, confidence: content.length ? 0.7 : 0.9 });
  // "I'm bored, what can we watch": asking what is on, whatever else is said.
  if (askList) return Object.assign(base, { intent: 'list', leftover: content, confidence: content.length ? 0.7 : 0.9 });
  if (content.length) {
    return Object.assign(base, {
      intent: 'find', queries: queries, resolution: movie || resolveMovie(queries, catalog), leftover: content,
      confidence: 0.3,
    });
  }
  if (nearest && !strongList) return Object.assign(base, { intent: 'theaters', date: null, confidence: 0.8 });
  if (list) return Object.assign(base, { intent: 'list', confidence: 0.9 });
  if (theaterWord) return Object.assign(base, { intent: 'theaters', date: null, confidence: 0.7 });
  if (d.date) return Object.assign(base, { intent: 'date', confidence: 0.9 });
  return null;
}

function confidenceOf(movie, found) {
  let c = 0.95;
  if (movie) {
    if (movie.status === 'confirm') c = Math.min(c, 0.6);
    else if (movie.status === 'ambiguous') c = Math.min(c, 0.5);
  }
  if (found) {
    if (found.resolution.status === 'confirm') c = Math.min(c, 0.6);
    else if (found.resolution.status === 'ambiguous') c = Math.min(c, 0.5);
    if (found.weak) c = Math.min(c, 0.7);
  }
  return c;
}

/**
 * The recognizer returns several guesses; classify each and keep the one that
 * leads somewhere. Returns null when nothing in any guess is a command.
 */
export function classify(transcripts, catalog, nowMs, ctx) {
  let best = null;
  let bestRank = -1;
  let bestScore = -1;
  for (const t of transcripts || []) {
    const cmd = classifyOne(t, catalog, nowMs, ctx);
    if (!cmd) continue;
    if (cmd.intent !== 'find' && cmd.intent !== 'theater') {
      // Other commands: the first guess that parses wins unless a later one finds a movie or cinema.
      if (!best) best = cmd;
      continue;
    }
    let rank = 3;
    let score = 0;
    if (cmd.intent === 'find') {
      rank = RANK[cmd.resolution.status];
      score = topScore(cmd.resolution);
    }
    if (cmd.theater) {
      rank = Math.min(rank, RANK[cmd.theater.status]);
      score += topScore(cmd.theater);
    }
    if (rank > bestRank || (rank === bestRank && score > bestScore)) {
      best = cmd;
      bestRank = rank;
      bestScore = score;
    }
  }
  return best;
}
