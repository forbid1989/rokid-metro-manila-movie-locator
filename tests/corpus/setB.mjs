/**
 * Phrase set B: written AFTER the classifier was tuned on set A, without
 * looking at how it behaves on these, to estimate how it copes with wording it
 * has not been shaped around. Same row format as set A (see setA.mjs).
 * Clock: Tue 2026-11-17 10:00.
 */
const T = '2026-11-17';
const TOM = '2026-11-18';
const FRI = '2026-11-20';

export const SET_B = [
  // ── a movie ──
  ['hi there could you please let me know whether clayface is showing anywhere', { intent: 'find', movie: 'Clayface' }],
  ["my friend keeps telling me to watch resident evil, where's it on", { intent: 'find', movie: 'Resident Evil' }],
  ['wala bang wicker ngayon', { intent: 'find', movie: 'Wicker', date: T }],
  ['street fighter schedule for friday please', { intent: 'find', movie: 'Street Fighter', date: FRI }],
  ['when does the beast start playing', { intent: 'find', movie: 'The Beast' }],
  ['i want to know if there are any showings for we are aliens', { intent: 'find', movie: 'We Are Aliens' }],
  ['dune part 2', { intent: 'find', movie: 'Dune: Part Two' }],
  ['how to rob a bank tomorrow night', { intent: 'find', movie: 'How to Rob a Bank', date: TOM }],
  ['is pee mak available', { intent: 'find', movie: 'Pee Mak' }],
  ['pwede ba manood ng the cat in the hat bukas', { intent: 'find', movie: 'The Cat in the Hat', date: TOM }],
  ['please find godzilla minus zero for me', { intent: 'find', movie: 'Godzilla Minus Zero' }],
  ['just wondering about two valid ids', { intent: 'find', movie: '2 Valid IDs' }],
  ['where can we see remember on the 20th', { intent: 'find', movie: 'Remember', date: FRI }],
  ['is dune showing', { intent: 'find', movie: 'Dune' }],

  // ── what is on ──
  ["what's showing tomorrow", { intent: 'list', date: TOM }],
  ['what are the available movies today', { intent: 'list', date: T }],
  ['give me the list of movies', { intent: 'list' }],
  ['what is currently playing', { intent: 'list' }],
  ['pelikula ngayon', { intent: 'list', date: T }],
  ['any movies on friday', { intent: 'list', date: FRI }],
  ["i'm bored, what can we watch", { intent: 'list' }],
  ['films', { intent: 'list' }],

  // ── the nearest cinemas ──
  ['nearest theaters', { intent: 'theaters' }],
  ['what cinemas are near me', { intent: 'theaters' }],
  ['any movie houses nearby', { intent: 'theaters' }],
  ['list nearby malls with cinemas', { intent: 'theaters' }],
  ['sinehan malapit sa akin', { intent: 'theaters' }],
  ['where can I find a cinema close by', { intent: 'theaters' }],

  // ── what a cinema is showing ──
  ['what movies are showing at the sm megamall tomorrow', { intent: 'theater', theater: 'SM MegaMall', date: TOM }],
  ["i'd like to see the movie list for robinsons galleria ortigas", { intent: 'theater', theater: 'Robinsons Galleria Ortigas' }],
  ['podium schedule', { intent: 'theater', theater: 'The Podium' }],
  ["what's the movie line up in greenhills cinemas", { intent: 'theater', theater: 'Greenhills Cinemas' }],
  ['movies being shown at gateway mall today', { intent: 'theater', theater: 'Gateway Mall', date: T }],
  ['can you tell me what is playing in eastwood on friday', { intent: 'theater', theater: 'Eastwood Mall', date: FRI }],
  ['sa opus mall ano ang palabas', { intent: 'theater', theater: 'Opus Mall' }],
  ['what do they have at sm megamall', { intent: 'theater', theater: 'SM MegaMall' }],
  ['robinsons galleria ortigas movies', { intent: 'theater', theater: 'Robinsons Galleria Ortigas' }],
  ['show times for the podium tomorrow', { intent: 'theater', theater: 'The Podium', date: TOM }],
  ['which movies are available at trinoma', { intent: 'theater', theater: 'TriNoma Mall' }],

  // ── a movie at a cinema ──
  ['is clayface available at sm megamall', { intent: 'find', movie: 'Clayface', theater: 'SM MegaMall' }],
  ['can I catch street fighter in the podium tomorrow', { intent: 'find', movie: 'Street Fighter', theater: 'The Podium', date: TOM }],
  ['godzilla showtimes at robinsons galleria ortigas', { intent: 'find', movie: 'Godzilla Minus Zero', theater: 'Robinsons Galleria Ortigas' }],
  ['is there a showing of the beast at eastwood mall tonight', { intent: 'find', movie: 'The Beast', theater: 'Eastwood Mall', date: T }],
  ['meron bang resident evil sa trinoma bukas', { intent: 'find', movie: 'Resident Evil', theater: 'TriNoma Mall', date: TOM }],
  ['does gateway mall have remember', { intent: 'find', movie: 'Remember', theater: 'Gateway Mall' }],
  ['I want to watch godzilla at megamall this friday', { intent: 'find', movie: 'Godzilla Minus Zero', theater: 'SM MegaMall', date: FRI }],
  ['wicker opus mall', { intent: 'find', movie: 'Wicker', theater: 'Opus Mall' }],
  ['pee mak showing in fisher mall malabon', { intent: 'find', movie: 'Pee Mak', theater: 'Fisher Mall Malabon' }],
  ['is godzilla minus zero showing at the sm mega mall', { intent: 'find', movie: 'Godzilla Minus Zero', theater: 'SM MegaMall' }],
  ["what's showing at robinsons gallery ortigas", { intent: 'theater', theater: 'Robinsons Galleria Ortigas' }],
  ["what's showing at the greenhill cinemas", { intent: 'theater', theater: 'Greenhills Cinemas' }],
  ['wicker at eastwood mal', { intent: 'find', movie: 'Wicker', theater: 'Eastwood Mall' }],

  // ── only a day ──
  ['tomorrow please', { intent: 'date', date: TOM }],
  ['what about the day after tomorrow', { intent: 'date', date: '2026-11-19' }],
  ['friday then', { intent: 'date', date: FRI }],
  ['on the twentieth', { intent: 'date', date: FRI }],

  // ── other ──
  ['diagnostic', { intent: 'diagnostics' }],
  ['set an alarm for seven', { intent: 'find', movie: null }],
  ['tell me a joke', { intent: 'find', movie: null }],
];
