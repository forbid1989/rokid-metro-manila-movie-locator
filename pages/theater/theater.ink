<script def>
{
  "navigationBarTitleText": "Theater",
  "description": "Shows what movies are showing at one Metro Manila cinema (mall) on a day, or whether a particular movie is showing there. Use it whenever the user names a cinema or mall: 'what movies are being shown in Robinsons Galleria Ortigas', 'what are the movies at SM MegaMall', 'is Godzilla showing at SM MegaMall today', 'what's playing at The Podium tomorrow'. The screen is titled with the cinema and lists its movies.",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "theater": {
          "type": "string",
          "minLength": 1,
          "description": "The cinema or mall name exactly as the user said it, for example SM Megamall, Galleria, The Podium or Robinsons Galleria Ortigas. Always fill this in when the user names a cinema or mall. A partial name is fine."
        },
        "movie": {
          "type": "string",
          "description": "Optional. The movie title as the user said it, for example Godzilla, when they ask whether it is showing at that cinema."
        },
        "date": {
          "type": "string",
          "description": "The day: YYYY-MM-DD, or today, tomorrow or a weekday. Omit for today."
        }
      },
      "required": ["theater"]
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { loadTheaterDay, findMovieAtTheater } from '../../utils/theaterSearch.js';
import { getApi, getCatalog, getDirectory, getLocation, getVoiceContext, invalidateDirectory } from '../../utils/services.js';
import { resolveTheater } from '../../utils/theaterMatch.js';
import { resolveMovie } from '../../utils/titleMatch.js';
import { haversineKm, formatKm } from '../../utils/geo.js';
import { locationLabel } from '../../utils/location.js';
import { manilaNow } from '../../utils/dates.js';
import { resolveDateParam } from '../../utils/datePhrase.js';
import { truncate } from '../../utils/format.js';
import { interpret } from '../../utils/voiceCommand.js';
import { planAction } from '../../utils/voiceFlow.js';
import { createVoiceSession } from '../../utils/voiceSession.js';
import { recordUnclear } from '../../utils/unclearLog.js';
import { createHandoff } from '../../utils/handoff.js';
import { createKeyGuard } from '../../utils/keys.js';
import { createPageHelpers } from '../../utils/toast.js';
import { describeError } from '../../utils/errors.js';
import { dateHeader, ratingRuntime, resultRows, mallHeights, RESULTS_BUDGET_PX, theaterDayMessage, notHereHeader, notHereMessage, theaterMovieRows } from '../../utils/viewModel.js';
import { visibleWindow, uniformHeights } from '../../utils/listWindow.js';
import { routeFor, resultsUrl, resultsByNameUrl, theaterUrl, chooseTheatersUrl, chooseMoviesUrl } from '../../utils/pageRoutes.js';
import { readTheaterQuery } from '../../utils/pageQuery.js';

const NAV_DELAY_MS = 50;
// Rows on screen in the movie list (same geometry as the other lists).
const VISIBLE_ROWS = 5;

// One cinema on one day: either everything showing there, or (with a movie)
// whether that movie is there and, if not, where nearby it is.
export default {
  ...createPageHelpers(),

  data: {
    state: 'loading',          // loading | list (movies at the cinema) | ready (showtime blocks) | message | error
    title: '',
    meta: '',
    header: '',
    location: '',
    rows: [],                  // every row of every block
    visible: [],               // the blocks on screen (a window onto `rows`)
    above: 0,
    below: 0,
    position: '',
    selectedMall: 0,           // the selected block
    items: [],                 // the movie list: every movie at the cinema
    itemsVisible: [],          // the rows on screen, each with its index `i`
    itemSel: 0,
    itemsAbove: 0,
    itemsBelow: 0,
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
    this.theater = null;
    this.movie = null;
    this.date = null;
    this.spec = null;
    this.blocks = [];          // what each block opens: { movieId, slug }
    this.mallHeights = [];
    this.windowStart = 0;
    this.itemStart = 0;
    this._toastTimer = null;
    this._navTimer = null;
    this.keys = createKeyGuard();
    this.handoff = createHandoff(wx);
    this.voice = createVoiceSession({
      onListening: (on) => this.update({ voiceListening: on }),
      onToast: (text) => this.showToast(text),
      onResult: (transcripts) => this.onVoiceResult(transcripts),
    });
    // Logged so a host assistant that names its parameters unexpectedly can be seen in the Logs panel.
    console.log('theater page opened with', JSON.stringify(query || {}));
    const q = readTheaterQuery(query);
    this.open({
      slug: q.slug,
      spokenTheater: q.theater,
      movieId: q.movieId,
      spokenMovie: q.movie,
      date: resolveDateParam(q.date, Date.now()),
    });
  },

  onShow() {
    this.keys.arm();
    const h = this.handoff.take();
    if (h && h.type === 'theater') {
      this.open({ slug: h.slug, movieId: h.movieId || 0, date: h.date });
    }
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

  // Show a cinema on a day, with an optional movie. The cinema and movie come
  // as objects (from a spoken command), ids/slugs (our own screens) or names as
  // said (the host assistant). Names that are not exact go to the choose screen.
  async open(spec) {
    const seq = ++this.loadSeq;
    const now = Date.now();
    const day = spec.date || manilaNow(now).date;
    this.spec = spec;
    this.date = day;
    this.windowStart = 0;
    this.mallHeights = [];
    this.blocks = [];
    this.itemStart = 0;
    this.update({ state: 'loading', header: dateHeader(day, now), rows: [], visible: [], above: 0, below: 0, position: '', message: '', lines: [], note: '', selectedMall: 0, items: [], itemsVisible: [], itemSel: 0, itemsAbove: 0, itemsBelow: 0 });

    // Nothing to go on: no cinema named.
    if (!spec.theater && !spec.slug && !spec.spokenTheater) {
      if (spec.movieId || spec.spokenMovie) {
        // A movie without a cinema is a plain movie search.
        this.go(spec.movieId ? resultsUrl(spec.movieId, day) : resultsByNameUrl(spec.spokenMovie, day));
        this.message('Which theater?', ["Say a cinema name, e.g. 'at Megamall'"], '');
      } else {
        this.message('Say a theater name', ["for example 'what's showing at Megamall'"], '');
      }
      return;
    }

    try {
      const [directory, loc] = await Promise.all([getDirectory(wx), getLocation()]);
      if (seq !== this.loadSeq) return;
      const where = locationLabel(loc);

      // The movie, if one was asked about.
      let movie = spec.movie || null;
      if (!movie && (spec.movieId || spec.spokenMovie)) {
        const catalog = await getCatalog();
        if (seq !== this.loadSeq) return;
        if (spec.movieId) {
          movie = catalog.find((m) => m.id === spec.movieId) || null;
        } else {
          const r = resolveMovie([spec.spokenMovie], catalog);
          if (r.status === 'match') {
            movie = r.movie;
          } else if (r.status === 'none') {
            this.message("No movie matching '" + truncate(spec.spokenMovie, 24) + "'", ['Try the full title'], where);
            return;
          } else {
            // Ask which movie; the cinema (if it is already clear) comes along.
            const movies = r.status === 'confirm' ? [r.movie] : r.candidates.map((c) => c.movie);
            let carry = spec.theater || (spec.slug ? directory.find((t) => t.slug === spec.slug) : null);
            if (!carry && spec.spokenTheater) {
              const named = resolveTheater([spec.spokenTheater], directory, { origin: loc });
              if (named.status === 'match') carry = named.theater;
            }
            this.go(chooseMoviesUrl(r.status === 'confirm' ? 'confirm' : 'pick', day, movies, carry ? carry.slug : ''));
            return;
          }
        }
        if (!movie) {
          this.message('Movie not found', ['It may no longer be showing'], where);
          return;
        }
      }

      // The cinema.
      let theater = spec.theater || (spec.slug ? directory.find((t) => t.slug === spec.slug) : null) || null;
      if (!theater && spec.spokenTheater) {
        const r = resolveTheater([spec.spokenTheater], directory, { origin: loc });
        if (r.status === 'match') {
          theater = r.theater;
        } else if (r.status === 'none') {
          this.message("No theater matching '" + truncate(spec.spokenTheater, 22) + "'", ["Say 'nearest theaters'"], where);
          return;
        } else {
          const list = r.status === 'confirm' ? [r.theater] : r.candidates.map((c) => c.theater);
          this.go(chooseTheatersUrl(r.status === 'confirm' ? 'confirm' : 'pick', day, list, movie ? movie.id : 0));
          return;
        }
      }
      if (!theater) {
        this.message('Theater not found', ["Say 'nearest theaters'"], where);
        return;
      }
      this.theater = theater;
      this.movie = movie;
      const distance = formatKm(haversineKm(loc, theater));
      const deps = { get: getApi().get, now: Date.now };

      if (!movie) {
        this.update({ title: truncate(theater.name, 26), meta: distance });
        const res = await loadTheaterDay(deps, { theater: theater, date: day });
        if (seq !== this.loadSeq) return;
        if (res.status !== 'ok') {
          const msg = theaterDayMessage(res, Date.now());
          this.message(msg.headline, msg.lines, where);
          return;
        }
        this.showList(theaterMovieRows(res.movies), { location: where, header: dateHeader(day, Date.now()) });
        return;
      }

      this.update({ title: truncate(movie.title, 26), meta: ratingRuntime(movie.rating, movie.runtime) });
      const res = await findMovieAtTheater(deps, { theater: theater, movie: movie, date: day, origin: loc });
      if (seq !== this.loadSeq) return;
      if (res.status === 'ok') {
        this.showBlocks(
          [{ name: theater.name, distanceLabel: distance, groups: res.groups }],
          [{ movieId: movie.id, slug: '' }],
          { location: where, header: dateHeader(day, Date.now()) }
        );
        return;
      }
      if (res.alternatives.length) {
        this.showBlocks(
          res.alternatives,
          res.alternatives.map((m) => ({ movieId: movie.id, slug: m.slug })),
          { location: where, header: notHereHeader(theater.name, day, Date.now()), note: 'Nearest showing · Tap open' }
        );
        return;
      }
      const msg = notHereMessage(res, Date.now());
      this.message(msg.headline, msg.lines, where);
    } catch (err) {
      if (seq !== this.loadSeq) return;
      console.error('load failed:', err && err.message ? err.message : err);
      if (err && err.status === 404) {
        // The cinema is gone, or our list of cinemas is out of date.
        invalidateDirectory();
        this.message('This theater is no longer listed', ["Say 'nearest theaters'"], '');
        return;
      }
      this.update({ state: 'error', message: describeError(err), lines: [] });
    }
  },

  message(headline, lines, where) {
    this.update({ state: 'message', message: headline, lines: lines.map((t, i) => ({ id: 'l' + i, text: t })), location: where });
  },

  // The movies at the cinema, as a list like the other screens: swipe to move the
  // highlight, tap to see that movie's showtimes here.
  showList(items, extra) {
    this.items = items;
    this.itemStart = 0;
    this.update(Object.assign({ state: 'list', items: items, itemSel: 0, note: '' }, extra, this.itemWindow(items, 0)));
  },

  itemWindow(items, selected) {
    const w = visibleWindow(uniformHeights(items.length, 1), this.itemStart, selected, VISIBLE_ROWS);
    this.itemStart = w.start;
    return {
      itemsVisible: items.slice(w.start, w.end).map((r, k) => Object.assign({}, r, { i: w.start + k })),
      itemsAbove: w.start,
      itemsBelow: items.length - w.end,
      position: items.length ? (selected + 1) + '/' + items.length : '',
    };
  },

  selectItem(idx) {
    this.update(Object.assign({ itemSel: idx }, this.itemWindow(this.data.items, idx)));
  },

  openItem() {
    const row = this.data.items[this.data.itemSel];
    // A new screen on top, so going back returns to this list.
    if (row && this.theater) this.go(theaterUrl(this.theater.slug, this.date, row.movieId));
  },

  // Show blocks (a movie or a cinema, each with its showtimes) from the top.
  showBlocks(malls, blocks, extra) {
    const built = resultRows(malls);
    this.blocks = blocks;
    this.mallHeights = mallHeights(built.rows);
    this.update(Object.assign({
      state: 'ready',
      rows: built.rows,
      selectedMall: 0,
      note: '',
    }, extra, this.windowFor(built.rows, 0)));
  },

  // ── navigation ───────────────────────────────────────────

  go(url) {
    if (this._navTimer) clearTimeout(this._navTimer);
    this._navTimer = setTimeout(() => {
      this._navTimer = null;
      if (!this.unloaded) wx.navigateTo({ url: url });
    }, NAV_DELAY_MS);
  },

  // The blocks to show with `selected` highlighted. The highlight moves through
  // the visible blocks; the window slides only when it reaches an edge.
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

  selectBlock(idx) {
    this.update(Object.assign({ selectedMall: idx }, this.windowFor(this.data.rows, idx)));
  },

  // A movie opens where it is showing near you; a nearby cinema opens its own
  // screen for the same movie.
  openSelected() {
    const b = this.blocks[this.data.selectedMall];
    if (!b) return;
    this.go(b.slug ? theaterUrl(b.slug, this.date, b.movieId) : resultsUrl(b.movieId, this.date));
  },

  // ── keys and touch ───────────────────────────────────────

  onKeyUp(event) {
    const k = this.keys.classify(event);
    if (!k) return;
    if (this.data.state === 'error') {
      if (k === 'enter') this.open(this.spec);
      return;
    }
    if (this.data.state === 'list') {
      if (k === 'enter') {
        this.openItem();
        return;
      }
      const nextItem = this.data.itemSel + (k === 'next' ? 1 : -1);
      if (nextItem >= 0 && nextItem < this.data.items.length) this.selectItem(nextItem);
      return;
    }
    if (this.data.state !== 'ready') return;
    if (k === 'enter') {
      this.openSelected();
      return;
    }
    const next = this.data.selectedMall + (k === 'next' ? 1 : -1);
    if (next >= 0 && next < this.mallHeights.length) this.selectBlock(next);
  },

  onTapItem(event) {
    const idx = event && event.currentTarget && event.currentTarget.dataset ? event.currentTarget.dataset.index : -1;
    if (idx < 0 || idx >= this.data.items.length) return;
    this.selectItem(idx);
    this.openItem();
  },

  onTapBlock(event) {
    const idx = event && event.currentTarget && event.currentTarget.dataset ? event.currentTarget.dataset.index : -1;
    if (idx < 0 || idx >= this.blocks.length) return;
    this.selectBlock(idx);
    this.openSelected();
  },

  onTapRetry() {
    if (this.data.state === 'error') this.open(this.spec);
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
    const action = planAction(cmd, { movie: this.movie, theater: this.theater, date: this.date }, now);
    // A request the app could not act on is remembered (on this device only) so it can be improved.
    if (action.type === 'toast') recordUnclear(wx, transcripts[0], now);
    this.runAction(action);
  },

  runAction(action) {
    switch (action.type) {
      case 'toast':
        this.showToast(action.text);
        break;
      case 'theater':
        // Re-use this screen rather than stacking another on top.
        this.open({ theater: action.theater, date: action.date });
        break;
      case 'theater-movie':
        this.open({ theater: action.theater, movie: action.movie, date: action.date });
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

    <view class="list-body" ink:if="{{state === 'list'}}">
      <view ink:for="{{itemsVisible}}" ink:key="id" class="row" data-index="{{item.i}}" bindtap="onTapItem">
        <view class="row-marker">
          <view class="marker-dot" ink:if="{{itemSel === item.i}}"></view>
        </view>
        <view class="row-bar" ink:if="{{itemSel === item.i}}"></view>
        <view class="row-main">
          <text class="row-name row-name-selected" ink:if="{{itemSel === item.i}}">{{item.title}}</text>
          <text class="row-name" ink:if="{{itemSel !== item.i}}">{{item.title}}</text>
          <text class="row-city">{{item.times}}</text>
        </view>
        <text class="row-meta">{{item.meta}}</text>
      </view>
      <text class="more more-up" ink:if="{{itemsAbove > 0}}">▲</text>
      <text class="more more-down" ink:if="{{itemsBelow > 0}}">▼</text>
    </view>

    <view class="list-body" ink:if="{{state === 'ready'}}">
      <view ink:for="{{visible}}" ink:key="id" class="r">
        <view class="r-mall" ink:if="{{item.kind === 'mall'}}" data-index="{{item.mallIdx}}" bindtap="onTapBlock">
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
      <text class="hint-text" ink:if="{{!note}}">Swipe select · Tap open · Say a movie or day</text>
      <text class="hint-pos" ink:if="{{position}}">{{position}}</text>
      <text class="hint-right">{{location}}</text>
    </view>

    <view class="hintbar" ink:if="{{voiceListening}}">
      <text class="voice-banner-text">Listening… say a movie, a cinema, or 'tomorrow'</text>
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

  .row-name-selected {
    color: #40ff5e;
  }

  .row-city {
    font-size: 11px;
    line-height: 15px;
    color: rgba(64, 255, 94, 0.48);
    font-family: monospace;
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
