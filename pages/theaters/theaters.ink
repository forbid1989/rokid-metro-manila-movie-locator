<script def>
{
  "navigationBarTitleText": "Theaters",
  "description": "Lists the movie theaters (cinemas and malls) nearest the user in Metro Manila, with distance. Use it when the user asks what the nearest theaters, cinemas or malls are, or which cinemas are near them, for example 'what are the nearest theaters to me', 'cinemas near me', 'is there a cinema nearby'."
}
</script>

<script setup>
import wx from 'wx';
import { getLocation, getDirectory, getVoiceContext } from '../../utils/services.js';
import { nearestTheaters, NEAREST_LIST_LIMIT } from '../../utils/theaters.js';
import { DEFAULTS } from '../../utils/search.js';
import { locationLabel } from '../../utils/location.js';
import { manilaNow } from '../../utils/dates.js';
import { interpret } from '../../utils/voiceCommand.js';
import { planAction } from '../../utils/voiceFlow.js';
import { createVoiceSession } from '../../utils/voiceSession.js';
import { recordUnclear } from '../../utils/unclearLog.js';
import { routeFor, resultsUrl, theaterUrl } from '../../utils/pageRoutes.js';
import { createHandoff } from '../../utils/handoff.js';
import { createKeyGuard } from '../../utils/keys.js';
import { createPageHelpers } from '../../utils/toast.js';
import { describeError } from '../../utils/errors.js';
import { theaterRows, noTheatersMessage } from '../../utils/viewModel.js';
import { visibleWindow, uniformHeights } from '../../utils/listWindow.js';

const NAV_DELAY_MS = 50;
// Rows on screen at once (same geometry as the movies list).
const VISIBLE_ROWS = 5;

export default {
  ...createPageHelpers(),

  data: {
    state: 'loading',          // loading | ready | empty | error
    location: '',
    rows: [],                  // the nearest cinemas
    visible: [],               // the rows on screen (a window onto `rows`), each with its index `i`
    above: 0,
    below: 0,
    position: '',
    selectedIdx: 0,
    message: '',
    lines: [],
    voiceListening: false,
    toastVisible: false,
    toastText: '',
  },

  onLoad() {
    this.unloaded = false;
    this.loadSeq = 0;
    this.windowStart = 0;
    this._toastTimer = null;
    this._navTimer = null;
    this.keys = createKeyGuard();
    this.handoff = createHandoff(wx);
    this.voice = createVoiceSession({
      onListening: (on) => this.update({ voiceListening: on }),
      onToast: (text) => this.showToast(text),
      onResult: (transcripts) => this.onVoiceResult(transcripts),
    });
    this.load();
  },

  onShow() {
    this.keys.arm();
    this.consumeHandoff();
  },

  onHide() {
    this.voice.abort();
  },

  onUnload() {
    this.unloaded = true;
    this.loadSeq++;
    if (this._navTimer) clearTimeout(this._navTimer);
    this.clearToast();
    this.voice.abort();
  },

  // ── data ─────────────────────────────────────────────────

  async load() {
    const seq = ++this.loadSeq;
    this.windowStart = 0;
    this.update({ state: 'loading', rows: [], visible: [], above: 0, below: 0, position: '', message: '', lines: [], selectedIdx: 0 });

    try {
      const [loc, directory] = await Promise.all([getLocation(), getDirectory(wx)]);
      if (seq !== this.loadSeq) return;
      const where = locationLabel(loc);
      const near = nearestTheaters(directory, loc, { maxKm: DEFAULTS.maxKm, limit: NEAREST_LIST_LIMIT });
      if (!near.length) {
        const msg = noTheatersMessage(DEFAULTS.maxKm);
        this.update({ state: 'empty', message: msg.headline, lines: msg.lines.map((t, i) => ({ id: 'l' + i, text: t })), location: where });
        return;
      }
      const rows = theaterRows(near);
      this.update(Object.assign({ state: 'ready', rows: rows, location: where, selectedIdx: 0 }, this.windowFor(rows, 0)));
    } catch (err) {
      if (seq !== this.loadSeq) return;
      console.error('load failed:', err && err.message ? err.message : err);
      this.update({ state: 'error', message: describeError(err), lines: [] });
    }
  },

  // A movie chosen on the choose page, or a list request, arrives through onShow.
  consumeHandoff() {
    const h = this.handoff.take();
    if (!h) return;
    if (h.type === 'search') {
      this.openMovie(h.movieId, h.date);
    } else if (h.type === 'list') {
      this.go('/pages/movies/movies?date=' + h.date);
    } else if (h.type === 'theater') {
      this.go(theaterUrl(h.slug, h.date, h.movieId));
    }
  },

  // ── navigation ───────────────────────────────────────────

  go(url) {
    if (this._navTimer) clearTimeout(this._navTimer);
    this._navTimer = setTimeout(() => {
      this._navTimer = null;
      if (!this.unloaded) wx.navigateTo({ url: url });
    }, NAV_DELAY_MS);
  },

  openMovie(movieId, date) {
    this.go(resultsUrl(movieId, date || manilaNow(Date.now()).date));
  },

  openTheater(slug) {
    this.go(theaterUrl(slug, manilaNow(Date.now()).date));
  },

  windowFor(rows, selected) {
    const w = visibleWindow(uniformHeights(rows.length, 1), this.windowStart, selected, VISIBLE_ROWS);
    this.windowStart = w.start;
    return {
      visible: rows.slice(w.start, w.end).map((r, k) => Object.assign({}, r, { i: w.start + k })),
      above: w.start,
      below: rows.length - w.end,
      position: rows.length ? (selected + 1) + '/' + rows.length : '',
    };
  },

  select(idx) {
    this.update(Object.assign({ selectedIdx: idx }, this.windowFor(this.data.rows, idx)));
  },

  openSelected() {
    const row = this.data.rows[this.data.selectedIdx];
    if (row) this.openTheater(row.slug);
  },

  // ── keys and touch ───────────────────────────────────────

  onKeyUp(event) {
    const k = this.keys.classify(event);
    if (!k) return;
    if (this.data.state === 'error') {
      if (k === 'enter') this.load();
      return;
    }
    if (this.data.state !== 'ready') return;
    if (k === 'enter') {
      this.openSelected();
      return;
    }
    const next = this.data.selectedIdx + (k === 'next' ? 1 : -1);
    if (next >= 0 && next < this.data.rows.length) this.select(next);
  },

  onTapRow(event) {
    const idx = event && event.currentTarget && event.currentTarget.dataset ? event.currentTarget.dataset.index : -1;
    if (idx < 0 || idx >= this.data.rows.length) return;
    this.select(idx);
    this.openSelected();
  },

  onTapRetry() {
    if (this.data.state === 'error') this.load();
  },

  // ── voice ────────────────────────────────────────────────

  onVoiceWakeup(event) {
    this.voice.handleWake(event);
  },

  async onVoiceResult(transcripts) {
    let ctx;
    try {
      ctx = await getVoiceContext(wx);
    } catch (err) {
      this.showToast(describeError(err));
      return;
    }
    if (this.unloaded) return;
    const now = Date.now();
    const cmd = interpret(transcripts, ctx.catalog, now, { directory: ctx.directory, origin: ctx.origin });
    const action = planAction(cmd, { movie: null, theater: null, date: null }, now);
    // A request the app could not act on is remembered (on this device only) so it can be improved.
    if (action.type === 'toast') recordUnclear(wx, transcripts[0], now);
    this.runAction(action);
  },

  runAction(action) {
    switch (action.type) {
      case 'toast':
        this.showToast(action.text);
        break;
      case 'theaters':
        this.load();
        break;
      default: {
        const url = routeFor(action);
        if (url) this.go(url);
      }
    }
  },
};
</script>

<page>
  <view class="page-root">
    <view class="topbar">
      <text class="topbar-title">Theaters</text>
      <text class="topbar-pos" ink:if="{{position}}">{{position}}</text>
      <text class="topbar-date">Nearest</text>
    </view>

    <view class="center-display" ink:if="{{state === 'loading'}}">
      <view class="scan-line"></view>
      <text class="center-text-large">Finding theaters…</text>
    </view>

    <view class="center-display" ink:if="{{state === 'error'}}" bindtap="onTapRetry">
      <text class="center-glyph">✗</text>
      <text class="center-text">{{message}}</text>
      <text class="center-sub">Tap to retry · Say 'diagnostics'</text>
    </view>

    <view class="center-display" ink:if="{{state === 'empty'}}">
      <text class="center-text">{{message}}</text>
      <text class="center-sub" ink:for="{{lines}}" ink:key="id">{{item.text}}</text>
    </view>

    <view class="list-body" ink:if="{{state === 'ready'}}">
      <view ink:for="{{visible}}" ink:key="id" class="row" data-index="{{item.i}}" bindtap="onTapRow">
        <view class="row-marker">
          <view class="marker-dot" ink:if="{{selectedIdx === item.i}}"></view>
        </view>
        <view class="row-bar" ink:if="{{selectedIdx === item.i}}"></view>
        <view class="row-main">
          <text class="row-name row-name-selected" ink:if="{{selectedIdx === item.i}}">{{item.title}}</text>
          <text class="row-name" ink:if="{{selectedIdx !== item.i}}">{{item.title}}</text>
          <text class="row-city">{{item.city}}</text>
        </view>
        <text class="row-meta">{{item.meta}}</text>
      </view>
      <text class="more more-up" ink:if="{{above > 0}}">▲</text>
      <text class="more more-down" ink:if="{{below > 0}}">▼</text>
    </view>

    <view class="hintbar" ink:if="{{!voiceListening}}">
      <text class="hint-text">Swipe select · Tap open · Say a movie</text>
      <text class="hint-right">{{location}}</text>
    </view>

    <view class="hintbar" ink:if="{{voiceListening}}">
      <text class="voice-banner-text">Listening… say a movie, or 'what's showing'</text>
    </view>

    <view class="toast" ink:if="{{toastVisible}}">
      <text class="toast-text">{{toastText}}</text>
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

  .topbar-date {
    font-size: 13px;
    line-height: 18px;
    color: rgba(64, 255, 94, 0.72);
    margin-left: auto;
  }

  .center-display {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .center-glyph {
    font-size: 28px;
    line-height: 34px;
    color: rgba(64, 255, 94, 0.72);
  }

  .center-text-large {
    font-size: 20px;
    line-height: 26px;
    color: rgba(64, 255, 94, 0.72);
    text-align: center;
  }

  .center-text {
    font-size: 15px;
    line-height: 20px;
    color: #40ff5e;
    text-align: center;
    padding: 0 16px;
  }

  .center-sub {
    font-size: 12px;
    line-height: 17px;
    color: rgba(64, 255, 94, 0.48);
    text-align: center;
  }

  .scan-line {
    width: 100px;
    height: 1px;
    background-color: rgba(64, 255, 94, 0.72);
    animation: scan-move 1.2s ease-in-out infinite;
  }

  @keyframes scan-move {
    0% { transform: translateY(-16px); opacity: 0.24; }
    50% { transform: translateY(16px); opacity: 0.72; }
    100% { transform: translateY(-16px); opacity: 0.24; }
  }

  .topbar-pos {
    font-size: 11px;
    line-height: 15px;
    color: rgba(64, 255, 94, 0.48);
    font-family: monospace;
    margin-left: 10px;
  }

  .list-body {
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 8px;
    position: relative;
    overflow: hidden;
  }

  /* "more above / below" markers, on the right edge, only when rows are hidden */
  .more {
    position: absolute;
    right: 2px;
    font-size: 9px;
    line-height: 11px;
    color: rgba(64, 255, 94, 0.72);
  }

  .more-up {
    top: 0;
  }

  .more-down {
    bottom: 0;
  }

  .row {
    display: flex;
    flex-direction: row;
    align-items: center;
    height: 44px;
    flex: 0 0 44px;
    padding: 0 8px 0 0;
    box-sizing: border-box;
    border: 2px solid transparent;
    border-radius: 4px;
    position: relative;
    margin-bottom: 4px;
  }

  .row-marker {
    width: 20px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 20px;
  }

  .marker-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #40ff5e;
  }

  .row-bar {
    position: absolute;
    top: 0;
    left: 0;
    width: 4px;
    height: 44px;
    background-color: #40ff5e;
    border-radius: 2px 0 0 2px;
  }

  .row-main {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    padding-left: 4px;
  }

  .row-name {
    font-size: 15px;
    line-height: 20px;
    color: rgba(64, 255, 94, 0.72);
  }

  .row-city {
    font-size: 11px;
    line-height: 15px;
    color: rgba(64, 255, 94, 0.48);
  }

  .row-name-selected {
    color: #40ff5e;
  }

  .row-meta {
    font-size: 12px;
    line-height: 16px;
    color: rgba(64, 255, 94, 0.48);
    font-family: monospace;
    flex: 0 0 auto;
  }

  .hintbar {
    display: flex;
    flex-direction: row;
    align-items: center;
    height: 18px;
    flex: 0 0 18px;
    margin-top: 4px;
  }

  .hint-text {
    font-size: 11px;
    line-height: 15px;
    color: rgba(64, 255, 94, 0.48);
  }

  .hint-right {
    font-size: 11px;
    line-height: 15px;
    color: rgba(64, 255, 94, 0.72);
    margin-left: auto;
  }

  .voice-banner-text {
    font-size: 11px;
    line-height: 15px;
    color: #40ff5e;
  }

  .toast {
    position: absolute;
    bottom: 26px;
    right: 16px;
    padding: 6px 12px;
    background-color: rgba(64, 255, 94, 0.12);
    border: 1px solid rgba(64, 255, 94, 0.72);
    border-radius: 4px;
  }

  .toast-text {
    font-size: 12px;
    line-height: 17px;
    color: #40ff5e;
  }
</style>
