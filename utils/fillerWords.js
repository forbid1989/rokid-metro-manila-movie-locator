/**
 * Words that wrap a request without naming anything. They are only trimmed from
 * the two ends of a phrase, never from its middle, so titles such as
 * "We Are Aliens" or "I Rarely Wake Up Dreaming" survive intact.
 */
// Words that wrap a request without naming anything. They are only trimmed from
// the two ends of the movie name, never from its middle, so titles such as
// "We Are Aliens" or "I Rarely Wake Up Dreaming" survive intact.
export const FILLER = [
  'hey', 'hi', 'ok', 'okay', 'rokid', 'please', 'can', 'could', 'would', 'you', 'will', 'do', 'does', 'did',
  'i', 'we', 'me', 'my', 'us', 'show', 'tell', 'give', 'search', 'find', 'look', 'looking', 'lookup',
  'up', 'for', 'where', 'when', 'what', 'whats', 'which', 'who', 'how', 'about', 'is', 'are', 'was',
  'were', 'be', 'the', 'a', 'an', 'any', 'all', 'some', 'movie', 'movies', 'film', 'films', 'theater',
  'theaters', 'theatre', 'theatres', 'cinema', 'cinemas', 'mall', 'malls', 'that', 'this', 'there',
  'here', 'showing', 'playing', 'screening', 'screenings', 'shows', 'time', 'times', 'showtime',
  'showtimes', 'schedule', 'schedules', 'listing', 'listings', 'now', 'currently', 'on', 'in', 'at',
  'near', 'nearby', 'around', 'of', 'to', 'from', 'by', 'with', 'out', 'right', 'watch', 'see', 'catch',
  'today', 'tonight', 'tomorrow',
  // "can you check what are the available movies", "what theaters have godzilla"
  'check', 'have', 'has', 'got', 'get', 'available', 'list', 'open', 'bring', 'pull',
  'if', 'whether', 'place', 'places', 'spot', 'spots', 'location', 'locations', 'showings', 'still', 'yet',
  // "nearest theaters to me"
  'nearest', 'closest', 'close',
  // contractions ("I'm looking for...", "what's...", "where's...")
  'im', 'ive', 'id', 'ill', 'youre', 'youd', 'thats', 'lets', 'dont', 'cant', 'wheres', 'hows', 'theres',
  'heres', 'isnt', 'arent', 'wasnt', 'whos', 'its',
  // polite and conversational padding
  'maybe', 'perhaps', 'actually', 'kindly', 'thanks', 'thank', 'hello', 'um', 'uh', 'wondering', 'curious',
  'listed', 'offer', 'offered', 'screened', 'and',
  // discourse markers ("friday then", "tomorrow instead")
  'then', 'also', 'too', 'instead', 'again', 'else', 'now', 'well', 'okay', 'it', 'they', 'them',
  // Tagalog / Taglish
  'ano', 'anong', 'ang', 'ng', 'ba', 'po', 'opo', 'may', 'mayroon', 'meron', 'saan', 'pwede', 'pwedeng',
  'manood', 'nasaan', 'yung', 'yong', 'mga', 'na', 'ay', 'sa', 'ko', 'namin', 'natin', 'pelikula', 'palabas',
  'sinehan', 'malapit', 'pinakamalapit', 'kalapit', 'gusto', 'tignan', 'tingnan', 'paki', 'pakitingnan',
  'mamaya', 'dito', 'diyan', 'doon',
  // "is the movie godzilla being shown in ..."
  'being', 'shown',
];


/** Indexes of the first and one-past-last words that are not filler. */
export function trimBounds(tokens) {
  let start = 0;
  let end = tokens.length;
  while (start < end && FILLER.indexOf(tokens[start]) >= 0) start++;
  while (end > start && FILLER.indexOf(tokens[end - 1]) >= 0) end--;
  return { start: start, end: end };
}

export function trimFiller(tokens) {
  const b = trimBounds(tokens);
  return tokens.slice(b.start, b.end);
}
