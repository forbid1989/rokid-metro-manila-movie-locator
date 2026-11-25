import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceSession, voiceErrorMessage } from '../../utils/voiceSession.js';

// A fake SpeechRecognition that records what the session did to it.
function makeEnv(overrides) {
  const env = { instances: [], timers: [], listening: [], results: [], toasts: [], startThrows: false };

  class FakeRecognition {
    constructor() {
      this.started = false;
      this.aborted = false;
      env.instances.push(this);
    }
    start() {
      if (env.startThrows) throw new Error('already started');
      this.started = true;
    }
    abort() {
      this.aborted = true;
    }
  }

  const session = createVoiceSession(Object.assign({
    getClass: () => FakeRecognition,
    onListening: (on) => env.listening.push(on),
    onResult: (t) => env.results.push(t),
    onToast: (t) => env.toasts.push(t),
    setTimer: (fn, ms) => { env.timers.push({ fn, ms, cleared: false }); return env.timers.length - 1; },
    clearTimer: (id) => { if (env.timers[id]) env.timers[id].cleared = true; },
  }, overrides || {}));

  env.session = session;
  env.wake = () => {
    const ev = { prevented: false, preventDefault() { this.prevented = true; } };
    session.handleWake(ev);
    return ev;
  };
  env.last = () => env.instances[env.instances.length - 1];
  return env;
}

const speech = (...alternatives) => ({ results: [alternatives.map((t) => ({ transcript: t }))].map((r) => Object.assign(r, { length: r.length })) });

test('wake starts listening, takes over the wake event, and configures the recognizer', () => {
  const env = makeEnv();
  const ev = env.wake();
  assert.equal(ev.prevented, true);
  assert.deepEqual(env.listening, [true]);
  assert.equal(env.session.isListening(), true);
  assert.equal(env.last().started, true);
  assert.equal(env.last().lang, 'en-US');
  assert.equal(env.last().maxAlternatives, 3);
  assert.equal(env.timers[0].ms, 8000);
});

test('a result delivers every alternative once, stops listening, and clears the timeout', () => {
  const env = makeEnv();
  env.wake();
  env.last().onresult(speech('godzilla minus one', ' godzilla minus zero ', ''));
  assert.deepEqual(env.results, [['godzilla minus one', 'godzilla minus zero']]);
  assert.deepEqual(env.listening, [true, false]);
  assert.equal(env.timers[0].cleared, true);
  // The platform's trailing "end" must not produce a second outcome.
  env.last().onend();
  assert.deepEqual(env.toasts, []);
  assert.equal(env.results.length, 1);
});

test('a second wake while listening is swallowed and starts nothing new', () => {
  const env = makeEnv();
  env.wake();
  const ev = env.wake();
  assert.equal(ev.prevented, true);
  assert.equal(env.instances.length, 1);
});

test('without speech support the wake event is left to the host', () => {
  const env = makeEnv({ getClass: () => null });
  const ev = env.wake();
  assert.equal(ev.prevented, false);
  assert.deepEqual(env.toasts, ['Voice not available — use keys']);
  assert.deepEqual(env.listening, []);
});

test('recognizer errors become friendly toasts; "aborted" is silent', () => {
  for (const [code, toast] of [
    ['no-speech', "Didn't catch that — try again"],
    ['not-allowed', 'Microphone blocked — check settings'],
    ['service-not-allowed', 'Microphone blocked — check settings'],
    ['network', 'Voice needs a connection — use keys'],
    ['something-new', 'Voice not available — use keys'],
  ]) {
    const env = makeEnv();
    env.wake();
    env.last().onerror({ error: code });
    assert.deepEqual(env.toasts, [toast], code);
    assert.equal(env.session.isListening(), false, code);
  }
  const env = makeEnv();
  env.wake();
  env.last().onerror({ error: 'aborted' });
  assert.deepEqual(env.toasts, []);
  assert.equal(env.session.isListening(), false);
  assert.equal(voiceErrorMessage('aborted'), null);
});

test('ending with no result and no error says it did not catch that', () => {
  const env = makeEnv();
  env.wake();
  env.last().onend();
  assert.deepEqual(env.toasts, ["Didn't catch that — try again"]);
});

test('a result with only blank transcripts is treated as nothing heard', () => {
  const env = makeEnv();
  env.wake();
  env.last().onresult(speech('', '   '));
  assert.deepEqual(env.results, []);
  assert.deepEqual(env.toasts, ["Didn't catch that — try again"]);
});

test('the timeout aborts the recognizer and says so', () => {
  const env = makeEnv();
  env.wake();
  env.timers[0].fn();
  assert.deepEqual(env.toasts, ['Voice timed out — try again']);
  assert.equal(env.last().aborted, true);
  assert.equal(env.session.isListening(), false);
});

test('start() throwing is reported and leaves nothing listening', () => {
  const env = makeEnv();
  env.startThrows = true;
  env.wake();
  assert.deepEqual(env.toasts, ['Voice not available — use keys']);
  assert.equal(env.session.isListening(), false);
  assert.equal(env.timers.length, 0, 'no timeout armed for a session that never started');
});

test('abort() ends the session and ignores late events', () => {
  const env = makeEnv();
  env.wake();
  const rec = env.last();
  env.session.abort();
  assert.equal(rec.aborted, true);
  assert.equal(env.session.isListening(), false);
  assert.deepEqual(env.listening, [true, false]);
  rec.onresult(speech('late words'));
  rec.onend();
  assert.deepEqual(env.results, []);
  assert.deepEqual(env.toasts, []);
  env.session.abort(); // safe when idle
});

test('events from a replaced session are ignored', () => {
  const env = makeEnv();
  env.wake();
  const first = env.last();
  env.session.abort();
  env.wake();
  first.onresult(speech('stale'));
  assert.deepEqual(env.results, []);
  assert.equal(env.session.isListening(), true);
});
