/**
 * Fuzzy matching of a spoken cinema (mall) name against the directory. Pure
 * functions, built on the same word-set scoring as movie titles.
 *
 *   resolveTheater(queries, directory, { origin }) -> { status, theater?, candidates }
 *
 * status: 'match' | 'confirm' | 'ambiguous' | 'none' (as resolveMovie).
 * `origin` ({lat, lng}) orders equally good candidates nearest first.
 *
 * People shorten names: "Galleria", "Megamall", "Marikina", "SM North". Each
 * cinema therefore gets several spellings: its full name, the name without
 * generic words ("mall", "cinemas"), without brands ("SM", "Robinsons"), and a
 * few hand-written nicknames.
 */
import { normalizeTokens, scoreTokens } from './titleMatch.js';
import { haversineKm } from './geo.js';
import { mergeSplits } from './phrase.js';

const GENERIC = ['mall', 'malls', 'cinema', 'cinemas', 'theater', 'theaters', 'theatre', 'theatres', 'center', 'centre'];
const BRANDS = ['sm', 'robinsons', 'ayala', 'megaworld', 'city', 'vista', 'walter', 'mart', 'citymall'];

// Nicknames by slug. Only what the automatic spellings miss.
export const ALIASES = {
  'sm-megamall': ['mega mall', 'mega'],
  'robinsons-galleria-ortigas': ['galleria', 'robinsons ortigas', 'galleria ortigas'],
  'ortigas-cinemas-estancia': ['ortigas cinemas', 'estancia', 'capitol commons'],
  'shangri-la-plaza': ['shangrila', 'shang', 'shangri la'],
  'sm-mall-of-asia': ['moa', 'mall of asia', 'sm moa'],
  'trinoma-mall': ['tri noma', 'trinoma'],
  'sm-city-north-edsa': ['sm north', 'north edsa', 'sm north edsa'],
  'up-town-center': ['up town center', 'up town', 'ayala up town', 'up town mall'],
  'glorietta-4': ['glorietta'],
  'greenhills-cinemas': ['greenhills', 'greenhills mall', 'greenhills cinema'],
  'sm-city-sta-mesa': ['sta mesa', 'santa mesa', 'sm sta mesa', 'sm santa mesa'],
  'sm-light-mall': ['light mall', 'light residences'],
  'power-plant-mall': ['power plant', 'rockwell'],
  'bonifacio-high-street': ['high street', 'bgc high street'],
  'sm-aura-premier': ['aura', 'sm aura'],
  'sm-city-east-ortigas': ['east ortigas', 'sm east ortigas'],
  'sm-city-manila': ['sm manila'],
  'robinsons-place-manila': ['robinsons manila', 'place manila'],
  'sm-city-san-lazaro': ['san lazaro', 'sm san lazaro'],
  'sm-city-fairview': ['fairview', 'sm fairview'],
  'sm-city-bf-paranaque': ['bf paranaque', 'sm bf', 'sm bf paranaque'],
  'sm-southmall': ['south mall', 'sm south mall'],
  'venice-grand-canal-mall': ['venice', 'venice grand canal', 'grand canal', 'venice mall', 'mckinley hill'],
  'cash-and-carry': ['cash n carry', 'cash and carry mall'],
  'ayala-malls-cloverleaf': ['cloverleaf', 'clover leaf', 'balintawak'],
  'lucky-chinatown-mall': ['lucky chinatown', 'chinatown', 'binondo'],
  'newport-mall': ['newport', 'newport city', 'resorts world'],
  's-maison': ['es maison', 'maison', 'conrad'],
  'ayala-fairview-terraces': ['fairview terraces', 'ayala fairview', 'terraces'],
  'alabang-town-center': ['atc', 'alabang', 'alabang town'],
  'festival-supermall': ['festival', 'festival mall', 'festival supermall', 'filinvest'],
  'sm-city-san-jose-del-monte': ['sjdm', 'san jose del monte', 'sm sjdm'],
  'robinsons-galleria-south': ['galleria south', 'robinsons south'],
  'sm-city-santa-rosa': ['sta rosa', 'santa rosa', 'sm sta rosa', 'sm santa rosa'],
  'vista-mall-sta-rosa': ['sta rosa', 'santa rosa', 'vista sta rosa'],
  'vista-mall-general-trias': ['gen trias', 'gentri', 'vista gentri'],
  'robinsons-place-general-trias': ['gen trias', 'gentri', 'robinsons gentri'],
  'sm-city-dasmarinas': ['dasma', 'dasmarinas', 'sm dasma'],
  'sm-city-sto-tomas': ['sto tomas', 'santo tomas', 'sm sto tomas'],
  'ayala-malls-manila-bay': ['manila bay', 'ayala manila bay'],
  'robinsons-place-las-pinas': ['las pinas', 'robinsons las pinas'],
  'sm-center-muntinlupa': ['muntinlupa', 'sm muntinlupa'],
  'sm-city-pampanga': ['sm pampanga'],
  'robinsons-starmills-pampanga': ['starmills', 'star mills'],
  'ayala-malls-nuvali': ['nuvali', 'ayala nuvali'],
  'ayala-malls-circuit': ['circuit', 'circuit makati', 'ayala circuit'],
  'ayala-malls-feliz': ['feliz'],
  'sta-lucia-east-grand-mall': ['sta lucia', 'santa lucia', 'sta lucia mall', 'east grand mall'],
  'marquee-mall': ['marquee', 'marquee mall', 'angeles'],
  'clark-cityfront-mall': ['cityfront', 'clark cityfront'],
};

const FULL_MIN = 0.8;
const CANDIDATE_MIN = 0.5;
const CONFIRM_MIN = 0.6;
const CONFIRM_GAP = 0.15;
const MAX_CANDIDATES = 5;

function without(tokens, drop) {
  const kept = tokens.filter(function (t) { return drop.indexOf(t) < 0; });
  return kept.length ? kept : tokens;
}

const indexCache = new WeakMap();

function buildIndex(directory) {
  let index = indexCache.get(directory);
  if (index) return index;
  index = directory.map(function (theater) {
    const full = normalizeTokens(theater.name);
    const core = without(full, GENERIC);
    const brandless = without(core, BRANDS);
    const variants = [];
    const add = function (tokens) {
      if (tokens.length && !variants.some(function (v) { return v.join(' ') === tokens.join(' '); })) variants.push(tokens);
    };
    add(core);
    add(brandless);
    // Spellings that count as "the whole name" (so 'ortigas cinemas' can mean Estancia
    // while a bare 'ortigas' stays ambiguous).
    const fulls = [full.join(' ')];
    for (const alias of ALIASES[theater.slug] || []) {
      const tokens = normalizeTokens(alias);
      add(tokens);
      fulls.push(tokens.join(' '));
    }
    return { theater: theater, fulls: fulls, variants: variants };
  });
  // Every word any cinema is spelled with, for joining words a recognizer split ("mega mall" -> "megamall").
  const vocab = {};
  for (const e of index) for (const v of e.variants) for (const w of v) vocab[w] = true;
  index.vocab = vocab;
  indexCache.set(directory, index);
  return index;
}

function nearestFirst(a, b, origin) {
  if (!origin) return 0;
  return haversineKm(origin, a.theater) - haversineKm(origin, b.theater);
}

/** Candidates for one list of normalised words. `exactOnly` skips fuzzy matching. */
const RANKS = { match: 3, confirm: 2, ambiguous: 1, none: 0 };

// Try the words as said, and with split words joined ("mega mall" -> "megamall");
// keep the better reading, preferring the words as said when they are as good.
function resolveTokens(q, index, options) {
  const as = resolveWords(q, index, options);
  if (as.status === 'match') return as;
  const joined = mergeSplits(q, index.vocab || {});
  if (joined.length === q.length) return as;
  const alt = resolveWords(joined, index, options);
  return RANKS[alt.status] > RANKS[as.status] ? alt : as;
}

function resolveWords(q, index, options) {
  const o = options || {};
  const core = without(q, GENERIC);
  // Only generic words ("the mall", "cinema"): nothing to go on.
  if (!q.length || (core.length === q.length && q.every(function (t) { return GENERIC.indexOf(t) >= 0; }))) {
    return { status: 'none', candidates: [] };
  }
  const qFull = q.join(' ');
  const qCore = core.join(' ');

  // 1. The whole name, as written.
  const named = index.filter(function (e) { return e.fulls.indexOf(qFull) >= 0; });
  if (named.length === 1) return matched(named[0].theater);

  // 2. A shortened name that is exactly one of the cinema's spellings.
  const short = index.filter(function (e) {
    return e.variants.some(function (v) { return v.join(' ') === qCore; });
  });
  if (short.length === 1) return matched(short[0].theater);
  if (short.length > 1) {
    short.sort(function (a, b) { return nearestFirst(a, b, o.origin); });
    return { status: 'ambiguous', candidates: short.slice(0, MAX_CANDIDATES).map(function (e) { return { theater: e.theater, score: 1, coverage: 1 }; }) };
  }
  if (o.exactOnly) return { status: 'none', candidates: [] };

  // 3. Fuzzy: every word said found in a spelling.
  const scored = [];
  for (const e of index) {
    let best = { score: 0, coverage: 0 };
    for (const v of e.variants) {
      // Short words must be exact here: "mega" is not "mesa".
      const s = scoreTokens(core, v, 5);
      if (s.score > best.score) best = s;
    }
    if (best.score >= CANDIDATE_MIN) scored.push({ theater: e.theater, score: best.score, coverage: best.coverage });
  }
  scored.sort(function (a, b) {
    return (b.score - a.score) || nearestFirst(a, b, o.origin);
  });
  if (!scored.length) return { status: 'none', candidates: [] };

  const full = scored.filter(function (c) { return c.coverage >= FULL_MIN; });
  if (full.length === 1) return { status: 'match', theater: full[0].theater, candidates: full };
  if (full.length > 1) return { status: 'ambiguous', candidates: full.slice(0, MAX_CANDIDATES) };

  const top = scored[0];
  const second = scored[1];
  if (top.score >= CONFIRM_MIN && (!second || top.score - second.score >= CONFIRM_GAP)) {
    return { status: 'confirm', theater: top.theater, candidates: [top] };
  }
  return { status: 'ambiguous', candidates: scored.slice(0, MAX_CANDIDATES) };
}

function matched(theater) {
  return { status: 'match', theater: theater, candidates: [{ theater: theater, score: 1, coverage: 1 }] };
}

const RANK = { match: 3, confirm: 2, ambiguous: 1, none: 0 };

/** Resolve one or more spoken names (the recognizer's alternatives). */
export function resolveTheater(queries, directory, options) {
  const index = buildIndex(directory || []);
  const results = (queries || []).map(function (q) { return resolveTokens(normalizeTokens(q), index, options); });
  if (!results.length) return { status: 'none', candidates: [] };

  // Alternatives that all settle on the same cinema are one answer.
  const matches = results.filter(function (r) { return r.status === 'match'; });
  const distinct = [];
  for (const r of matches) {
    if (!distinct.some(function (c) { return c.theater.slug === r.theater.slug; })) distinct.push(r.candidates[0]);
  }
  if (distinct.length === 1) return { status: 'match', theater: distinct[0].theater, candidates: distinct };
  if (distinct.length > 1) return { status: 'ambiguous', candidates: distinct.slice(0, MAX_CANDIDATES) };

  results.sort(function (a, b) {
    const d = RANK[b.status] - RANK[a.status];
    if (d) return d;
    return (b.candidates[0] ? b.candidates[0].score : 0) - (a.candidates[0] ? a.candidates[0].score : 0);
  });
  return results[0];
}

/**
 * Find a cinema named somewhere inside a sentence (already normalised to
 * words). Returns { start, end, result } for the longest run of words that
 * names one cinema, or null. Strict on purpose, because ordinary words must not
 * be mistaken for a place: a single word has to be exactly one of the cinema's
 * spellings, and longer runs have to match nearly every word.
 */
export function findTheaterInTokens(tokens, directory, options) {
  const index = buildIndex(directory || []);
  // Work on normalised words (no "the", "two" -> "2") but report positions in the original.
  const q = [];
  const at = [];
  (tokens || []).forEach(function (t, i) {
    const n = normalizeTokens(t);
    if (n.length) {
      q.push(n[0]);
      at.push(i);
    }
  });
  for (let len = Math.min(q.length, 6); len >= 1; len--) {
    let best = null;
    for (let start = 0; start + len <= q.length; start++) {
      const span = q.slice(start, start + len);
      // "theaters carry" has one real word ("carry"): it must be exactly a cinema's word, not a near one.
      const real = span.filter(function (t) { return GENERIC.indexOf(t) < 0; }).length;
      const r = resolveTokens(span, index, Object.assign({}, options, { exactOnly: real <= 1 }));
      if (r.status !== 'match') continue;
      const score = r.candidates[0].score;
      if (!best || score > best.score) best = { start: at[start], end: at[start + len - 1] + 1, result: r, score: score };
    }
    if (best) return { start: best.start, end: best.end, result: best.result };
  }
  return null;
}
