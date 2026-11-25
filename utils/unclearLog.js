/**
 * The last few requests the app could not make sense of, kept on the device
 * only, so they can be read off the Diagnostics screen and used to improve the
 * understanding. Nothing is sent anywhere.
 */
const KEY = 'unclear.v1';
const MAX = 20;

/** Remember a request that was not understood. Never throws. */
export function recordUnclear(storage, text, nowMs) {
  const t = String(text || '').trim().slice(0, 140);
  if (!t || !storage) return;
  try {
    const list = readUnclear(storage).filter(function (e) { return e.text !== t; });
    list.unshift({ text: t, at: nowMs || Date.now() });
    storage.setStorageSync(KEY, list.slice(0, MAX));
  } catch (e) { /* the log is a convenience */ }
}

/** Newest first. */
export function readUnclear(storage) {
  try {
    const list = storage && storage.getStorageSync(KEY);
    return Array.isArray(list) ? list.filter(function (e) { return e && typeof e.text === 'string'; }) : [];
  } catch (e) {
    return [];
  }
}

export function clearUnclear(storage) {
  try {
    if (storage) storage.setStorageSync(KEY, []);
  } catch (e) { /* ignore */ }
}
