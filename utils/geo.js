/**
 * Distance helpers. Pure functions.
 */

const EARTH_KM = 6371;
const toRad = function (deg) { return deg * Math.PI / 180; };

/** Great-circle distance in km between two { lat, lng } points. */
export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** 1.234 -> '1.2 km'; under 100 m -> '0.1 km' (never '0.0'); 12.34 -> '12.3 km'. */
export function formatKm(km) {
  if (km === null || km === undefined || !isFinite(km)) return '';
  return Math.max(0.1, Math.round(km * 10) / 10).toFixed(1) + ' km';
}
