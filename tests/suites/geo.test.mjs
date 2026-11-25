import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, formatKm } from '../../utils/geo.js';

test('haversineKm: same point is zero, known distances are close', () => {
  const a = { lat: 14.5995, lng: 120.9842 };
  assert.equal(haversineKm(a, a), 0);
  // Manila centre to Robinsons Galleria Ortigas is about 8.7 km.
  const d = haversineKm(a, { lat: 14.591391458665576, lng: 121.05918645858765 });
  assert.ok(d > 7.5 && d < 8.5, String(d));
  // Symmetric.
  const b = { lat: 14.65, lng: 121.03 };
  assert.ok(Math.abs(haversineKm(a, b) - haversineKm(b, a)) < 1e-9);
});

test('formatKm', () => {
  assert.equal(formatKm(1.234), '1.2 km');
  assert.equal(formatKm(12.34), '12.3 km');
  assert.equal(formatKm(0.02), '0.1 km', 'never 0.0');
  assert.equal(formatKm(20), '20.0 km');
  assert.equal(formatKm(null), '');
  assert.equal(formatKm(NaN), '');
});
