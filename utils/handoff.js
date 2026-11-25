/**
 * One-shot messages between pages, carried through storage (the same approach
 * the recorder app uses for its "saved" toast). A page leaves a message, goes
 * back, and the page underneath takes it in onShow.
 *
 *   const handoff = createHandoff(wx);          // anything with get/setStorageSync
 *   handoff.set({ type: 'search', movieId: 21542, date: '2026-11-17' });
 *   const msg = handoff.take();                 // null when empty or older than 5 s
 */
const KEY = 'handoff';
const MAX_AGE_MS = 5000;

export function createHandoff(storage, now) {
  const clock = now || Date.now;
  return {
    set: function (payload) {
      try {
        storage.setStorageSync(KEY, Object.assign({}, payload, { ts: clock() }));
      } catch (err) {
        console.error('handoff.set failed:', err && err.message ? err.message : err);
      }
    },
    take: function () {
      try {
        const raw = storage.getStorageSync(KEY);
        if (!raw) return null;
        storage.setStorageSync(KEY, null);
        if (!raw.ts || clock() - raw.ts > MAX_AGE_MS) return null;
        return raw;
      } catch (err) {
        console.error('handoff.take failed:', err && err.message ? err.message : err);
        return null;
      }
    },
  };
}
