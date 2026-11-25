/**
 * Phrase set A: written BEFORE the entity-first classifier was run on it, as a
 * blind measure of how well it copes with wording it was not built around.
 * (After the first run it was used to find general weaknesses, so it is no
 * longer an unbiased measure; set B was written after that.)
 *
 * Rows: [what is said, what it should mean]. The clock is Tue 2026-11-17 10:00.
 *   intent   find | list | theaters | theater | date | diagnostics
 *   movie    the title it should resolve to; null = names no known movie
 *   theater  the cinema it should resolve to
 *   date     YYYY-MM-DD; omitted = no day said
 */
const T = '2026-11-17';
const TOM = '2026-11-18';
const FRI = '2026-11-20';

export const SET_A = [
  // ── a movie, asked about in all sorts of ways ──
  ['hey rokid, any chance you could tell me where street fighter is playing', { intent: 'find', movie: 'Street Fighter' }],
  ['I was wondering if wicker is still in cinemas', { intent: 'find', movie: 'Wicker' }],
  ["yo what's the deal with clayface, is it out", { intent: 'find', movie: 'Clayface' }],
  ['looking to catch the beast this weekend', { intent: 'find', movie: 'The Beast' }],
  ['which theaters carry resident evil', { intent: 'find', movie: 'Resident Evil' }],
  ['showtimes please for how to rob a bank', { intent: 'find', movie: 'How to Rob a Bank' }],
  ['is there pee mak anywhere near me', { intent: 'find', movie: 'Pee Mak' }],
  ['can i see dune part two tomorrow night', { intent: 'find', movie: 'Dune: Part Two', date: TOM }],
  ['godzilla minus zero showing times today', { intent: 'find', movie: 'Godzilla Minus Zero', date: T }],
  ['do you know when we are aliens starts', { intent: 'find', movie: 'We Are Aliens' }],
  ["I'd love to watch the cat in the hat with my kids", { intent: 'find', movie: 'The Cat in the Hat' }],
  ['playing now: remember', { intent: 'find', movie: 'Remember' }],
  ['show me where I can watch two valid ids', { intent: 'find', movie: '2 Valid IDs' }],
  ['sine sindak seven', { intent: 'find', movie: 'Sine Sindak 7 - VHS' }],
  ['is godzilla out yet', { intent: 'find', movie: 'Godzilla Minus Zero' }],
  ['saan pwede manood ng godzilla', { intent: 'find', movie: 'Godzilla Minus Zero' }],
  ['meron bang street fighter bukas', { intent: 'find', movie: 'Street Fighter', date: TOM }],
  ['where is godzila showing', { intent: 'find', movie: 'Godzilla Minus Zero' }],
  ['street fiter tomorrow', { intent: 'find', movie: 'Street Fighter', date: TOM }],

  // ── what is on, with no movie or cinema named ──
  ["what's on", { intent: 'list' }],
  ['anything good playing tonight', { intent: 'list', date: T }],
  ['what movies can I watch today', { intent: 'list', date: T }],
  ['list the movies for friday', { intent: 'list', date: FRI }],
  ["what's playing at the cinemas right now", { intent: 'list' }],
  ['any new movies out this week', { intent: 'list' }],
  ['what films are showing on november 20', { intent: 'list', date: FRI }],
  ['movies tomorrow', { intent: 'list', date: TOM }],
  ["show me everything that's playing", { intent: 'list' }],
  ['what is there to watch', { intent: 'list' }],
  ['ano ang palabas ngayon', { intent: 'list', date: T }],

  // ── the nearest cinemas ──
  ["where's the nearest cinema", { intent: 'theaters' }],
  ['cinemas close to me', { intent: 'theaters' }],
  ['is there a mall with a movie theater around here', { intent: 'theaters' }],
  ['nearest sinehan', { intent: 'theaters' }],
  ['give me a list of theaters nearby', { intent: 'theaters' }],
  ['what theaters are in my area', { intent: 'theaters' }],
  ['closest place to watch a movie', { intent: 'theaters' }],
  ['which cinema should I go to, the nearest one', { intent: 'theaters' }],
  ['find me a theater', { intent: 'theaters' }],
  ['show nearby malls', { intent: 'theaters' }],

  // ── what a cinema is showing ──
  ["what's playing at robinsons galleria", { intent: 'theater', theater: 'Robinsons Galleria Ortigas' }],
  ['movies at the podium today', { intent: 'theater', theater: 'The Podium', date: T }],
  ['what movies are being listed in sm megamall', { intent: 'theater', theater: 'SM MegaMall' }],
  ['what are the movies being shown in robinsons galleria ortigas', { intent: 'theater', theater: 'Robinsons Galleria Ortigas' }],
  ['can you give me the schedule at eastwood mall tomorrow', { intent: 'theater', theater: 'Eastwood Mall', date: TOM }],
  ["what's the lineup at opus mall", { intent: 'theater', theater: 'Opus Mall' }],
  ['megamall tonight', { intent: 'theater', theater: 'SM MegaMall', date: T }],
  ['what is showing at gateway mall 2 on friday', { intent: 'theater', theater: 'Gateway Mall 2', date: FRI }],
  ['anong palabas sa megamall ngayon', { intent: 'theater', theater: 'SM MegaMall', date: T }],
  ['sa greenhills ano ang mga palabas bukas', { intent: 'theater', theater: 'Greenhills Cinemas', date: TOM }],
  ["I'm at trinoma, what's on", { intent: 'theater', theater: 'TriNoma Mall' }],
  ['check the schedule for fisher mall malabon', { intent: 'theater', theater: 'Fisher Mall Malabon' }],
  ['everything showing in galleria', { intent: 'theater', theater: 'Robinsons Galleria Ortigas' }],
  ['list all movies at the podium please', { intent: 'theater', theater: 'The Podium' }],
  ['tell me the movies in eastwood', { intent: 'theater', theater: 'Eastwood Mall' }],
  ["can you check what's playing at sm megamall", { intent: 'theater', theater: 'SM MegaMall' }],
  ['what can I watch at the podium', { intent: 'theater', theater: 'The Podium' }],

  // ── a movie at a cinema ──
  ['is godzilla showing at sm megamall', { intent: 'find', movie: 'Godzilla Minus Zero', theater: 'SM MegaMall' }],
  ['does the podium have street fighter tonight', { intent: 'find', movie: 'Street Fighter', theater: 'The Podium', date: T }],
  ['can you check if wicker is playing in robinsons galleria ortigas tomorrow', { intent: 'find', movie: 'Wicker', theater: 'Robinsons Galleria Ortigas', date: TOM }],
  ['may godzilla ba sa megamall ngayon', { intent: 'find', movie: 'Godzilla Minus Zero', theater: 'SM MegaMall', date: T }],
  ['godzilla at eastwood', { intent: 'find', movie: 'Godzilla Minus Zero', theater: 'Eastwood Mall' }],
  ["I'd like to see clayface at opus mall on friday", { intent: 'find', movie: 'Clayface', theater: 'Opus Mall', date: FRI }],
  ['is the movie remember being shown in gateway mall', { intent: 'find', movie: 'Remember', theater: 'Gateway Mall' }],
  ['any showings of resident evil at trinoma', { intent: 'find', movie: 'Resident Evil', theater: 'TriNoma Mall' }],
  ['megamall, godzilla', { intent: 'find', movie: 'Godzilla Minus Zero', theater: 'SM MegaMall' }],
  ['what time is the beast at the podium', { intent: 'find', movie: 'The Beast', theater: 'The Podium' }],
  ['is wicker showing at mega mall', { intent: 'find', movie: 'Wicker', theater: 'SM MegaMall' }],
  ['godzilla at the poddium', { intent: 'find', movie: 'Godzilla Minus Zero', theater: 'The Podium' }],

  // ── only a day ──
  ['tomorrow', { intent: 'date', date: TOM }],
  ['how about friday', { intent: 'date', date: FRI }],
  ['what about next monday', { intent: 'date', date: '2026-11-23' }],
  ['bukas', { intent: 'date', date: TOM }],
  ['the 20th', { intent: 'date', date: FRI }],
  ['and on november 21', { intent: 'date', date: '2026-11-21' }],

  // ── other ──
  ['open diagnostics', { intent: 'diagnostics' }],
  ['is avatar four showing', { intent: 'find', movie: null }],
  ['where can i watch interstellar two', { intent: 'find', movie: null }],
  ['play some music', { intent: 'find', movie: null }],
  ["what's the weather like", { intent: 'find', movie: null }],
];
