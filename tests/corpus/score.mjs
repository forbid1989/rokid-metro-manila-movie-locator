/**
 * Score the classifier against a phrase set. Used by the corpus test and by
 * `node tools/evalIntents.mjs` for a readable report.
 */
import { interpret } from '../../utils/voiceCommand.js';
import { loadCatalog } from '../../utils/search.js';
import { loadDirectory } from '../../utils/theaters.js';
import { makeFakeGet, at, ORTIGAS } from '../helpers.mjs';

export const NOW = at('2026-11-17', 10, 0);

export async function makeContext() {
  const get = makeFakeGet();
  const catalog = await loadCatalog(get);
  const { theaters } = await loadDirectory(get);
  return { catalog, ctx: { directory: theaters, origin: ORTIGAS } };
}

/** What the classifier made of a phrase, in the same terms as the corpus. */
export function actualOf(cmd) {
  if (!cmd) return { intent: null };
  const out = { intent: cmd.intent };
  if (cmd.intent === 'find') {
    const r = cmd.resolution;
    // Having to ask "did you mean" is not understanding: only a match counts.
    out.movie = r && r.status === 'match' ? r.movie.title : (r && r.status === 'confirm' ? r.movie.title + ' (asks)' : (r && r.status === 'ambiguous' ? '(ambiguous)' : null));
  }
  if (cmd.theater) {
    out.theater = cmd.theater.status === 'match' ? cmd.theater.theater.name : (cmd.theater.status === 'confirm' ? cmd.theater.theater.name + ' (asks)' : '(ambiguous)');
  }
  if (cmd.date) out.date = cmd.date;
  return out;
}

export function matches(expected, actual) {
  // 'nothing': not about movies at all, so it should lead nowhere (no intent, or a title that matches nothing).
  if (expected.intent === 'nothing') return actual.intent === null || (actual.intent === 'find' && !actual.movie);
  if (actual.intent !== expected.intent) return false;
  if ('movie' in expected && (actual.movie || null) !== expected.movie) return false;
  if (expected.theater !== undefined && actual.theater !== expected.theater) return false;
  if (expected.theater === undefined && actual.theater) return false;
  if ((expected.date || null) !== (actual.date || null)) return false;
  return true;
}

export function score(rows, catalog, ctx) {
  const failures = [];
  for (const [say, expected] of rows) {
    const actual = actualOf(interpret([say], catalog, NOW, ctx));
    if (!matches(expected, actual)) failures.push({ say, expected, actual });
  }
  return { total: rows.length, passed: rows.length - failures.length, failures };
}
