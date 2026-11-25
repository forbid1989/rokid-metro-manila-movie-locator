/**
 * Location helpers. Uses navigator.geolocation (the documented AIUI API; there
 * is no wx.getLocation). Falls back to a default Metro Manila point.
 */

export const DEFAULT_LOCATION = {
  lat: 14.598970835872194,
  lng: 121.06753066670711,
  label: 'Ortigas',
};

// Rough Metro Manila bounding box; a fix outside it is treated as "not here".
const METRO_MANILA = { latMin: 14.35, latMax: 14.8, lngMin: 120.9, lngMax: 121.2 };

export function inMetroManila(lat, lng) {
  return lat >= METRO_MANILA.latMin && lat <= METRO_MANILA.latMax &&
    lng >= METRO_MANILA.lngMin && lng <= METRO_MANILA.lngMax;
}

const ERROR_NAMES = { 0: 'unsupported', 1: 'denied', 2: 'unavailable', 3: 'timeout' };

let cached = null;

export function resetLocationCache() {
  cached = null;
}

/**
 * The location to search from. Never rejects.
 *
 * Resolves { lat, lng, accuracy?, source, reason }:
 *   source 'device'  a real fix inside Metro Manila
 *   source 'default' the Ortigas default; `reason` says why:
 *                    'outside' (fix outside Metro Manila, e.g. simulator at 0,0),
 *                    'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'error'
 * The result is cached for `ttlMs` so each voice query does not wait on GPS.
 */
export async function resolveLocation(options) {
  const o = Object.assign({ getPos: getPosition, now: Date.now, ttlMs: 60000, force: false }, options || {});
  if (!o.force && cached && o.now() - cached.at < o.ttlMs) return cached.value;

  let value;
  try {
    const pos = await o.getPos({ timeout: 8000, maximumAge: 60000 });
    if (inMetroManila(pos.lat, pos.lng)) {
      value = { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, source: 'device', reason: '' };
    } else {
      value = { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng, source: 'default', reason: 'outside' };
    }
  } catch (err) {
    value = {
      lat: DEFAULT_LOCATION.lat,
      lng: DEFAULT_LOCATION.lng,
      source: 'default',
      reason: ERROR_NAMES[err && err.code] || 'error',
    };
  }
  cached = { at: o.now(), value: value };
  return value;
}

/** Footer text: 'Near you' or 'Near Ortigas (default)'. */
export function locationLabel(loc) {
  return loc && loc.source === 'device' ? 'Near you' : 'Near ' + DEFAULT_LOCATION.label + ' (default)';
}

// 'granted' | 'denied' | 'prompt' | 'unsupported' | 'error'
export async function getPermissionState() {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions ||
        typeof navigator.permissions.query !== 'function') {
      return 'unsupported';
    }
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status && status.state ? status.state : 'error';
  } catch (err) {
    return 'error';
  }
}

/**
 * One-shot position.
 * Resolves { lat, lng, accuracy }. Rejects { code, message } where code is
 * 1 denied, 2 unavailable, 3 timeout, 0 not supported / threw.
 */
export function getPosition(options) {
  const opts = Object.assign({ enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }, options || {});
  return new Promise(function (resolve, reject) {
    try {
      if (typeof navigator === 'undefined' || !navigator.geolocation ||
          typeof navigator.geolocation.getCurrentPosition !== 'function') {
        reject({ code: 0, message: 'geolocation not supported' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          const c = pos && pos.coords;
          if (!c || typeof c.latitude !== 'number' || typeof c.longitude !== 'number') {
            reject({ code: 2, message: 'empty position' });
            return;
          }
          resolve({ lat: c.latitude, lng: c.longitude, accuracy: c.accuracy });
        },
        function (err) {
          reject({ code: err && err.code ? err.code : 0, message: err && err.message ? err.message : '' });
        },
        opts
      );
    } catch (err) {
      reject({ code: 0, message: err && err.message ? err.message : String(err) });
    }
  });
}
