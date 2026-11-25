/**
 * Phrase set C: written after sets A and B had been used to tune the
 * classifier, and not looked at before its first run: the closest thing to an
 * unseen test. Row format as in setA.mjs. Clock: Tue 2026-11-17 10:00.
 */
const T = '2026-11-17';
const TOM = '2026-11-18';
const FRI = '2026-11-20';

export const SET_C = [
  // ── movie questions, odd word orders and lengths ──
  ['street fighter', { intent: 'find', movie: 'Street Fighter' }],
  ['showing today wicker', { intent: 'find', movie: 'Wicker', date: T }],
  ['clayface when', { intent: 'find', movie: 'Clayface' }],
  ['hello um I think there is a movie called the beast that I would like to see sometime, is that around', { intent: 'find', movie: 'The Beast' }],
  ['godzilla minus zero tomorrow at what time', { intent: 'find', movie: 'Godzilla Minus Zero', date: TOM }],
  ['can I still catch resident evil friday', { intent: 'find', movie: 'Resident Evil', date: FRI }],
  ['remember, the one with marian rivera', { intent: 'find', movie: 'Remember' }],
  ['how much longer is how to rob a bank on', { intent: 'find', movie: 'How to Rob a Bank' }],
  ['we are aliens bukas ng gabi', { intent: 'find', movie: 'We Are Aliens', date: TOM }],
  ['pee mak', { intent: 'find', movie: 'Pee Mak' }],
  ['whether two valid ids is still showing', { intent: 'find', movie: '2 Valid IDs' }],

  // ── lists ──
  ['what movies are there', { intent: 'list' }],
  ['movies today', { intent: 'list', date: T }],
  ["what's showing friday", { intent: 'list', date: FRI }],
  ['tell me all the movies that are on tomorrow', { intent: 'list', date: TOM }],
  ['show listings', { intent: 'list' }],
  ['what is on right now', { intent: 'list' }],

  // ── nearest ──
  ['theaters near me', { intent: 'theaters' }],
  ['nearby cinemas please', { intent: 'theaters' }],
  ['which malls have movie theaters close to where I am', { intent: 'theaters' }],
  ['i need to find the closest cinema', { intent: 'theaters' }],
  ['malapit na sinehan', { intent: 'theaters' }],

  // ── a cinema ──
  ['robinsons galleria ortigas', { intent: 'theater', theater: 'Robinsons Galleria Ortigas' }],
  ['the podium tomorrow', { intent: 'theater', theater: 'The Podium', date: TOM }],
  ['what movies does opus mall have today', { intent: 'theater', theater: 'Opus Mall', date: T }],
  ['gateway mall 2 what is showing', { intent: 'theater', theater: 'Gateway Mall 2' }],
  ['eastwood mall friday movies', { intent: 'theater', theater: 'Eastwood Mall', date: FRI }],
  ['what are the movies in sm megamall right now', { intent: 'theater', theater: 'SM MegaMall' }],
  ['pakitingnan ang palabas sa greenhills', { intent: 'theater', theater: 'Greenhills Cinemas' }],
  ['trinoma showings', { intent: 'theater', theater: 'TriNoma Mall' }],
  ['fisher mall malabon movies tomorrow', { intent: 'theater', theater: 'Fisher Mall Malabon', date: TOM }],

  // ── a movie at a cinema ──
  ['will street fighter be at the podium on friday', { intent: 'find', movie: 'Street Fighter', theater: 'The Podium', date: FRI }],
  ['wicker sm megamall tomorrow', { intent: 'find', movie: 'Wicker', theater: 'SM MegaMall', date: TOM }],
  ['check opus mall for clayface', { intent: 'find', movie: 'Clayface', theater: 'Opus Mall' }],
  ['is godzilla showing today in robinsons galleria ortigas', { intent: 'find', movie: 'Godzilla Minus Zero', theater: 'Robinsons Galleria Ortigas', date: T }],
  ['are there tickets for remember at gateway mall', { intent: 'find', movie: 'Remember', theater: 'Gateway Mall' }],
  ['pee mak at eastwood mall tonight', { intent: 'find', movie: 'Pee Mak', theater: 'Eastwood Mall', date: T }],
  ['saan ang resident evil sa trinoma', { intent: 'find', movie: 'Resident Evil', theater: 'TriNoma Mall' }],

  // ── a day ──
  ['saturday', { intent: 'date', date: '2026-11-21' }],
  // "next friday" said on a Tuesday means the coming Friday (see datePhrase.js).
  ['how about next friday', { intent: 'date', date: FRI }],
  ['and tomorrow', { intent: 'date', date: TOM }],

  // ── not for this app ──
  ['what time is it', { intent: 'nothing' }],
  ['navigate to the airport', { intent: 'nothing' }],
];
