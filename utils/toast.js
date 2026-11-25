/**
 * Page helpers shared by the screens. Spread the result into the page object:
 *
 *   export default {
 *     ...createPageHelpers(),
 *     ...
 *   };
 *
 * Adds three methods (the page sets `this.unloaded = true` in onUnload):
 *   update(patch)     setData that is skipped once the page is unloaded
 *   showToast(text)   show a short message for a couple of seconds
 *   clearToast()      cancel the pending hide timer (call in onUnload)
 */
export function createPageHelpers(durationMs) {
  const ms = durationMs || 2500;
  return {
    update(patch) {
      if (this.unloaded) return;
      this.setData(patch);
    },

    showToast(text) {
      if (this.unloaded) return;
      this.setData({ toastVisible: true, toastText: text });
      if (this._toastTimer) clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        this._toastTimer = null;
        if (this.unloaded) return;
        this.setData({ toastVisible: false, toastText: '' });
      }, ms);
    },

    clearToast() {
      if (this._toastTimer) {
        clearTimeout(this._toastTimer);
        this._toastTimer = null;
      }
    },
  };
}
