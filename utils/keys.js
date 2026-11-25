/**
 * Temple-gesture key handling shared by the pages. Swipe arrives as arrow keys
 * and tap as Enter; double-tap (Backspace) is left to the host, which goes back.
 *
 *   this.keys = createKeyGuard();               // onLoad
 *   this.keys.arm();                            // onShow: ignore the touch that opened the page
 *   const k = this.keys.classify(event);        // onKeyUp: 'enter' | 'next' | 'prev' | null
 *
 * The timings are the recorder app's, which were tuned on the glasses: a swipe
 * can produce more than one arrow event, so a repeat of the same direction
 * inside `aliasMs` is dropped (hence a second swipe in the same direction needs
 * a short pause).
 */
export const KEY_TIMING = {
  phantomMs: 800,   // ignore keys this long after the page appears
  aliasMs: 1200,    // same-direction repeat window
  repeatMs: 220,    // any direction repeat window
  enterMs: 220,     // repeated Enter window
};

export function createKeyGuard(options) {
  const o = Object.assign({}, KEY_TIMING, options || {});
  let armedAt = 0;
  let lastDirTime = -Infinity;
  let lastDelta = 0;
  let lastEnter = -Infinity;

  return {
    arm: function (now) {
      armedAt = now === undefined ? Date.now() : now;
    },

    classify: function (event, now) {
      const t = now === undefined ? Date.now() : now;
      if (!event || !event.code) return null;
      const code = event.code;
      if (code === 'GlobalHook') return null;
      if (t - armedAt < o.phantomMs) return null;

      if (code === 'Enter' || code === 'Space') {
        if (t - lastEnter < o.enterMs) return null;
        lastEnter = t;
        return 'enter';
      }

      let delta = 0;
      if (code === 'ArrowDown' || code === 'ArrowRight') delta = 1;
      else if (code === 'ArrowUp' || code === 'ArrowLeft') delta = -1;
      if (!delta) return null;

      if (t - lastDirTime < o.aliasMs && lastDelta === delta) return null;
      if (t - lastDirTime < o.repeatMs) return null;
      lastDirTime = t;
      lastDelta = delta;
      return delta > 0 ? 'next' : 'prev';
    },
  };
}
