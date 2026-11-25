/**
 * One-shot speech recognition for the glasses' wake event, shared by every page
 * (extracted from the recorder app's recordings list).
 *
 *   const voice = createVoiceSession({
 *     onListening(on) { this.setData({ listening: on }); },
 *     onResult(transcripts) { ... },     // recognizer guesses, best first
 *     onToast(text) { ... },             // errors, already worded for the user
 *   });
 *   onVoiceWakeup(event) { voice.handleWake(event); }
 *   onUnload() { voice.abort(); }
 *
 * Notes carried over from the recorder:
 *  - interimResults is left at its default; setting it true throws NotSupportedError.
 *  - If speech is not available we do NOT take over the wake event, so the
 *    host assistant still gets it.
 *  - Each session finishes exactly once; late events from a finished or
 *    replaced session are ignored.
 */

export function getRecognitionClass() {
  if (typeof SpeechRecognition !== 'undefined') return SpeechRecognition;
  if (typeof webkitSpeechRecognition !== 'undefined') return webkitSpeechRecognition;
  return null;
}

// SpeechRecognition error code -> toast text. null = stay silent.
export function voiceErrorMessage(code) {
  switch (code) {
    case 'aborted':
      return null;
    case 'no-speech':
      return "Didn't catch that — try again";
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone blocked — check settings';
    case 'network':
      return 'Voice needs a connection — use keys';
    default:
      return 'Voice not available — use keys';
  }
}

export function createVoiceSession(options) {
  const o = Object.assign({
    lang: 'en-US',
    timeoutMs: 8000,
    maxAlternatives: 3,
    getClass: getRecognitionClass,
    onResult: function () {},
    onToast: function () {},
    onListening: function () {},
    setTimer: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimer: function (id) { clearTimeout(id); },
  }, options || {});

  let recognition = null;
  let timer = null;

  function preventDefault(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
  }

  function cleanup() {
    if (timer !== null) {
      o.clearTimer(timer);
      timer = null;
    }
    const wasListening = recognition !== null;
    recognition = null;
    if (wasListening) o.onListening(false);
  }

  // Ends the session once. Returns false if `rec` is no longer the live one.
  function finish(rec, toast) {
    if (recognition !== rec) return false;
    cleanup();
    if (toast) o.onToast(toast);
    return true;
  }

  function handleWake(event) {
    // Already listening: swallow the repeat so the host assistant does not also start.
    if (recognition) {
      preventDefault(event);
      return;
    }

    const RecClass = o.getClass();
    if (!RecClass) {
      o.onToast('Voice not available — use keys');
      return;
    }

    const rec = new RecClass();
    rec.lang = o.lang;
    try { rec.maxAlternatives = o.maxAlternatives; } catch (e) { /* keep the default */ }

    rec.onresult = function (ev) {
      const results = ev && ev.results;
      if (!results || !results.length) return;
      const last = results[results.length - 1];
      const transcripts = [];
      for (let k = 0; last && k < last.length; k++) {
        const text = last[k] && last[k].transcript;
        if (text && String(text).trim()) transcripts.push(String(text).trim());
      }
      if (!transcripts.length) {
        finish(rec, "Didn't catch that — try again");
        return;
      }
      if (finish(rec)) o.onResult(transcripts);
    };

    rec.onerror = function (ev) {
      const code = ev && ev.error ? ev.error : 'unknown';
      console.error('SpeechRecognition error:', code, ev && ev.message ? ev.message : '');
      finish(rec, voiceErrorMessage(code));
    };

    rec.onend = function () {
      // Ended with neither a result nor an error.
      finish(rec, "Didn't catch that — try again");
    };

    recognition = rec;
    o.onListening(true);
    preventDefault(event);

    try {
      rec.start();
    } catch (err) {
      console.error('SpeechRecognition start failed:', err && err.message ? err.message : err);
      finish(rec, 'Voice not available — use keys');
      return;
    }

    timer = o.setTimer(function () {
      timer = null;
      if (finish(rec, 'Voice timed out — try again')) {
        try { rec.abort(); } catch (e) { /* ignore */ }
      }
    }, o.timeoutMs);
  }

  function abort() {
    const rec = recognition;
    cleanup();
    if (rec) {
      try { rec.abort(); } catch (e) { /* ignore */ }
    }
  }

  return {
    handleWake: handleWake,
    abort: abort,
    isListening: function () { return recognition !== null; },
  };
}
