/**
 * The page URLs for what a spoken command (voiceFlow.planAction) or a tap asks
 * for, in one place so every page navigates the same way. Pure functions.
 *
 * Page queries (what each page reads in onLoad):
 *   results   movie=<id>  [date]
 *   theater   slug=<cinema slug>  [movieId=<id>]  [date]   (the host assistant sends theater=<name as said>, movie=<title as said>)
 *   choose    mode=confirm|pick  date  ids=<movie ids>  [theater=<slug to carry on with>]
 *             kind=theater  mode  date  slugs=<cinema slugs>  [movie=<id to carry on with>]
 *   movies    [date]
 */

export function resultsUrl(movieId, date) {
  return '/pages/results/results?movie=' + movieId + '&date=' + date;
}

/** The results page for a movie named as spoken (it works out which movie). */
export function resultsByNameUrl(name, date) {
  return '/pages/results/results?name=' + encodeURIComponent(name) + '&date=' + date;
}

/** The theater page for a cinema (and optionally a movie) named as spoken. */
export function theaterByNameUrl(theater, movie, date) {
  return '/pages/theater/theater?theater=' + encodeURIComponent(theater) +
    (movie ? '&movie=' + encodeURIComponent(movie) : '') + '&date=' + date;
}

export function theaterUrl(slug, date, movieId) {
  return '/pages/theater/theater?slug=' + slug + '&date=' + date + (movieId ? '&movieId=' + movieId : '');
}

export function chooseMoviesUrl(mode, date, movies, theaterSlug) {
  return '/pages/choose/choose?mode=' + mode + '&date=' + date +
    '&ids=' + movies.map(function (m) { return m.id; }).join(',') +
    (theaterSlug ? '&theater=' + theaterSlug : '');
}

export function chooseTheatersUrl(mode, date, theaters, movieId) {
  return '/pages/choose/choose?kind=theater&mode=' + mode + '&date=' + date +
    '&slugs=' + theaters.map(function (t) { return t.slug; }).join(',') +
    (movieId ? '&movie=' + movieId : '');
}

export const THEATERS_URL = '/pages/theaters/theaters';
export const DIAGNOSTICS_URL = '/pages/diagnostics/diagnostics';

export function moviesUrl(date) {
  return '/pages/movies/movies' + (date ? '?date=' + date : '');
}

/** The URL an action navigates to, or null for actions that are not navigation (toast). */
export function routeFor(action) {
  switch (action && action.type) {
    case 'search':
      return resultsUrl(action.movie.id, action.date);
    case 'theater':
      return theaterUrl(action.theater.slug, action.date);
    case 'theater-movie':
      return theaterUrl(action.theater.slug, action.date, action.movie.id);
    case 'theaters':
      return THEATERS_URL;
    case 'list':
      return moviesUrl(action.date);
    case 'diagnostics':
      return DIAGNOSTICS_URL;
    case 'choose':
      if (action.kind === 'theater') {
        return chooseTheatersUrl(action.mode, action.date, action.candidates, action.movie ? action.movie.id : 0);
      }
      return chooseMoviesUrl(action.mode, action.date, action.candidates,
        action.theater && action.theater.status === 'match' ? action.theater.theater.slug : '');
    default:
      return null;
  }
}
