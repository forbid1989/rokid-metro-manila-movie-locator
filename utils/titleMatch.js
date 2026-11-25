/**
 * Fuzzy matching of a spoken movie name against the catalog. Pure functions.
 *
 *   resolveMovie(queries, catalog) -> { status, movie?, candidates }
 *
 * status:
 *   'match'      confident: use `movie`
 *   'confirm'    one plausible movie that does not fully match what was said
 *                ("godzilla minus one" -> Godzilla Minus Zero): ask first
 *   'ambiguous'  several plausible movies: let the user pick from `candidates`
 *   'none'       nothing close
 *
 * `queries` is an array because "godzilla or godzilla minus zero" names two.
 * Each candidate is { movie, score, coverage }.
 *
 * Matching works on word sets, so it ignores word order, articles and
 * punctuation, treats spoken numbers as digits ("part two" = "part 2"), and
 * tolerates small spelling/recognition slips in longer words.
 */

const NUMBER_WORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10',
};
const STOPWORDS = ['the', 'a', 'an'];

const FULL_MIN = 0.8;        // every word said was found (allowing one small spelling slip)
const CANDIDATE_MIN = 0.5;   // below this a title is not worth mentioning
const CONFIRM_MIN = 0.6;     // lowest score we will offer as "did you mean"
const CONFIRM_GAP = 0.15;    // the best must beat the runner-up by this to be offered alone
const MAX_CANDIDATES = 5;

export function normalizeTokens(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // Piñas -> Pinas, Zoë -> Zoe
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(function (t) { return t in NUMBER_WORDS ? NUMBER_WORDS[t] : t; })
    .filter(function (t) { return STOPWORDS.indexOf(t) < 0; });
}

function levenshtein(a, b) {
  const prev = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length];
}

// 0..1 similarity of two words. Numbers must match exactly; short words must
// match exactly (one edit in a 3-letter word is a different word).
function tokenSimilarity(a, b, minLen) {
  if (a === b) return 1;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return 0;
  if (Math.min(a.length, b.length) < (minLen || 4)) return 0;
  const sim = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return sim >= 0.75 ? sim : 0;
}

export function scoreTokens(query, title, minLen) {
  if (!query.length || !title.length) return { score: 0, coverage: 0 };
  const used = [];
  let matched = 0;
  for (const q of query) {
    let best = -1;
    let bestSim = 0;
    for (let j = 0; j < title.length; j++) {
      if (used[j]) continue;
      const s = tokenSimilarity(q, title[j], minLen);
      if (s > bestSim) {
        bestSim = s;
        best = j;
      }
    }
    if (best >= 0) {
      used[best] = true;
      matched += bestSim;
    }
  }
  const coverage = matched / query.length;      // how much of what was said was found
  const exactness = matched / title.length;     // how much of the title was said
  return { score: 0.7 * coverage + 0.3 * exactness, coverage: coverage };
}

// Compare one normalised word list with every title.
function resolveTokens(q, catalog) {
  if (!q.length) return { status: 'none', candidates: [] };
  const qKey = q.join(' ');

  const scored = [];
  for (const movie of catalog) {
    const t = normalizeTokens(movie.title);
    if (t.join(' ') === qKey) return { status: 'match', movie: movie, candidates: [{ movie: movie, score: 1, coverage: 1 }] };
    const s = scoreTokens(q, t);
    if (s.score >= CANDIDATE_MIN) scored.push({ movie: movie, score: s.score, coverage: s.coverage });
  }
  // Best first; between equals, the newer film (the one people usually mean).
  scored.sort(function (a, b) {
    return (b.score - a.score) || String(b.movie.releaseDate || '').localeCompare(String(a.movie.releaseDate || ''));
  });
  if (!scored.length) return { status: 'none', candidates: [] };

  // Everything said was found in these titles: the user named a part of them.
  const full = scored.filter(function (c) { return c.coverage >= FULL_MIN; });
  if (full.length === 1) return { status: 'match', movie: full[0].movie, candidates: full };
  if (full.length > 1) return { status: 'ambiguous', candidates: full.slice(0, MAX_CANDIDATES) };

  const top = scored[0];
  const second = scored[1];
  if (top.score >= CONFIRM_MIN && (!second || top.score - second.score >= CONFIRM_GAP)) {
    return { status: 'confirm', movie: top.movie, candidates: [top] };
  }
  return { status: 'ambiguous', candidates: scored.slice(0, MAX_CANDIDATES) };
}

// The words said did not match any title as a whole, which usually means the
// request has words around the title that we do not know ("is godzilla out
// yet", "what places are showing godzilla"). Look for the longest run of words
// that does name one movie confidently.
function resolveSpans(q, catalog) {
  let best = null;
  for (let len = q.length - 1; len >= 1; len--) {
    if (best && len < best.len) break;
    for (let start = 0; start + len <= q.length; start++) {
      const span = q.slice(start, start + len);
      // A lone short word ("it", "out") is too weak to name a movie.
      if (len === 1 && span[0].length < 4) continue;
      const r = resolveTokens(span, catalog);
      if (r.status !== 'match') continue;
      const score = r.candidates[0].score;
      if (!best || len > best.len || score > best.score) best = { len: len, score: score, result: r };
    }
  }
  return best ? best.result : null;
}

function resolveOne(query, catalog) {
  const q = normalizeTokens(query);
  const whole = resolveTokens(q, catalog);
  // A confident answer stands. So does a genuinely ambiguous one (several titles
  // contain everything that was said). Only when no title explains the words
  // do we look for a title inside them.
  const unexplained = whole.status === 'none' ||
    (whole.status === 'ambiguous' && !whole.candidates.some(function (c) { return c.coverage >= FULL_MIN; }));
  if (!unexplained) return whole;
  return resolveSpans(q, catalog) || whole;
}

const RANK = { match: 3, confirm: 2, ambiguous: 1, none: 0 };

/** Resolve one or more spoken names (alternatives joined by "or"). */
export function resolveMovie(queries, catalog) {
  const results = (queries || []).map(function (q) { return resolveOne(q, catalog); });
  if (!results.length) return { status: 'none', candidates: [] };

  // Several names that all resolve confidently to the same film are one answer;
  // to different films, the user has to choose.
  const matches = results.filter(function (r) { return r.status === 'match'; });
  const distinct = [];
  for (const r of matches) {
    if (!distinct.some(function (c) { return c.movie.id === r.movie.id; })) distinct.push(r.candidates[0]);
  }
  if (distinct.length === 1 && matches.length === results.filter(function (r) { return r.status !== 'none'; }).length) {
    return { status: 'match', movie: distinct[0].movie, candidates: distinct };
  }
  if (distinct.length > 1) return { status: 'ambiguous', candidates: distinct.slice(0, MAX_CANDIDATES) };

  results.sort(function (a, b) {
    const d = RANK[b.status] - RANK[a.status];
    if (d) return d;
    return (b.candidates[0] ? b.candidates[0].score : 0) - (a.candidates[0] ? a.candidates[0].score : 0);
  });
  return results[0];
}
