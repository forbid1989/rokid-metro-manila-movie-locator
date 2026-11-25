<script def>
{
  "navigationBarTitleText": "Showtimes",
  "description": "Shows which Metro Manila cinemas near the user are showing a movie, with distance and showtimes. Use it only when the user names a movie and asks where, when or at which theaters or cinemas it is showing, for example 'what theaters are showing Godzilla right now', 'can you check if Godzilla is showing in theaters', 'where can I watch Godzilla', 'what places are showing Godzilla'.",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "The movie title exactly as the user said it, for example Godzilla Minus Zero. A partial title is fine. Leave this out if the user did not name a movie; never write null."
        },
        "theater": {
          "type": "string",
          "description": "Only if the user also named a cinema or mall, for example SM Megamall. Leave out otherwise."
        },
        "date": {
          "type": "string",
          "description": "The day: YYYY-MM-DD, or today, tomorrow or a weekday. Omit for today."
        }
      }
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { findMovieShowtimes } from '../../utils/search.js';
import { getApi, getCatalog, getLocation, getVoiceContext, getDirectory } from '../../utils/services.js';
import { resolveTheater } from '../../utils/theaterMatch.js';
import { locationLabel } from '../../utils/location.js';
import { manilaNow } from '../../utils/dates.js';
import { resolveDateParam } from '../../utils/datePhrase.js';
import { resolveMovie } from '../../utils/titleMatch.js';
import { truncate } from '../../utils/format.js';
import { interpret } from '../../utils/voiceCommand.js';
import { planAction } from '../../utils/voiceFlow.js';
import { createVoiceSession } from '../../utils/voiceSession.js';
import { recordUnclear } from '../../utils/unclearLog.js';
import { routeFor, chooseMoviesUrl, theaterUrl, theaterByNameUrl, moviesUrl } from '../../utils/pageRoutes.js';
import { readMovieQuery } from '../../utils/pageQuery.js';
import { createHandoff } from '../../utils/handoff.js';
import { createKeyGuard } from '../../utils/keys.js';
import { createPageHelpers } from '../../utils/toast.js';
import { describeError } from '../../utils/errors.js';
import { dateHeader, ratingRuntime, resultRows, resultMessage, mallHeights, RESULTS_BUDGET_PX } from '../../utils/viewModel.js';
import { visibleWindow } from '../../utils/listWindow.js';

const NAV_DELAY_MS = 50;

export default {
  ...createPageHelpers(),

  data: {
    state: 'loading',          // loading | ready | message | error
    title: '',
    meta: '',
    header: '',
    location: '',
    rows: [],                  // every row of every mall
    visible: [],               // the rows of the malls on screen (a window onto `rows`)
    above: 0,                  // malls hidden above / below the window
    below: 0,
    position: '',              // '2/5'
    selectedMall: 0,
    message: '',
    lines: [],
    note: '',
    voiceListening: false,
    toastVisible: false,
    toastText: '',
  },

  onLoad(query) {
    this.unloaded = false;
    this.loadSeq = 0;
    this.movie = null;
    this.date = null;
    this.mallHeights = [];
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
    this.start(query || {});
  },

  // Opened with `movie` (a catalog id, from our own screens) or with `name` (a
  // title as spoken, from the host assistant), and an optional `date`.
  start(query) {
    // Logged so a host assistant that fills in the parameters unexpectedly can be seen in the Logs panel.
    console.log('results page opened with', JSON.stringify(query || {}));
    const q = readMovieQuery(query);
    const date = resolveDateParam(q.date, Date.now());
    const day = date || manilaNow(Date.now()).date;

    // The user named a cinema: that is the theater screen's job, not this one's.
    if (q.theater) {
      this.update({ state: 'loading', header: dateHeader(day, Date.now()) });
      this.go(theaterByNameUrl(q.theater, q.name, day) + (q.movieId ? '&movieId=' + q.movieId : ''));
      return;
    }
    if (q.movieId) {
      this.load(q.movieId, date);
      return;
    }
    if (q.name) {
      this.loadByName(q.name, date);
      return;
    }
    // No movie at all ("what movies are showing"): the movie list is the answer.
    this.go(moviesUrl(day));
    this.update({
      state: 'message',
      title: 'Showtimes',
      header: dateHeader(date || manilaNow(Date.now()).date, Date.now()),
      message: 'Say a movie name',
      lines: [{ id: 'l0', text: "for example 'where is Godzilla showing'" }],
    });
  },

  async loadByName(name, date) {
    const seq = ++this.loadSeq;
    const now = Date.now();
    const day = date || manilaNow(now).date;
    this.date = day;
    this.update({ state: 'loading', header: dateHeader(day, now), rows: [], message: '', lines: [], note: '' });

    let catalog;
    try {
      catalog = await getCatalog();
    } catch (err) {
      if (seq !== this.loadSeq) return;
      this.update({ state: 'error', message: describeError(err), lines: [] });
      return;
    }
    if (seq !== this.loadSeq) return;

    const res = resolveMovie([name], catalog);
    if (res.status === 'match') {
      this.load(res.movie.id, day);
    } else if (res.status === 'none') {
      // Not a movie. The assistant may have put a cinema's name here ("what movies are showing at SM Megamall").
      let cinema = null;
      try {
        cinema = resolveTheater([name], await getDirectory(wx));
      } catch (e) { /* the directory is a best-effort check here */ }
      if (seq !== this.loadSeq) return;
      if (cinema && cinema.status === 'match') {
        this.go(theaterByNameUrl(name, '', day));
        return;
      }
      this.update({ state: 'message', title: truncate(name, 30), message: "No movie matching '" + truncate(name, 24) + "'", lines: [{ id: 'l0', text: 'Try the full title' }] });
    } else {
      // Close but not exact: let the user pick; the choice comes back through onShow.
      const movies = res.status === 'confirm' ? [res.movie] : res.candidates.map((c) => c.movie);
      this.go(chooseMoviesUrl(res.status === 'confirm' ? 'confirm' : 'pick', day, movies, ''));
    }
  },

  onShow() {
    this.keys.arm();
    const h = this.handoff.take();
    if (h && h.type === 'search') this.load(h.movieId, h.date);
    else if (h && h.type === 'theater') this.go(theaterUrl(h.slug, h.date || this.date, h.movieId));
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

  // Show where movie `movieId` is on `date` (null = today in Manila).
  async load(movieId, date) {
    const seq = ++this.loadSeq;
    const now = Date.now();
    const day = date || manilaNow(now).date;
    this.movieId = movieId;
    this.date = day;
    this.windowStart = 0;
    this.mallHeights = [];
    this.update({ state: 'loading', header: dateHeader(day, now), rows: [], visible: [], above: 0, below: 0, position: '', message: '', lines: [], note: '', selectedMall: 0 });

    try {
      const catalog = await getCatalog();
      if (seq !== this.loadSeq) return;
      const movie = catalog.find((m) => m.id === movieId);
      if (!movie) {
        this.update({ state: 'message', title: 'Movie', meta: '', message: 'Movie not found', lines: [{ id: 'l0', text: 'It may no longer be showing' }] });
        return;
      }
      this.movie = movie;
      this.update({ title: truncate(movie.title, 30), meta: ratingRuntime(movie.rating, movie.runtime) });

      const loc = await getLocation();
      if (seq !== this.loadSeq) return;
      const res = await findMovieShowtimes({ get: getApi().get, now: Date.now }, { movie: movie, date: day, location: loc });
      if (seq !== this.loadSeq) return;

      const where = locationLabel(loc);
      if (res.status === 'ok') {
        const built = resultRows(res.malls);
        this.mallHeights = mallHeights(built.rows);
        this.update(Object.assign({
          state: 'ready',
          rows: built.rows,
          selectedMall: 0,
          location: where,
          note: res.failures > 0 ? 'Some cinemas could not be checked' : '',
        }, this.windowFor(built.rows, 0)));
        return;
      }
      const msg = resultMessage(res, Date.now());
      this.update({ state: 'message', message: msg.headline, lines: msg.lines.map((t, i) => ({ id: 'l' + i, text: t })), location: where });
    } catch (err) {
      if (seq !== this.loadSeq) return;
      console.error('load failed:', err && err.message ? err.message : err);
      this.update({ state: 'error', message: describeError(err), lines: [] });
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

  // The malls to show with `selected` highlighted. The highlight moves through
  // the visible malls; the window slides only when it reaches an edge.
  windowFor(rows, selected) {
    const w = visibleWindow(this.mallHeights, this.windowStart, selected, RESULTS_BUDGET_PX);
    this.windowStart = w.start;
    return {
      visible: rows.filter((r) => r.mallIdx >= w.start && r.mallIdx < w.end),
      above: w.start,
      below: this.mallHeights.length - w.end,
      position: this.mallHeights.length ? (selected + 1) + '/' + this.mallHeights.length : '',
    };
  },

  selectMall(idx) {
    this.update(Object.assign({ selectedMall: idx }, this.windowFor(this.data.rows, idx)));
  },

  // ── keys and touch ───────────────────────────────────────

  onKeyUp(event) {
    const k = this.keys.classify(event);
    if (!k) return;
    if (this.data.state === 'error') {
      if (k === 'enter') this.load(this.movieId, this.date);
      return;
    }
    if (this.data.state !== 'ready' || k === 'enter') return;
    const next = this.data.selectedMall + (k === 'next' ? 1 : -1);
    if (next >= 0 && next < this.mallHeights.length) this.selectMall(next);
  },

  onTapRetry() {
    if (this.data.state === 'error') this.load(this.movieId, this.date);
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
    const action = planAction(cmd, { movie: this.movie, theater: null, date: this.date }, now);
    // A request the app could not act on is remembered (on this device only) so it can be improved.
    if (action.type === 'toast') recordUnclear(wx, transcripts[0], now);
    this.runAction(action);
  },

  runAction(action) {
    switch (action.type) {
      case 'toast':
        this.showToast(action.text);
        break;
      case 'search':
        // Re-use this screen rather than stacking another on top.
        this.load(action.movie.id, action.date);
        break;
      case 'list':
        // The list lives underneath: leave it a note and go back.
        this.handoff.set({ type: 'list', date: action.date });
        wx.navigateBack();
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
      <text class="topbar-title">{{title}}</text>
      <text class="topbar-meta">{{meta}}</text>
    </view>
    <view class="subbar">
      <text class="subbar-text">{{header}}</text>
    </view>

    <view class="center-display" ink:if="{{state === 'loading'}}">
      <view class="scan-line"></view>
      <text class="center-text-large">Finding showtimes…</text>
    </view>

    <view class="center-display" ink:if="{{state === 'error'}}" bindtap="onTapRetry">
      <text class="center-glyph">✗</text>
      <text class="center-text">{{message}}</text>
      <text class="center-sub">Tap to retry · Say 'diagnostics'</text>
    </view>

    <view class="center-display" ink:if="{{state === 'message'}}">
      <text class="center-text">{{message}}</text>
      <text class="center-sub" ink:for="{{lines}}" ink:key="id">{{item.text}}</text>
    </view>

    <view class="list-body" ink:if="{{state === 'ready'}}">
      <view ink:for="{{visible}}" ink:key="id" class="r">
        <view class="r-mall" ink:if="{{item.kind === 'mall'}}">
          <view class="marker">
            <view class="marker-dot" ink:if="{{selectedMall === item.mallIdx}}"></view>
          </view>
          <text class="mall-name mall-name-sel" ink:if="{{selectedMall === item.mallIdx}}">{{item.text}}</text>
          <text class="mall-name" ink:if="{{selectedMall !== item.mallIdx}}">{{item.text}}</text>
          <text class="mall-dist">{{item.right}}</text>
        </view>
        <view class="r-times" ink:if="{{item.kind === 'times'}}">
          <text class="t-label" ink:if="{{item.label}}">{{item.label}}</text>
          <text class="t-times">{{item.text}}</text>
        </view>
      </view>
      <text class="more more-up" ink:if="{{above > 0}}">▲</text>
      <text class="more more-down" ink:if="{{below > 0}}">▼</text>
    </view>

    <view class="hintbar" ink:if="{{!voiceListening}}">
      <text class="hint-text" ink:if="{{note}}">{{note}}</text>
      <text class="hint-text" ink:if="{{!note}}">Swipe select · Say a movie or day</text>
      <text class="hint-pos" ink:if="{{position}}">{{position}}</text>
      <text class="hint-right">{{location}}</text>
    </view>

    <view class="hintbar" ink:if="{{voiceListening}}">
      <text class="voice-banner-text">Listening… say a movie, or 'tomorrow'</text>
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
    height: 26px;
    flex: 0 0 26px;
  }

  .topbar-title {
    font-size: 16px;
    line-height: 22px;
    color: #40ff5e;
    font-weight: 700;
  }

  .topbar-meta {
    font-size: 13px;
    line-height: 18px;
    color: rgba(64, 255, 94, 0.72);
    margin-left: auto;
    font-family: monospace;
  }

  .subbar {
    display: flex;
    flex-direction: row;
    align-items: center;
    height: 20px;
    flex: 0 0 20px;
  }

  .subbar-text {
    font-size: 12px;
    line-height: 16px;
    color: rgba(64, 255, 94, 0.48);
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

  .list-body {
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 6px;
    position: relative;
    overflow: hidden;
  }

  /* "more above / below" markers, on the right edge, only when malls are hidden */
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

  .hint-pos {
    font-size: 11px;
    line-height: 15px;
    color: rgba(64, 255, 94, 0.48);
    font-family: monospace;
    margin-left: 10px;
  }

  .r {
    display: flex;
    flex-direction: column;
    flex: 0 0 auto;
  }

  .r-mall {
    display: flex;
    flex-direction: row;
    align-items: center;
    height: 24px;
    margin-top: 8px;
  }

  .marker {
    width: 20px;
    height: 24px;
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

  .mall-name {
    font-size: 15px;
    line-height: 20px;
    color: rgba(64, 255, 94, 0.72);
    flex: 1 1 auto;
    min-width: 0;
  }

  .mall-name-sel {
    color: #40ff5e;
    font-weight: 700;
  }

  .mall-dist {
    font-size: 12px;
    line-height: 16px;
    color: rgba(64, 255, 94, 0.48);
    font-family: monospace;
    flex: 0 0 auto;
  }

  .r-times {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    padding-left: 20px;
    padding-top: 2px;
    gap: 8px;
  }

  .t-label {
    font-size: 11px;
    line-height: 17px;
    color: #40ff5e;
    flex: 0 0 auto;
  }

  .t-times {
    font-size: 13px;
    line-height: 17px;
    color: rgba(64, 255, 94, 0.72);
    font-family: monospace;
    flex: 1 1 auto;
    min-width: 0;
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
