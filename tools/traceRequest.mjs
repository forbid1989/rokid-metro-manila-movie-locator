// Show how a spoken request travels through the understanding code, step by step.
//   node --no-warnings tools/traceRequest.mjs "Where can I watch godzilla in theaters?"
// Uses the recorded fixtures (movie list and cinema directory), so it needs no network.
import { toWords } from '../utils/phrase.js';
import { extractDate } from '../utils/datePhrase.js';
import { extractTheater } from '../utils/theaterPhrase.js';
import { trimFiller } from '../utils/fillerWords.js';
import { resolveMovie } from '../utils/titleMatch.js';
import { classifyOne } from '../utils/classifier.js';
import { planAction } from '../utils/voiceFlow.js';
import { routeFor } from '../utils/pageRoutes.js';
import { routeRequest } from '../utils/askRouter.js';
import { makeContext, NOW } from '../tests/corpus/score.mjs';

const said = process.argv.slice(2).join(' ') || 'Where can I watch godzilla in theaters?';
const { catalog, ctx } = await makeContext();
const show = (label, value) => console.log(label.padEnd(34) + (typeof value === 'string' ? value : JSON.stringify(value)));

console.log('said: "' + said + '"   (clock: Tue 2026-11-17 10:00 Manila)\n');
const words = toWords(said);
show('phrase.js      toWords', words);
const d = extractDate(words, NOW);
show('datePhrase.js  extractDate', d);
const found = ctx.directory ? extractTheater(d.tokens, ctx.directory, { origin: ctx.origin }) : null;
show('theaterPhrase  extractTheater', found ? { words: found.words, status: found.resolution.status, theater: found.resolution.theater && found.resolution.theater.name } : null);
const rest = trimFiller(found ? found.tokens : d.tokens);
show('fillerWords    trimFiller', rest);
const movie = rest.length ? resolveMovie([rest.join(' ')], catalog) : null;
show('titleMatch     resolveMovie', movie ? { status: movie.status, title: movie.movie && movie.movie.title } : null);
const cmd = classifyOne(said, catalog, NOW, ctx);
show('classifier     classifyOne', cmd && {
  intent: cmd.intent, queries: cmd.queries, date: cmd.date,
  movie: cmd.resolution && cmd.resolution.movie && cmd.resolution.movie.title,
  theater: cmd.theater && cmd.theater.theater && cmd.theater.theater.name, confidence: cmd.confidence,
});
if (cmd) {
  const action = planAction(cmd, { movie: null, theater: null, date: null }, NOW);
  show('voiceFlow      planAction', { type: action.type, date: action.date });
  show('pageRoutes     routeFor', routeFor(action) || '(none)');
}
const r = routeRequest([said], { catalog, directory: ctx.directory, origin: ctx.origin }, NOW);
show('askRouter      routeRequest', r.kind === 'route' ? { kind: r.kind, url: r.url, echo: r.echo } : { kind: r.kind, message: r.message });
