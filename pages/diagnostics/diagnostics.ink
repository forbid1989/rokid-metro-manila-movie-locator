<script def>
{
  "navigationBarTitleText": "Diagnostics"
}
</script>

<script setup>
import wx from 'wx';
import { fetchJson } from '../../utils/api.js';
import { REMOTE_BASE, DEV_PROXY_BASE } from '../../utils/env.js';
import { getPermissionState, getPosition, inMetroManila, DEFAULT_LOCATION } from '../../utils/location.js';
import { readUnclear } from '../../utils/unclearLog.js';

const APP_VERSION = '0.1.0-m0';
const PHANTOM_WINDOW_MS = 300;
const RERUN_DEDUPE_MS = 400;
const PROBE_TIMEOUT_MS = 8000;

// Today's date in Manila (UTC+8), independent of the device time zone.
function manilaDate() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// What the runtime exposes: used to find a reliable "am I in the web preview?"
// signal, and to learn the User-Agent the glasses send (the API rejects some).
function envProbe() {
  const kind = function (name) {
    try { return typeof globalThis[name]; } catch (e) { return 'err'; }
  };
  let ua = '?';
  try { ua = String(navigator.userAgent).slice(0, 80); } catch (e) { ua = 'n/a'; }
  let host = 'n/a';
  try {
    if (typeof location !== 'undefined' && location) host = String(location.hostname || location.href || 'empty').slice(0, 30);
  } catch (e) { host = 'err'; }
  return 'location:' + host + ' window:' + kind('window') + ' document:' + kind('document') + ' UA:' + ua;
}

// Which navigation calls the runtime has. Decides whether a page can replace
// itself (redirectTo / reLaunch) or can only stack on top (navigateTo).
function navProbe() {
  return ['navigateTo', 'navigateBack', 'redirectTo', 'reLaunch', 'switchTab']
    .map(function (name) {
      let kind = 'err';
      try { kind = typeof wx[name]; } catch (e) { kind = 'err'; }
      return name + ':' + (kind === 'function' ? 'yes' : kind === 'undefined' ? 'NO' : kind);
    })
    .join(' ');
}

// The last few requests the app could not make sense of, newest first.
function unclearProbe() {
  const list = readUnclear(wx).slice(0, 5);
  return list.length ? list.map(function (e) { return '"' + e.text + '"'; }).join(' · ') : 'none yet';
}

function round(n, places) {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

// Same request through wx.request, in case the runtime sends different
// headers (e.g. User-Agent) than fetch does.
function wxRequestProbe(url) {
  return new Promise(function (resolve) {
    const t0 = Date.now();
    const done = function (r) { resolve(Object.assign({ ms: Date.now() - t0 }, r)); };
    setTimeout(function () { done({ ok: false, msg: 'timeout' }); }, PROBE_TIMEOUT_MS);
    try {
      if (typeof wx.request !== 'function') {
        done({ ok: false, msg: 'wx.request n/a' });
        return;
      }
      const ret = wx.request({
        url: url,
        success: function (res) {
          const status = res && (res.statusCode || res.status);
          done({ ok: status >= 200 && status < 300, status: status });
        },
        fail: function (err) {
          done({ ok: false, msg: (err && (err.errMsg || err.message)) || 'failed' });
        },
      });
      if (ret && typeof ret.then === 'function') {
        ret.then(function (res) {
          const status = res && (res.statusCode || res.status);
          done({ ok: status >= 200 && status < 300, status: status });
        }).catch(function (err) {
          done({ ok: false, msg: (err && (err.errMsg || err.message)) || 'failed' });
        });
      }
    } catch (err) {
      done({ ok: false, msg: 'threw: ' + (err && err.message ? err.message : err) });
    }
  });
}

export default {
  data: {
    running: false,
    rows: [],
    summary: 'Tap to run checks',
  },

  onLoad() {
    this.unloaded = false;
    this.armedAt = Date.now();
    this.lastRun = 0;
    this.results = {};
    this.run();
  },

  onShow() {
    this.armedAt = Date.now();
  },

  onUnload() {
    this.unloaded = true;
  },

  update(patch) {
    if (this.unloaded) return;
    this.setData(patch);
  },

  // Re-render the table from this.results. Each entry is { label, value }.
  render(order) {
    const rows = order.map(function (key, i) {
      const r = this.results[key] || { label: key, value: '…' };
      return { id: 'r' + i, label: r.label, value: r.value };
    }, this);
    this.update({ rows: rows });
  },

  async run() {
    const now = Date.now();
    if (this.data.running || now - this.lastRun < RERUN_DEDUPE_MS) return;
    this.lastRun = now;
    this.update({ running: true, summary: 'Running…' });

    const order = ['app', 'env', 'nav', 'unclear', 'loc', 'fetch', 'wxreq'];
    this.results = {
      app: { label: 'App', value: APP_VERSION },
      env: { label: 'Runtime', value: envProbe() },
      nav: { label: 'Navigation API', value: navProbe() },
      unclear: { label: 'Not understood (this device only)', value: unclearProbe() },
      loc: { label: 'Location', value: '…' },
      fetch: { label: 'API fetch (direct, then dev proxy if it fails)', value: '…' },
      wxreq: { label: 'API wx.request (direct)', value: '…' },
    };
    this.render(order);

    // 1. Location permission state (no dialog) and a position fix.
    const perm = await getPermissionState();
    this.results.loc.value = 'perm ' + perm + ' · …';
    this.render(order);

    let locNote = '';
    try {
      const t0 = Date.now();
      const pos = await getPosition({ timeout: PROBE_TIMEOUT_MS });
      const where = inMetroManila(pos.lat, pos.lng) ? 'Metro Manila' : 'OUTSIDE Metro Manila';
      locNote = 'ok';
      this.results.loc.value = 'perm ' + perm + ' · ' + round(pos.lat, 4) + ', ' + round(pos.lng, 4) +
        ' ±' + Math.round(pos.accuracy || 0) + 'm · ' + where + ' · ' + (Date.now() - t0) + 'ms';
    } catch (err) {
      locNote = 'fail';
      const names = { 0: 'unsupported', 1: 'denied', 2: 'unavailable', 3: 'timeout' };
      this.results.loc.value = 'perm ' + perm + ' · FAIL code ' + err.code + ' (' + (names[err.code] || '?') + ')' +
        (err.message ? ' ' + err.message : '') + ' → default ' + DEFAULT_LOCATION.label;
    }
    this.render(order);

    // 2. API reachability via fetch. Direct first; if the runtime cannot reach
    // it at all (browser CORS in `aix preview`), try the dev proxy so we can
    // tell "blocked by the browser" apart from "service is down".
    const path = '/theater/the-podium?date=' + manilaDate();
    const url = REMOTE_BASE + path;
    let fetchNote = '';
    const attempt = async function (base) {
      const t0 = Date.now();
      const res = await fetchJson(base + path, { timeoutMs: PROBE_TIMEOUT_MS });
      const n = res.data && res.data.schedules ? res.data.schedules.length : '?';
      return res.status + ' OK · ' + n + ' schedules · ' + (Date.now() - t0) + 'ms';
    };
    const failText = function (err) {
      return 'FAIL ' + (err.kind || '?') + (err.status ? ' ' + err.status : '') + ' ' + (err.message || '');
    };
    try {
      this.results.fetch.value = 'direct: ' + await attempt(REMOTE_BASE);
      fetchNote = 'direct ok';
    } catch (err) {
      fetchNote = 'direct ' + (err.kind || 'fail');
      let text = 'direct: ' + failText(err);
      if (err.kind === 'network') {
        try {
          text += ' | proxy: ' + await attempt(DEV_PROXY_BASE);
          fetchNote += ', proxy ok';
        } catch (err2) {
          text += ' | proxy: ' + failText(err2);
          fetchNote += ', proxy ' + (err2.kind || 'fail');
        }
      }
      this.results.fetch.value = text;
    }
    this.render(order);

    // 3. Same request via wx.request.
    const probe = await wxRequestProbe(url);
    this.results.wxreq.value = probe.ok
      ? probe.status + ' OK · ' + probe.ms + 'ms'
      : 'FAIL ' + (probe.status ? probe.status + ' ' : '') + (probe.msg || '') + ' · ' + probe.ms + 'ms';
    this.render(order);

    const summary = 'loc ' + locNote + ' · fetch ' + fetchNote + ' · wx.request ' + (probe.ok ? 'ok' : 'fail');
    console.log('DIAGNOSTICS ' + JSON.stringify(this.results));
    this.update({ running: false, summary: summary });
  },

  onKeyDown(event) {
    if (!event) return;
    if (event.repeat) return;
  },

  onKeyUp(event) {
    if (!event || !event.code) return;
    if (event.code === 'GlobalHook') return;
    if (Date.now() - this.armedAt < PHANTOM_WINDOW_MS) return;
    if (event.code === 'Enter' || event.code === 'Space') {
      this.run();
    }
    // Backspace is left to the host: it closes the page.
  },

  onTapRoot() {
    this.run();
  },
};
</script>

<page>
  <view class="page-root" bindtap="onTapRoot">
    <view class="topbar">
      <text class="topbar-title">Diagnostics</text>
      <text class="topbar-sub">{{running ? 'running…' : 'done'}}</text>
    </view>

    <view class="table">
      <view ink:for="{{rows}}" ink:key="id" class="row">
        <text class="row-label">{{item.label}}</text>
        <text class="row-value">{{item.value}}</text>
      </view>
    </view>

    <view class="hintbar">
      <text class="hint-text">{{summary}}</text>
    </view>
    <view class="hintbar">
      <text class="hint-text">Tap to re-run · Double-tap to exit</text>
    </view>
  </view>
</page>

<style>
  .page-root {
    display: flex;
    flex-direction: column;
    width: 480px;
    height: 352px;
    padding: 12px 16px;
    box-sizing: border-box;
    background-color: #000000;
  }

  .topbar {
    display: flex;
    flex-direction: row;
    align-items: center;
    height: 30px;
    flex: 0 0 30px;
  }

  .topbar-title {
    font-size: 16px;
    line-height: 22px;
    color: #40ff5e;
    font-weight: 700;
  }

  .topbar-sub {
    font-size: 13px;
    line-height: 18px;
    color: rgba(64, 255, 94, 0.48);
    margin-left: auto;
  }

  .table {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 8px;
  }

  .row {
    display: flex;
    flex-direction: column;
    margin-bottom: 5px;
  }

  .row-label {
    font-size: 11px;
    line-height: 15px;
    color: rgba(64, 255, 94, 0.48);
  }

  .row-value {
    font-size: 12px;
    line-height: 16px;
    color: #40ff5e;
    font-family: monospace;
  }

  .hintbar {
    display: flex;
    flex-direction: row;
    align-items: center;
    height: 18px;
    flex: 0 0 18px;
    margin-top: 2px;
  }

  .hint-text {
    font-size: 11px;
    line-height: 15px;
    color: rgba(64, 255, 94, 0.72);
  }
</style>
