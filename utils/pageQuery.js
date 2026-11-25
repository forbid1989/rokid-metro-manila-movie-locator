/**
 * Read the theater page's query leniently. Our own screens send `slug`,
 * `movieId` and `date`; the host assistant fills in the page's schema (`theater`,
 * `movie`, `date`) but, being a language model, may name things a little
 * differently (`cinema`, `mall`, `movie_name`), nest them under `data`, or send
 * the whole thing as a JSON string. Pure function.
 *
 *   readTheaterQuery(query) -> { slug, theater, movieId, movie, date }
 */

const THEATER_KEYS = ['theater', 'theatre', 'theatername', 'theater_name', 'cinema', 'cinemaname', 'cinema_name',
  'mall', 'mallname', 'mall_name', 'venue', 'location', 'place', 'name'];
const MOVIE_KEYS = ['movie', 'moviename', 'movie_name', 'movietitle', 'movie_title', 'title', 'film'];
const DATE_KEYS = ['date', 'day', 'when'];
const KNOWN = ['slug', 'movieid', 'movie_id'].concat(THEATER_KEYS, MOVIE_KEYS, DATE_KEYS);

// Lower-case every key and unwrap nested objects / JSON strings.
function flatten(query) {
  const out = {};
  const add = function (obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 3) return;
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        add(v, depth + 1);
      } else if (typeof v === 'string' && /^\s*\{/.test(v)) {
        try {
          add(JSON.parse(v), depth + 1);
        } catch (e) {
          out[key.toLowerCase()] = v;
        }
      } else if (v !== undefined && v !== null) {
        out[key.toLowerCase()] = v;
      }
    }
  };
  add(query, 0);
  return out;
}

// A language model asked to fill a required text field it has no value for writes
// "null", "none" or "N/A". That is not a name.
const NOT_A_VALUE = ['null', 'none', 'undefined', 'n/a', 'na', 'nil', 'unknown', 'any', 'all', 'not specified', 'unspecified', 'empty', '-'];

/** The text, trimmed, or '' when it is empty or only a stand-in for "nothing". */
export function cleanText(value) {
  if (typeof value !== 'string') return '';
  const t = value.trim();
  return NOT_A_VALUE.indexOf(t.toLowerCase()) >= 0 ? '' : t;
}

function firstText(flat, keys) {
  for (const k of keys) {
    const t = cleanText(flat[k]);
    if (t) return t;
  }
  return '';
}

export function readTheaterQuery(query) {
  const flat = flatten(query);
  let theater = firstText(flat, THEATER_KEYS);
  const movie = firstText(flat, MOVIE_KEYS);
  // An unrecognised text parameter is most likely the cinema.
  if (!theater) {
    for (const k of Object.keys(flat)) {
      if (KNOWN.indexOf(k) < 0 && cleanText(flat[k])) {
        theater = cleanText(flat[k]);
        break;
      }
    }
  }
  return {
    slug: cleanText(flat.slug),
    theater: theater,
    movieId: Number(flat.movieid || flat.movie_id) || 0,
    movie: movie,
    date: firstText(flat, DATE_KEYS),
  };
}

const RESULT_MOVIE_KEYS = ['name', 'moviename', 'movie_name', 'title', 'film', 'movie'];
const RESULT_THEATER_KEYS = THEATER_KEYS.filter(function (k) { return k !== 'name'; });

/**
 * Read the movie screens' query (results, and the movie list). Our own screens
 * send `movie=<numeric id>`; the host assistant sends `name` (or `movie`) as text,
 * and may add a `theater` when the user named a cinema.
 *
 *   readMovieQuery(query) -> { movieId, name, theater, date }
 */
export function readMovieQuery(query) {
  const flat = flatten(query);
  let movieId = 0;
  let name = '';
  for (const k of RESULT_MOVIE_KEYS) {
    const v = flat[k];
    if (k === 'movie' && /^\d+$/.test(String(v).trim())) {
      movieId = Number(v);
      continue;
    }
    const t = cleanText(typeof v === 'number' ? '' : v);
    if (t && !name) name = t;
  }
  return {
    movieId: movieId,
    name: name,
    theater: firstText(flat, RESULT_THEATER_KEYS),
    date: firstText(flat, DATE_KEYS),
  };
}

const ASK_KEYS = ['request', 'query', 'text', 'utterance', 'question', 'q', 'prompt', 'input', 'message', 'transcript', 'user_request', 'userrequest'];

/**
 * Read the Ask screen's query: what the user said, as given by the host
 * assistant. If it sent separate fields instead of the words (movie, theater,
 * date), put them back together as a sentence the classifier understands.
 *
 *   readAskQuery(query) -> { request }
 */
export function readAskQuery(query) {
  const flat = flatten(query);
  const said = firstText(flat, ASK_KEYS);
  if (said) return { request: said };
  const m = readMovieQuery(query);
  return { request: [m.name, m.theater ? 'at ' + m.theater : '', m.date].filter(Boolean).join(' ') };
}
