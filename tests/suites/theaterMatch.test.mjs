import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheater, findTheaterInTokens, ALIASES } from '../../utils/theaterMatch.js';
import { loadDirectory } from '../../utils/theaters.js';
import { normalizeTokens } from '../../utils/titleMatch.js';
import { makeFakeGet, ORTIGAS } from '../helpers.mjs';

const { theaters: directory } = await loadDirectory(makeFakeGet());
const resolve = (...queries) => resolveTheater(queries, directory, { origin: ORTIGAS });
const nameOf = (r) => (r.theater ? r.theater.name : null);

test('every nickname points at a cinema that exists in the directory', () => {
  const slugs = new Set(directory.map((t) => t.slug));
  for (const slug of Object.keys(ALIASES)) assert.ok(slugs.has(slug), slug);
});

test('names people actually say find the right cinema', () => {
  for (const [said, expected] of [
    ['robinsons galleria ortigas', 'Robinsons Galleria Ortigas'],
    ['galleria', 'Robinsons Galleria Ortigas'],
    ['galleria ortigas', 'Robinsons Galleria Ortigas'],
    ['robinsons ortigas', 'Robinsons Galleria Ortigas'],
    ['sm megamall', 'SM MegaMall'],
    ['megamall', 'SM MegaMall'],
    ['mega mall', 'SM MegaMall'],
    ['the podium', 'The Podium'],
    ['podium', 'The Podium'],
    ['gateway mall', 'Gateway Mall'],
    ['gateway mall 2', 'Gateway Mall 2'],
    ['gateway mall two', 'Gateway Mall 2'],
    ['marikina', 'SM City Marikina'],
    ['sm marikina', 'SM City Marikina'],
    ['sm city marikina', 'SM City Marikina'],
    ['sm mall of asia', 'SM Mall of Asia'],
    ['moa', 'SM Mall of Asia'],
    ['trinoma', 'TriNoma Mall'],
    ['glorietta', 'Glorietta 4'],
    ['greenbelt', 'Greenbelt 3'],
    ['shangri la', 'Shangri-La Plaza'],
    ['shangri-la plaza', 'Shangri-La Plaza'],
    ['estancia', 'Ortigas Cinemas Estancia'],
    ['ortigas cinemas', 'Ortigas Cinemas Estancia'],
    ['fisher mall malabon', 'Fisher Mall Malabon'],
    ['fisher mall', 'Fisher Mall'],
    ['power plant', 'Power Plant'],
    ['sta mesa', 'SM Sta. Mesa'],
    ['santa mesa', 'SM Sta. Mesa'],
    ['up town center', 'Ayala U.P. Town Center'],
    ['eastwood', 'Eastwood Mall'],
    ['eastwood mall', 'Eastwood Mall'],
    ['opus', 'Opus Mall'],
    ['greenhills', 'Greenhills Cinemas'],
  ]) {
    const r = resolve(said);
    assert.equal(r.status, 'match', said);
    assert.equal(nameOf(r), expected, said);
  }
});

test('"the", "mall" and "cinema" do not change which cinema is meant', () => {
  assert.equal(nameOf(resolve('the sm megamall')), 'SM MegaMall');
  assert.equal(nameOf(resolve('opus mall cinema')), 'Opus Mall');
  assert.equal(nameOf(resolve('eastwood cinemas')), 'Eastwood Mall');
});

test('a small recognition slip still finds the cinema', () => {
  assert.equal(nameOf(resolve('robinsons galeria ortigas')), 'Robinsons Galleria Ortigas');
  assert.equal(nameOf(resolve('megamal')), 'SM MegaMall');
  assert.equal(nameOf(resolve('eastwod mall')), 'Eastwood Mall');
});

test('a brand or area that fits several cinemas is ambiguous, nearest first', () => {
  const robinsons = resolve('robinsons');
  assert.equal(robinsons.status, 'ambiguous');
  assert.equal(robinsons.candidates[0].theater.name, 'Robinsons Galleria Ortigas');
  assert.ok(robinsons.candidates.length > 1 && robinsons.candidates.length <= 5);
  assert.ok(robinsons.candidates.every((c) => /robinsons/i.test(c.theater.name)));

  const sm = resolve('sm');
  assert.equal(sm.status, 'ambiguous');

  const ortigas = resolve('ortigas');
  assert.equal(ortigas.status, 'ambiguous');
  const names = ortigas.candidates.map((c) => c.theater.name);
  assert.ok(names.includes('Robinsons Galleria Ortigas') && names.includes('Ortigas Cinemas Estancia'));
});

test('ordering follows the origin', () => {
  const fromMalabon = resolveTheater(['robinsons'], directory, { origin: { lat: 14.66, lng: 120.96 } });
  assert.notEqual(fromMalabon.candidates[0].theater.name, 'Robinsons Galleria Ortigas');
});

test('an exact name beats longer names that contain it', () => {
  assert.equal(nameOf(resolve('gateway mall')), 'Gateway Mall'); // not Gateway Mall 2
  assert.equal(nameOf(resolve('fisher mall')), 'Fisher Mall');   // not Fisher Mall Malabon
});

test('nonsense, movie titles and generic words match nothing', () => {
  for (const said of ['zzzz qqqq', 'godzilla', 'the cat in the hat', 'the weather', 'mall', 'cinema', 'the theaters', '']) {
    assert.equal(resolve(said).status, 'none', said);
  }
  assert.equal(resolveTheater([], directory).status, 'none');
  assert.equal(resolveTheater(undefined, directory).status, 'none');
  assert.equal(resolveTheater(['megamall'], []).status, 'none');
});

test('two recognizer guesses for the same cinema are one answer; for different ones, a choice', () => {
  assert.equal(nameOf(resolve('megamall', 'sm megamall')), 'SM MegaMall');
  const r = resolve('megamall', 'the podium');
  assert.equal(r.status, 'ambiguous');
  assert.deepEqual(r.candidates.map((c) => c.theater.name).sort(), ['SM MegaMall', 'The Podium']);
});

// ── finding a cinema inside a sentence ──────────────────

const find = (sentence) => {
  const tokens = normalizeTokens(sentence);
  const hit = findTheaterInTokens(tokens, directory, { origin: ORTIGAS });
  return hit ? { name: hit.result.theater.name, words: tokens.slice(hit.start, hit.end).join(' ') } : null;
};

test('a cinema named inside a sentence is found, with the words it used', () => {
  assert.deepEqual(find('is godzilla showing at robinsons galleria ortigas today'),
    { name: 'Robinsons Galleria Ortigas', words: 'robinsons galleria ortigas' });
  assert.deepEqual(find('what movies are showing at fisher mall malabon tomorrow'),
    { name: 'Fisher Mall Malabon', words: 'fisher mall malabon' });
  assert.deepEqual(find('godzilla in megamall'), { name: 'SM MegaMall', words: 'megamall' });
  assert.deepEqual(find('what is on at the podium'), { name: 'The Podium', words: 'podium' });
  assert.deepEqual(find('movies at gateway mall 2 on friday'), { name: 'Gateway Mall 2', words: 'gateway mall 2' });
});

test('ordinary sentences, movie titles and areas are not mistaken for a cinema', () => {
  for (const said of [
    'the cat in the hat',
    'what is showing today',
    'where can i watch godzilla',
    'what places are showing godzilla',
    'what theaters are showing godzilla right now',
    'is street fighter showing tomorrow',
    'which cinemas have wicker tonight',
    'what is showing in ortigas',
    'show me the nearest theaters',
    'plaza',
    'city',
  ]) {
    assert.equal(find(said), null, said);
  }
});

// ── every cinema in the directory can be asked for ──────

test('every cinema is found when asked for by its full name, spoken the way a recognizer writes it', () => {
  const misses = [];
  for (const t of directory) {
    // Recognizers drop punctuation and accents.
    const said = t.name.replace(/[.'’\-]/g, ' ').replace(/ñ/g, 'n');
    const r = resolveTheater([said], directory, { origin: ORTIGAS });
    if (r.status !== 'match' || r.theater.slug !== t.slug) misses.push(t.name + ' -> ' + r.status + ' ' + (r.theater ? r.theater.name : ''));
  }
  assert.deepEqual(misses, []);
});

test('every cinema is found by its name without the brand or the word "mall" where that is unique', () => {
  const misses = [];
  for (const t of directory) {
    const said = t.name
      .replace(/[.'’\-]/g, ' ').replace(/ñ/g, 'n')
      .replace(/\b(SM|Robinsons|Ayala|Megaworld|City|Malls?|Cinemas?|Center|Vista|Walter|Mart|CityMall)\b/gi, ' ')
      .replace(/\s+/g, ' ').trim();
    if (!said) continue;
    const r = resolveTheater([said], directory, { origin: ORTIGAS });
    // Either the right cinema outright, or a choice that includes it (several share the short name).
    const ok = (r.status === 'match' && r.theater.slug === t.slug) ||
      (r.status === 'ambiguous' && r.candidates.some((c) => c.theater.slug === t.slug)) ||
      (r.status === 'confirm' && r.theater.slug === t.slug);
    if (!ok) misses.push(t.name + ' / "' + said + '" -> ' + r.status + ' ' + (r.theater ? r.theater.name : ''));
  }
  assert.deepEqual(misses, []);
});

test('nicknames for the cinemas beyond the nearest', () => {
  for (const [said, expected] of [
    ['greenbelt', 'Greenbelt 3'],
    ['venice grand canal', 'Venice Grand Canal Mall'],
    ['venice', 'Venice Grand Canal Mall'],
    ['vista taguig', 'Vista Mall Taguig'],
    ['walter mart makati', 'Walter Mart Makati'],
    ['cash and carry', 'Cash and Carry'],
    ['taytay', 'SM City Taytay'],
    ['san lazaro', 'SM City San Lazaro'],
    ['cloverleaf', 'Ayala Malls Cloverleaf'],
    ['lucky chinatown', 'Lucky Chinatown'],
    ['chinatown', 'Lucky Chinatown'],
    ['newport mall', 'Newport Mall'],
    ['grand central', 'SM City Grand Central'],
    ['antipolo', 'Robinsons Place Antipolo'],
    ['manila bay', 'Ayala Malls Manila Bay'],
    ['s maison', 'S Maison'],
    ['angono', 'SM Center Angono'],
    ['sangandaan', 'SM Center Sangandaan'],
    ['novaliches', 'SM City Novaliches'],
    ['bicutan', 'SM City Bicutan'],
    ['fisher mall malabon', 'Fisher Mall Malabon'],
    ['valenzuela', 'SM City Valenzuela'],
    ['fairview', 'SM City Fairview'],
    ['fairview terraces', 'Ayala Fairview Terraces'],
    ['sucat', 'SM City Sucat'],
    ['bf paranaque', 'SM City BF Parañaque'],
    ['caloocan', 'SM City Caloocan'],
    ['las pinas', 'Robinsons Place Las Piñas'],
    ['southmall', 'SM SouthMall'],
    ['alabang town center', 'Alabang Town Center'],
    ['atc', 'Alabang Town Center'],
    ['festival mall', 'Festival Supermall'],
    ['festival supermall', 'Festival Supermall'],
    ['sjdm', 'SM City San Jose del Monte'],
    ['nomo', 'Vista Mall Nomo'],
    ['marilao', 'SM City Marilao'],
    ['bacoor', 'SM City Bacoor'],
    ['muntinlupa', 'SM Center Muntinlupa'],
    ['evia', 'Evia Lifestyle Center'],
    ['daang hari', 'Vista Mall Daang Hari'],
    ['molino', 'SM City Molino'],
    ['galleria south', 'Robinsons Galleria South'],
    ['southwoods', 'Southwoods Mall'],
    ['dasma', 'SM City Dasmariñas'],
    ['nuvali', 'Ayala Malls Nuvali'],
    ['trece martires', 'SM City Trece Martires'],
    ['baliwag', 'SM City Baliwag'],
  ]) {
    const r = resolve(said);
    // Skip a cinema the recorded directory does not include (it reaches about 77 km out).
    if (!directory.some((t) => t.name === expected)) continue;
    assert.equal(r.status, 'match', said + ' -> ' + r.status);
    assert.equal(nameOf(r), expected, said);
  }
});

test('places shared by two cinemas ask which', () => {
  for (const said of ['sta rosa', 'gen trias', 'imus', 'tanza', 'pampanga']) {
    const r = resolve(said);
    assert.equal(r.status, 'ambiguous', said);
    assert.ok(r.candidates.length >= 2, said);
  }
});

test('accents are ignored in names and titles', () => {
  assert.deepEqual(normalizeTokens('Robinsons Place Las Piñas'), ['robinsons', 'place', 'las', 'pinas']);
  assert.deepEqual(normalizeTokens('Dasmariñas'), ['dasmarinas']);
  assert.deepEqual(normalizeTokens('Zoë Kravitz'), ['zoe', 'kravitz']);
  assert.equal(nameOf(resolve('Las Piñas')), 'Robinsons Place Las Piñas');
  assert.equal(nameOf(resolve('las pinas')), 'Robinsons Place Las Piñas');
});
