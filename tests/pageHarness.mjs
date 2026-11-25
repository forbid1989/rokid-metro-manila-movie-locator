/**
 * Runs a page's real <script setup> in Node against mocks, so page logic
 * (state changes, navigation, voice flow) is tested without the glasses.
 *
 *   const env = createEnv();                      // frozen clock, mock wx, fake network/location/speech
 *   const page = await env.openPage('movies');    // loads + onLoad(query) + onShow()
 *   await env.waitFor(() => page.data.state !== 'loading');
 *
 * What is mocked: `wx` (navigation + storage), `fetch` (served from the recorded
 * fixtures), navigator.geolocation, SpeechRecognition and Date.now. The page's
 * own utils are the real modules.
 *
 * Not covered: layout/CSS, `ink:` template bindings, and real runtime behaviour.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFakeGet, at } from './helpers.mjs';
import { resetServices } from '../utils/services.js';
import { resetLocationCache } from '../utils/location.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'tests', '.build');
const UTILS_URL = pathToFileURL(path.join(ROOT, 'utils')).href;

// One wx mock for the whole process: page modules capture it at import time.
const wx = {
  calls: [],
  store: new Map(),
  navigateTo(opts) { wx.calls.push({ fn: 'navigateTo', url: opts.url }); },
  navigateBack() { wx.calls.push({ fn: 'navigateBack' }); },
  // redirectTo is only present when a test turns it on (the real runtime may not have it).
  makeRedirect() { wx.redirectTo = function (opts) { wx.calls.push({ fn: 'redirectTo', url: opts.url }); }; },
  getStorageSync(k) { return wx.store.get(k); },
  setStorageSync(k, v) { wx.store.set(k, v); },
  reset() { wx.calls.length = 0; wx.store.clear(); delete wx.redirectTo; },
};
globalThis.__wx = wx;

const compiled = new Map();

async function loadPageDef(name) {
  if (compiled.has(name)) return compiled.get(name);
  const src = fs.readFileSync(path.join(ROOT, 'pages', name, name + '.ink'), 'utf8');
  const m = /<script setup>\n([\s\S]*?)<\/script>/.exec(src);
  if (!m) throw new Error('no <script setup> in ' + name);
  const code = m[1]
    .replace(/import wx from 'wx';\n?/, 'const wx = globalThis.__wx;\n')
    .replace(/from '\.\.\/\.\.\/utils\//g, "from '" + UTILS_URL + '/');
  if (/from 'wx'|from 'audio'/.test(code)) throw new Error(name + ' has an import the harness does not mock');
  fs.mkdirSync(BUILD, { recursive: true });
  const file = path.join(BUILD, name + '.mjs');
  fs.writeFileSync(file, code);
  const def = (await import(pathToFileURL(file).href)).default;
  compiled.set(name, def);
  return def;
}

function clonePage(def) {
  const page = Object.assign({}, def);
  page.data = JSON.parse(JSON.stringify(def.data));
  page.setData = function (patch) { Object.assign(page.data, patch); };
  return page;
}

export const FIXTURE_DAY = '2026-11-17';
export const ORTIGAS_FIX = { latitude: 14.599, longitude: 121.0675, accuracy: 5 };

export function createEnv() {
  const realNow = Date.now;
  const realFetch = globalThis.fetch;
  const hadNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const pages = [];

  const env = {
    wx: wx,
    clock: at(FIXTURE_DAY, 10, 0),
    calls: [],          // every API path requested
    offline: false,     // make fetch throw
    forbidden: false,   // make every API call 403
    delay: null,        // (path) => ms of artificial latency, to make older requests finish last
    geo: ORTIGAS_FIX,   // null = geolocation unsupported; { error: 1 } = denied
    recognizers: [],    // SpeechRecognition instances created by pages
  };

  Date.now = () => env.clock;
  resetServices();
  resetLocationCache();
  wx.reset();

  const get = makeFakeGet();
  globalThis.fetch = async function (url) {
    if (env.offline) throw new TypeError('Failed to fetch');
    const p = String(url).replace(/^https:\/\/www\.clickthecity\.com\/api\/movies/, '');
    env.calls.push(p);
    if (env.delay) await env.sleep(env.delay(p) || 0);
    if (env.forbidden) return { status: 403, ok: false, json: async () => ({}) };
    try {
      const body = await get(p);
      return { status: 200, ok: true, json: async () => body };
    } catch (err) {
      const status = err.status || 500;
      return { status: status, ok: false, json: async () => ({}) };
    }
  };

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    get() {
      if (env.geo === null) return {};
      return {
        geolocation: {
          getCurrentPosition(ok, fail) {
            if (env.geo && env.geo.error) fail({ code: env.geo.error, message: 'x' });
            else ok({ coords: env.geo });
          },
        },
      };
    },
  });

  globalThis.SpeechRecognition = class {
    constructor() { env.recognizers.push(this); this.started = false; }
    start() { this.started = true; }
    abort() { this.aborted = true; }
  };

  env.advance = (ms) => { env.clock += ms; };
  env.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  env.waitFor = async function (cond, label) {
    const deadline = realNow() + 2000;
    while (!cond()) {
      if (realNow() > deadline) throw new Error('timed out waiting for ' + (label || cond.toString()));
      await env.sleep(2);
    }
  };

  /** Create the page, run onLoad(query) and onShow(), and return it. */
  env.openPage = async function (name, query) {
    const page = clonePage(await loadPageDef(name));
    pages.push(page);
    page.onLoad(query || {});
    page.onShow();
    return page;
  };

  /** Let the opening touch pass, then send a key. */
  env.key = function (page, code) {
    env.advance(1000);
    page.onKeyUp({ code: code });
  };

  /** A swipe: far enough after the last one that it is not mistaken for a repeat. */
  env.swipe = function (page, direction) {
    env.advance(1500);
    page.onKeyUp({ code: direction === 'up' ? 'ArrowUp' : 'ArrowDown' });
  };

  /** Say something: wake the page's recognizer and deliver the guesses. */
  env.say = function (page, ...alternatives) {
    const before = env.recognizers.length;
    page.onVoiceWakeup({ preventDefault() {} });
    const rec = env.recognizers[before];
    if (!rec) throw new Error('page did not start a recognizer');
    const result = alternatives.map((t) => ({ transcript: t }));
    rec.onresult({ results: [Object.assign(result, { length: result.length })] });
  };

  env.navigations = () => wx.calls.filter((c) => c.fn === 'navigateTo').map((c) => c.url);
  env.redirections = () => wx.calls.filter((c) => c.fn === 'redirectTo').map((c) => c.url);
  env.backs = () => wx.calls.filter((c) => c.fn === 'navigateBack').length;

  env.close = function () {
    for (const p of pages) if (p.onUnload) p.onUnload();
    Date.now = realNow;
    globalThis.fetch = realFetch;
    if (hadNavigator) Object.defineProperty(globalThis, 'navigator', hadNavigator);
    else delete globalThis.navigator;
    delete globalThis.SpeechRecognition;
    resetServices();
    resetLocationCache();
  };

  return env;
}
