/**
 * Small display/normalisation helpers for API data. Pure functions.
 */
import { parseTime12h } from './dates.js';

/** '1.7 km' -> 1.7, '850 m' -> 0.85, anything else -> null. */
export function parseKm(label) {
  const m = /^\s*([\d.]+)\s*(km|m)\s*$/i.exec(String(label || ''));
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (!isFinite(value)) return null;
  return m[2].toLowerCase() === 'm' ? value / 1000 : value;
}

/** '2 hrs 14 min' -> '2h 14m', '1 hr 40 min' -> '1h 40m', '45 min' -> '45m', '' -> ''. */
export function shortRuntime(str) {
  const s = String(str || '');
  const h = /(\d+)\s*hr/i.exec(s);
  const m = /(\d+)\s*min/i.exec(s);
  const parts = [];
  if (h) parts.push(h[1] + 'h');
  if (m) parts.push(m[1] + 'm');
  return parts.join(' ');
}

/** Sort showtimes chronologically (12:00 AM first) and drop duplicates. */
export function sortTimes(times) {
  const seen = {};
  const unique = [];
  for (const t of times || []) {
    if (!seen[t]) {
      seen[t] = true;
      unique.push(t);
    }
  }
  return unique.sort(function (a, b) {
    const ma = parseTime12h(a);
    const mb = parseTime12h(b);
    if (ma === null || mb === null) return 0;
    return ma - mb;
  });
}

// Special screen types worth showing. Ordinary rooms ("Cinema 5", "Digital
// Cinema 3", "1") are merged into one unlabelled group.
const SCREEN_FORMATS = [
  [/imax/i, 'IMAX'],
  [/4dx/i, '4DX'],
  [/dolby/i, 'Dolby'],
  [/screen\s*x/i, 'ScreenX'],
  [/platinum/i, 'Platinum'],
  [/premiere\s*club/i, 'Premiere'],
  [/luxe/i, 'Luxe'],
  [/\bvip\b/i, 'VIP'],
  [/director'?s/i, "Director's"],
  [/ultra/i, 'Ultra'],
];

/** Label for a screen: '' for an ordinary room, else 'IMAX', 'VIP', 'IMAX 3D', '3D', ... */
export function screenFormat(screenName, in3d) {
  let label = '';
  for (const entry of SCREEN_FORMATS) {
    if (entry[0].test(String(screenName || ''))) {
      label = entry[1];
      break;
    }
  }
  if (in3d) label = label ? label + ' 3D' : '3D';
  return label;
}

/** Shorten with an ellipsis. */
export function truncate(str, max) {
  const s = String(str || '');
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}
