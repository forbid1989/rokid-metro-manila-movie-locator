<script def>
{
  "navigationBarTitleText": "Ask",
  "description": "Use this for any question about movies or cinemas in Metro Manila: where or when a movie is showing, what is showing today or on a day, what a particular cinema or mall is showing, whether a movie is at a cinema, or the nearest theaters. Pass the user's request exactly as they said it; the app works out the rest. Examples: 'where can I watch Godzilla', 'what movies are showing in SM Megamall', 'is Godzilla showing at Galleria tomorrow', 'nearest cinemas', 'what's showing on Friday'.",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "request": {
          "type": "string",
          "minLength": 1,
          "description": "What the user said, word for word. Do not rephrase, summarise or split it into parts."
        }
      },
      "required": ["request"]
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { getVoiceContext } from '../../utils/services.js';
import { routeRequest, suggestions } from '../../utils/askRouter.js';
import { readAskQuery } from '../../utils/pageQuery.js';
import { recordUnclear } from '../../utils/unclearLog.js';
import { createVoiceSession } from '../../utils/voiceSession.js';
import { createKeyGuard } from '../../utils/keys.js';
import { createPageHelpers } from '../../utils/toast.js';
import { describeError } from '../../utils/errors.js';
import { truncate } from '../../utils/format.js';

const NAV_DELAY_MS = 50;

// The entry for "ask anything": works out what was asked and opens the right
// screen. It stays out of the way: it replaces itself when it can, and when it
// cannot it steps aside as soon as you come back to it.
export default {
  ...createPageHelpers(),

  data: {
    state: 'loading',          // loading | unsure | error
    heard: '',
    message: '',
    options: [],
    selectedIdx: 0,
    voiceListening: false,
    toastVisible: false,
    toastText: '',
  },

  onLoad(query) {
    this.unloaded = false;
    this.runSeq = 0;
    this.shown = 0;
    this.routed = false;
    this._toastTimer = null;
    this._navTimer = null;
    this.keys = createKeyGuard();
    this.voice = createVoiceSession({
      onListening: (on) => this.update({ voiceListening: on }),
      onToast: (text) => this.showToast(text),
      onResult: (transcripts) => this.run(transcripts),
    });
    // Logged so a host assistant that fills the parameters unexpectedly can be seen in the Logs panel.
    console.log('ask page opened with', JSON.stringify(query || {}));
    this.run([readAskQuery(query).request]);
  },

  onShow() {
    this.shown++;
    this.keys.arm();
    // Coming back to this screen after it sent you on: it has nothing to show, so step aside.
    if (this.routed && this.shown > 1) {
      this.routed = false;
      wx.navigateBack();
    }
  },

  onHide() {
    this.voice.abort();
  },

  onUnload() {
    this.unloaded = true;
    this.runSeq++;
    if (this._navTimer) clearTimeout(this._navTimer);
    this.clearToast();
    this.voice.abort();
  },

  // ── understanding ────────────────────────────────────────

  async run(texts) {
    const seq = ++this.runSeq;
    const list = (texts || []).filter((t) => String(t || '').trim());
    this.lastText = list[0] || '';
    this.update({ state: 'loading', heard: truncate(list[0] || '', 60), message: '', options: [], selectedIdx: 0 });

    let ctx;
    try {
      ctx = await getVoiceContext(wx);
    } catch (err) {
      if (seq !== this.runSeq) return;
      this.update({ state: 'error', message: describeError(err) });
      return;
    }
    if (seq !== this.runSeq) return;

    const now = Date.now();
    const result = routeRequest(list, ctx, now);
    console.log('ask routed', JSON.stringify({ heard: result.heard, kind: result.kind, url: result.url || null }));
    if (result.kind === 'route') {
      this.routed = true;
      this.update({ heard: truncate(result.echo, 60) });
      this.send(result.url);
      return;
    }
    if (list.length) recordUnclear(wx, list[0], now);
    this.update({ state: 'unsure', message: result.message, heard: truncate(result.heard, 60), options: result.options, selectedIdx: 0 });
  },

  // Replace this screen when the runtime can; otherwise stack on top (and step aside on return).
  send(url) {
    if (this._navTimer) clearTimeout(this._navTimer);
    this._navTimer = setTimeout(() => {
      this._navTimer = null;
      if (this.unloaded) return;
      if (typeof wx.redirectTo === 'function') {
        this.routed = false;
        wx.redirectTo({ url: url });
      } else {
        wx.navigateTo({ url: url });
      }
    }, NAV_DELAY_MS);
  },

  // ── keys, touch, voice ───────────────────────────────────

  open(idx) {
    const o = this.data.options[idx];
    if (!o) return;
    this.routed = false;   // a way on you chose: coming back should show these options again
    if (this._navTimer) clearTimeout(this._navTimer);
    wx.navigateTo({ url: o.url });
  },

  onKeyUp(event) {
    const k = this.keys.classify(event);
    if (!k) return;
    if (this.data.state === 'error') {
      if (k === 'enter') this.run([this.lastText || '']);
      return;
    }
    if (this.data.state !== 'unsure') return;
    if (k === 'enter') {
      this.open(this.data.selectedIdx);
      return;
    }
    const next = this.data.selectedIdx + (k === 'next' ? 1 : -1);
    if (next >= 0 && next < this.data.options.length) this.update({ selectedIdx: next });
  },

  onTapRow(event) {
    const idx = event && event.currentTarget && event.currentTarget.dataset ? event.currentTarget.dataset.index : -1;
    if (idx < 0 || idx >= this.data.options.length) return;
    this.update({ selectedIdx: idx });
    this.open(idx);
  },

  onVoiceWakeup(event) {
    this.voice.handleWake(event);
  },
};
</script>

<page>
  <view class="page-root">
    <view class="topbar">
      <text class="topbar-title">Ask</text>
    </view>

    <view class="center-display" ink:if="{{state === 'loading'}}">
      <view class="scan-line"></view>
      <text class="center-text-large">Understanding…</text>
      <text class="center-sub">{{heard}}</text>
    </view>

    <view class="center-display" ink:if="{{state === 'error'}}">
      <text class="center-glyph">✗</text>
      <text class="center-text">{{message}}</text>
      <text class="center-sub">Say it again</text>
    </view>

    <view class="notice" ink:if="{{state === 'unsure'}}">
      <text class="center-text">{{message}}</text>
      <text class="center-sub" ink:if="{{heard}}">"{{heard}}"</text>
    </view>

    <view class="list-body" ink:if="{{state === 'unsure'}}">
      <view ink:for="{{options}}" ink:key="id" class="row" data-index="{{index}}" bindtap="onTapRow">
        <view class="row-marker">
          <view class="marker-dot" ink:if="{{selectedIdx === index}}"></view>
        </view>
        <view class="row-bar" ink:if="{{selectedIdx === index}}"></view>
        <view class="row-main">
          <text class="row-name row-name-selected" ink:if="{{selectedIdx === index}}">{{item.label}}</text>
          <text class="row-name" ink:if="{{selectedIdx !== index}}">{{item.label}}</text>
        </view>
      </view>
    </view>

    <view class="hintbar" ink:if="{{!voiceListening}}">
      <text class="hint-text">Swipe select · Tap open · Or say it again</text>
    </view>

    <view class="hintbar" ink:if="{{voiceListening}}">
      <text class="voice-banner-text">Listening… say a movie, a cinema or a day</text>
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

  .notice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 18px 16px 10px 16px;
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
