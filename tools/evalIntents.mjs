// Print how the intent classifier does on each phrase set, with every miss.
//   node --no-warnings tools/evalIntents.mjs [setName ...]
import { makeContext, score } from '../tests/corpus/score.mjs';

const sets = {};
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['setA', 'setB', 'setC']) {
  try { sets[name] = (await import('../tests/corpus/' + name + '.mjs'))[name.replace('set', 'SET_')]; } catch (e) { /* set not present */ }
}
const { catalog, ctx } = await makeContext();
for (const [name, rows] of Object.entries(sets)) {
  const r = score(rows, catalog, ctx);
  console.log('\n' + name + ': ' + r.passed + '/' + r.total + ' (' + Math.round(100 * r.passed / r.total) + '%)');
  for (const f of r.failures) {
    console.log('  ✗ "' + f.say + '"\n      wanted ' + JSON.stringify(f.expected) + '\n      got    ' + JSON.stringify(f.actual));
  }
}
