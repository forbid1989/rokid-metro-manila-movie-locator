<script def>
{
  "navigationBarTitleText": "Choose"
}
</script>

<script setup>
import wx from 'wx';
import { getCatalog, getDirectory, getLocation } from '../../utils/services.js';
import { withDistance } from '../../utils/theaters.js';
import { createHandoff } from '../../utils/handoff.js';
import { createKeyGuard } from '../../utils/keys.js';
import { createPageHelpers } from '../../utils/toast.js';
import { describeError } from '../../utils/errors.js';
import { movieRows, theaterRows } from '../../utils/viewModel.js';

// Shown when the spoken title (or cinema) was not an exact match: "did you mean
// X?" (one candidate) or "which one?" (several). Picking leaves a note for the
// page underneath and goes back; Backspace (double-tap) cancels.
//
// Movies (default): ids=<movie ids>, and theater=<slug> when the request also
// named a cinema. Cinemas (kind=theater): slugs=<cinema slugs>, and movie=<id>
// when the request also named a movie.
export default {
  ...createPageHelpers(),

  data: {
    state: 'loading',          // loading | ready | error
    title: '',
    hint: '',
    rows: [],
    selectedIdx: 0,
    message: '',
    toastVisible: false,
    toastText: '',
  },

  onLoad(query) {
    this.unloaded = false;
    this._toastTimer = null;
    this.keys = createKeyGuard();
    this.handoff = createHandoff(wx);
    this.date = query && query.date ? query.date : null;
    const confirm = !!query && query.mode === 'confirm';
    this.kind = query && query.kind === 'theater' ? 'theater' : 'movie';
    this.update({
      title: confirm ? 'Did you mean…?' : (this.kind === 'theater' ? 'Which theater?' : 'Which movie?'),
      hint: confirm ? 'Tap yes · Double-tap cancel' : 'Swipe select · Tap choose · Double-tap cancel',
    });
    this.ids = String((query && query.ids) || '').split(',').map(Number).filter(Boolean);
    this.slugs = String((query && query.slugs) || '').split(',').filter(Boolean);
    this.theaterSlug = query && query.theater ? String(query.theater) : '';   // carry on with this cinema
    this.movieId = Number(query && query.movie) || 0;                         // carry on with this movie
    this.load();
  },

  onShow() {
    this.keys.arm();
  },

  onUnload() {
    this.unloaded = true;
    this.clearToast();
  },

  async load() {
    if (this.kind === 'theater') {
      await this.loadTheaters();
      return;
    }
    try {
      const catalog = await getCatalog();
      if (this.unloaded) return;
      // Keep the order the candidates were given in (best first).
      const movies = this.ids.map((id) => catalog.find((m) => m.id === id)).filter(Boolean);
      if (!movies.length) {
        this.update({ state: 'error', message: 'Those movies are no longer listed' });
        return;
      }
      this.update({ state: 'ready', rows: movieRows(movies, { year: true }), selectedIdx: 0 });
    } catch (err) {
      if (this.unloaded) return;
      this.update({ state: 'error', message: describeError(err) });
    }
  },

  async loadTheaters() {
    try {
      const [directory, loc] = await Promise.all([getDirectory(wx), getLocation()]);
      if (this.unloaded) return;
      // Keep the order the candidates were given in (best first).
      const found = this.slugs.map((slug) => directory.find((t) => t.slug === slug)).filter(Boolean);
      if (!found.length) {
        this.update({ state: 'error', message: 'Those theaters are no longer listed' });
        return;
      }
      const near = withDistance(found, loc);
      const rows = this.slugs.map((slug) => near.find((t) => t.slug === slug)).filter(Boolean);
      this.update({ state: 'ready', rows: theaterRows(rows), selectedIdx: 0 });
    } catch (err) {
      if (this.unloaded) return;
      this.update({ state: 'error', message: describeError(err) });
    }
  },

  select(idx) {
    this.update({ selectedIdx: idx });
  },

  choose() {
    const row = this.data.rows[this.data.selectedIdx];
    if (!row) return;
    if (this.kind === 'theater') {
      this.handoff.set({ type: 'theater', slug: row.slug, movieId: this.movieId, date: this.date });
    } else if (this.theaterSlug) {
      this.handoff.set({ type: 'theater', slug: this.theaterSlug, movieId: row.movieId, date: this.date });
    } else {
      this.handoff.set({ type: 'search', movieId: row.movieId, date: this.date });
    }
    wx.navigateBack();
  },

  onKeyUp(event) {
    const k = this.keys.classify(event);
    if (!k || this.data.state !== 'ready') return;
    if (k === 'enter') {
      this.choose();
      return;
    }
    const next = this.data.selectedIdx + (k === 'next' ? 1 : -1);
    if (next >= 0 && next < this.data.rows.length) this.select(next);
  },

  onTapRow(event) {
    const idx = event && event.currentTarget && event.currentTarget.dataset ? event.currentTarget.dataset.index : -1;
    if (idx < 0 || idx >= this.data.rows.length) return;
    this.select(idx);
    this.choose();
  },
};
</script>

<page>
  <view class="page-root">
    <view class="topbar">
      <text class="topbar-title">{{title}}</text>
    </view>

    <view class="center-display" ink:if="{{state === 'loading'}}">
      <view class="scan-line"></view>
    </view>

    <view class="center-display" ink:if="{{state === 'error'}}">
      <text class="center-glyph">✗</text>
      <text class="center-text">{{message}}</text>
      <text class="center-sub">Double-tap to go back</text>
    </view>

    <view class="list-body" ink:if="{{state === 'ready'}}">
      <view ink:for="{{rows}}" ink:key="id" class="row" data-index="{{index}}" bindtap="onTapRow">
        <view class="row-marker">
          <view class="marker-dot" ink:if="{{selectedIdx === index}}"></view>
        </view>
        <view class="row-bar" ink:if="{{selectedIdx === index}}"></view>
        <text class="row-name row-name-selected" ink:if="{{selectedIdx === index}}">{{item.title}}</text>
        <text class="row-name" ink:if="{{selectedIdx !== index}}">{{item.title}}</text>
        <text class="row-meta">{{item.meta}}</text>
      </view>
    </view>

    <view class="hintbar">
      <text class="hint-text">{{hint}}</text>
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

  .list-body {
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 8px;
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

  .row-name {
    font-size: 15px;
    line-height: 20px;
    color: rgba(64, 255, 94, 0.72);
    flex: 1 1 auto;
    min-width: 0;
    padding-left: 4px;
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
