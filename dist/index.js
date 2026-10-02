// src/index.ts
import { defineExtension, h as h2 } from "@muclient/sdk";

// src/copy.ts
var C = {
  title: "Activity",
  region: "Staff Activity",
  openCommand: "Activity: open the panel",
  categoryGroup: "Activity category",
  scopeGroup: "Activity scope",
  categories: [
    { id: "all", label: "All" },
    { id: "text", label: "Text" },
    { id: "looc", label: "LOOC" },
    { id: "npc", label: "NPC" }
  ],
  global: "Global",
  watched: "Watched",
  filter: "Filter activity",
  filterPlaceholder: "Filter activity\u2026",
  watchToggle: (n) => `Watch (${n})`,
  watchFind: "Find a character, NPC or location to watch",
  watchFindPlaceholder: "Name or #id to watch\u2026",
  searching: "Searching\u2026",
  noMatch: "No matching character, NPC or location.",
  watchHint: "Watch any character, NPC or location by name or #id.",
  resultMeta: (id, kind) => `#${id.replace(/^#/, "")} \xB7 ${kind}`,
  watch: "Watch",
  unwatch: "Unwatch",
  unwatchLabel: (label) => `Unwatch ${label}`,
  watchName: (on, name) => `${on ? "Unwatch" : "Watch"} ${name}`,
  watchLocation: (on) => `${on ? "Unwatch" : "Watch"} location`,
  addPuppet: "Add puppet",
  inPuppets: "In puppets",
  puppetFor: (label, name, many) => many ? `${label}: ${name}` : label,
  retry: "Retry",
  gap: "Some activity was missed.",
  dismiss: "Dismiss",
  rolledOut: "Paused activity has rolled out of the feed.",
  loading: "Loading activity\u2026",
  pausedEmpty: "Feed paused. Resume to see new activity.",
  noWatches: "Add a watch to see activity for a character or location.",
  noMatchFilters: "No activity matches these filters.",
  waiting: "New player activity will appear here.",
  unknown: "Unknown",
  kind: (k) => k.startsWith("handset.") ? "Text" : k === "looc" ? "LOOC" : "NPC",
  status: (paused, following, n) => `${paused ? "Paused" : following ? "Following" : "Reading"} \xB7 ${n} shown`,
  latest: (n) => `Latest (${n})`,
  pause: "Pause",
  resume: "Resume",
  // Errors the panel shows (the game's own error text is shown as sent).
  noAnswer: "The game did not answer.",
  noGmcp: "This connection cannot send GMCP.",
  notAllowed: "Activity is not available to this character."
};

// src/css.ts
var R = '.ext-panel[data-ext="activity"]';
var CSS = `
${R} .act { display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; background: var(--bg); color: var(--fg); font-family: var(--font-mono); font-size: .8rem; line-height: 1.35; }
${R} .act [hidden] { display: none !important; }
${R} .act button { font-family: inherit; cursor: pointer; border-radius: 0; }
${R} .act button:disabled { cursor: default; }
${R} .act :is(button, input):focus-visible { outline: 2px solid var(--accent-bright); outline-offset: -2px; }

/* Controls: two rows on the elevated bar, a bright rule below. */
${R} .controls { flex: 0 0 auto; padding: 5px 8px; background: var(--bg-elev); border-bottom: 1px solid var(--border-bright); display: flex; flex-direction: column; gap: 4px; }
${R} .crow { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; min-width: 0; }
${R} .seg { display: flex; flex-wrap: wrap; gap: 0 4px; }
${R} .seg.scope { margin-left: auto; }
${R} .filter { flex: 1; min-width: 80px; }
${R} .watch-toggle { flex: none; }

/* The watch manager: a search field, results as rows, the watch list as \xD7 commands. */
${R} .watch-manager { display: flex; flex-direction: column; gap: 4px; padding-top: 4px; border-top: 1px solid var(--border); }
${R} .watch-results, ${R} .watch-list { max-height: 140px; overflow: auto; }
${R} .watch-results .sh-row { flex-direction: row; justify-content: space-between; align-items: baseline; gap: 1ch; padding-top: 4px; padding-bottom: 4px; min-height: 24px; font-size: .78rem; }
${R} .watch-results .nm { min-width: 0; overflow-wrap: anywhere; }
${R} .watch-results .meta { display: block; color: var(--fg-dim); font-size: .66rem; letter-spacing: .04em; }
${R} .watch-results .op { flex: none; color: var(--accent-bright); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }
${R} .watch-list { display: flex; flex-wrap: wrap; gap: 2px 6px; }
${R} .watch-list .sh-cmd { max-width: 100%; overflow: hidden; text-overflow: ellipsis; color: var(--accent-bright); text-transform: none; letter-spacing: .04em; }
${R} .hint { margin: 0; color: var(--fg-faint); font-size: .66rem; letter-spacing: .14em; text-transform: uppercase; }

/* Notices: error (alert), gap, rolled out. */
${R} .notice { flex: 0 0 auto; display: flex; align-items: center; gap: 1ch; padding: 3px 8px; min-height: 24px; background: var(--bg-elev); border-bottom: 1px solid var(--border-bright); font-size: .74rem; color: var(--gold); }
${R} .notice.err { color: var(--alert); }
${R} .notice .sh-cmd { margin-left: auto; }

/* The feed. */
${R} .feed { flex: 1; min-height: 0; overflow-y: auto; overflow-anchor: none; display: flex; flex-direction: column; }
${R} .event { border-bottom: 1px solid var(--border); flex: none; }
${R} .event.selected { background: var(--bg-elev); }
${R} .event .sh-row { border-bottom: 0; padding-top: 5px; padding-bottom: 5px; min-height: 24px; }
${R} .event .sh-row::before { top: 5px; }
${R} .event.selected .sh-row::before { color: var(--accent-bright); }
${R} .etop { display: flex; gap: 1ch; align-items: baseline; min-width: 0; }
${R} .etop time { flex: none; color: var(--fg-dim); font-size: .68rem; font-variant-numeric: tabular-nums; }
${R} .etop .kind { flex: none; min-width: 4ch; color: var(--accent-bright); font-size: .64rem; letter-spacing: .12em; text-transform: uppercase; }
${R} .event[data-kind="looc"] .kind { color: var(--gold); }
${R} .etop .summary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg-dim); }
${R} .etop .who { color: var(--fg); font-weight: 500; }
${R} .body { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; color: var(--fg); }
${R} .body.expanded { display: block; white-space: pre-wrap; }
${R} .location { display: block; color: var(--gold); font-size: .7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${R} .actions { display: flex; flex-wrap: wrap; gap: 2px 6px; padding: 0 8px 6px 2.4ch; }
${R} .actions .sh-cmd { max-width: 100%; white-space: normal; overflow-wrap: anywhere; text-align: left; }

/* Empty states: uppercase faint labels. */
${R} .empty { margin: 0; padding: 12px 10px; color: var(--fg-faint); font-size: .68rem; letter-spacing: .14em; text-transform: uppercase; line-height: 1.5; }

/* Footer: status, Latest (N), Pause. */
${R} .footer { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; padding: 2px 8px; min-height: 28px; background: var(--bg-elev); border-top: 1px solid var(--border-bright); color: var(--fg-dim); font-size: .68rem; letter-spacing: .08em; }
${R} .footer .st { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
${R} .footer .st.paused { color: var(--gold); }

${R} .act ::selection { background: var(--accent-bright); color: var(--bg); }

@media (max-width: 420px) {
  ${R} .act :is(.sh-cmd, .sh-toggle, .sh-row, .sh-field) { min-height: 32px; }
}
`;

// src/panel.ts
import { h } from "@muclient/sdk";

// src/store.ts
var CAP = 1e3;
var QUEUE = 64;
var noWatches = () => ({ characters: [], locations: [] });
var sid = (v) => v === void 0 || v === null ? "" : String(v);
var msg = (e) => String(e?.message ?? e);
function cleanEvent(e) {
  return { ...e, id: sid(e.id), targets: Array.isArray(e.targets) ? e.targets : [], npc_targets: Array.isArray(e.npc_targets) ? e.npc_targets : [], meta: e.meta && typeof e.meta === "object" ? e.meta : {} };
}
function cleanWatches(w) {
  const list = (x) => Array.isArray(x) ? x.filter((i) => i && i.id !== void 0).map((i) => ({ id: sid(i.id), label: String(i.label ?? i.id) })) : [];
  return { characters: list(w?.characters), locations: list(w?.locations) };
}
var refKind = (r, npc = false) => r?.kind ?? (npc ? "npc" : void 0);
var ActivityStore = class {
  constructor(io) {
    this.io = io;
  }
  io;
  allowed = false;
  known = false;
  canPuppet = false;
  events = [];
  watches = noWatches();
  results = [];
  query = "";
  loading = false;
  searching = false;
  busy = false;
  error = "";
  gap = false;
  paused = false;
  pauseCutoff = 0;
  /** Bumped whenever the feed starts over (clear, a new stream): panels reset their view state. */
  epoch = 0;
  lastSeq = 0;
  streamId = "";
  mounted = 0;
  generation = 0;
  searchGeneration = 0;
  subscribing = null;
  queued = [];
  get subscribed() {
    return !!this.streamId;
  }
  setRole(r) {
    this.known = true;
    this.allowed = !!r.allowed;
    this.canPuppet = this.allowed && !!r.can_puppet;
    if (this.allowed) void this.ensureSubscribed();
    else this.clear();
    this.io.changed();
  }
  /** A panel for this session mounted. */
  open() {
    this.mounted++;
    void this.ensureSubscribed();
    this.io.changed();
  }
  /**
   * A panel unmounted. The last one unsubscribes (unless `othersWatching`: another of the player's clients still
   * shows the feed on the same game connection) and drops the feed.
   */
  close(othersWatching = false) {
    this.mounted = Math.max(0, this.mounted - 1);
    if (this.mounted) return;
    const g = this.generation;
    if (this.allowed && this.subscribed && !othersWatching) {
      this.io.send("Unsubscribe", {}).then((ok) => {
        if (!ok && g === this.generation && this.allowed) this.error = "unsubscribe";
      }, (e) => {
        if (g === this.generation && this.allowed) this.error = msg(e);
      });
    }
    this.clear();
    this.io.changed();
  }
  /** The link went down, or the character logged out. */
  logout() {
    this.allowed = false;
    this.canPuppet = false;
    this.known = true;
    this.clear();
    this.io.changed();
  }
  clear() {
    this.generation++;
    this.searchGeneration++;
    this.epoch++;
    this.events = [];
    this.watches = noWatches();
    this.results = [];
    this.query = "";
    this.streamId = "";
    this.lastSeq = 0;
    this.gap = false;
    this.paused = false;
    this.pauseCutoff = 0;
    this.loading = this.searching = this.busy = false;
    this.error = "";
    this.queued = [];
    this.subscribing = null;
  }
  ensureSubscribed() {
    if (!this.allowed || !this.mounted) return Promise.resolve();
    if (this.subscribing) return this.subscribing;
    const g = this.generation;
    this.loading = true;
    this.error = "";
    const p = this.io.request("Subscribe", {}).then((s) => {
      if (g === this.generation && this.allowed && this.mounted) this.snapshot(s, true);
    }).catch((e) => {
      if (g === this.generation) this.error = msg(e);
    }).finally(() => {
      if (this.subscribing === p) {
        this.subscribing = null;
        this.loading = false;
        this.io.changed();
      }
    });
    this.subscribing = p;
    this.io.changed();
    return p;
  }
  /**
   * A Snapshot: the answer to our Subscribe (`ours`), or one another client of the player asked for, which is
   * applied the same way while a panel is open.
   */
  snapshot(s, ours = false) {
    if (!this.allowed || !this.mounted) return;
    if (!ours && this.subscribing) return;
    if (s.role && !s.role.allowed) {
      this.setRole(s.role);
      return;
    }
    const queued = this.queued;
    this.queued = [];
    const events = (s.events ?? []).map(cleanEvent);
    if (s.stream_id !== this.streamId) {
      this.events = [];
      this.lastSeq = 0;
      this.gap = false;
      this.results = [];
      this.query = "";
      this.searchGeneration++;
      this.generation++;
      this.epoch++;
      this.busy = this.searching = false;
      this.paused = false;
      this.streamId = s.stream_id;
    } else if (this.lastSeq && s.last_seq > this.lastSeq) {
      const next = [...events].sort((a, b) => a.seq - b.seq).find((e) => e.seq > this.lastSeq);
      if (!next || next.seq > this.lastSeq + 1) this.gap = true;
    }
    if (s.role) this.canPuppet = !!s.role.can_puppet;
    if (s.watches) this.watches = cleanWatches(s.watches);
    const before = this.lastSeq;
    this.merge(events);
    this.lastSeq = Math.max(this.lastSeq, Number(s.last_seq) || 0);
    this.io.applied?.(events.filter((e) => e.seq > before));
    for (const b of queued) if (b.stream_id === this.streamId) this.applyBatch(b);
    this.io.changed();
  }
  batch(b) {
    if (!this.allowed || !this.mounted) return;
    if (this.subscribing) {
      this.queued = [...this.queued, b].slice(-QUEUE);
      return;
    }
    if (b.stream_id !== this.streamId) {
      void this.ensureSubscribed();
      return;
    }
    this.applyBatch(b);
    this.io.changed();
  }
  applyBatch(b) {
    const fresh = (b.events ?? []).map(cleanEvent).filter((e) => e.seq > this.lastSeq).sort((x, y) => x.seq - y.seq);
    if (!fresh.length) return;
    if (fresh[0].seq > this.lastSeq + 1) this.gap = true;
    this.merge(fresh);
    this.lastSeq = Math.max(this.lastSeq, Number(b.last_seq) || 0, fresh[fresh.length - 1].seq);
    this.io.applied?.(fresh);
  }
  merge(list) {
    const m = new Map(this.events.map((e) => [sid(e.id), e]));
    for (const e of list) m.set(sid(e.id), e);
    this.events = [...m.values()].sort((a, b) => a.seq - b.seq).slice(-CAP);
  }
  togglePause() {
    this.paused = !this.paused;
    this.pauseCutoff = this.lastSeq;
    this.io.changed();
  }
  dismissGap() {
    this.gap = false;
    this.io.changed();
  }
  /** Paused, and events from before the pause have rolled out of the 1000 kept. */
  get rolledOut() {
    return this.paused && (this.events[0]?.seq ?? 0) > this.pauseCutoff;
  }
  get watchCount() {
    return this.watches.characters.length + this.watches.locations.length;
  }
  isWatched(r) {
    const list = r.kind === "location" ? this.watches.locations : this.watches.characters;
    return list.some((w) => sid(w.id) === sid(r.id));
  }
  /** The event names a watched character or NPC, or happened in a watched location. */
  watched(e) {
    const ids = [e.actor ? [e.actor, refKind(e.actor)] : null, ...(e.targets ?? []).map((t) => [t, refKind(t)]), ...(e.npc_targets ?? []).map((t) => [t, refKind(t, true)])].filter((x) => !!x && (x[1] === "character" || x[1] === "npc")).map(([r]) => sid(r.id));
    return this.watches.characters.some((w) => ids.includes(sid(w.id))) || this.watches.locations.some((w) => !!e.location && sid(w.id) === sid(e.location.id));
  }
  matches(e, cat, watchedOnly, text) {
    if (cat === "text" && !e.kind.startsWith("handset.")) return false;
    if (cat === "looc" && e.kind !== "looc") return false;
    if (cat === "npc" && e.kind !== "npc.action") return false;
    if (watchedOnly && !this.watched(e)) return false;
    if (!text) return true;
    return [e.body, e.actor?.name, e.location?.name, ...(e.targets ?? []).map((t) => t.name), ...(e.npc_targets ?? []).map((t) => t.name), e.meta?.group_name].some((v) => String(v ?? "").toLocaleLowerCase().includes(text));
  }
  filtered(cat, watchedOnly, text) {
    const t = text.trim().toLocaleLowerCase();
    return this.events.filter((e) => !(this.paused && e.seq > this.pauseCutoff) && this.matches(e, cat, watchedOnly, t));
  }
  countAfter(seq, cat, watchedOnly, text) {
    const t = text.trim().toLocaleLowerCase();
    return this.events.filter((e) => e.seq > seq && this.matches(e, cat, watchedOnly, t)).length;
  }
  /** Ask the game for characters, NPCs and locations matching `q` (2 characters at least). */
  async search(q) {
    this.query = q;
    const sg = ++this.searchGeneration, g = this.generation;
    this.results = [];
    if (q.trim().length < 2 || !this.allowed) {
      this.searching = false;
      this.io.changed();
      return;
    }
    this.searching = true;
    this.io.changed();
    try {
      const r = await this.io.request("Search", { query: q.trim() });
      if (sg !== this.searchGeneration || g !== this.generation) return;
      this.results = (Array.isArray(r?.results) ? r.results : []).map((x) => ({ ...x, id: sid(x.id) }));
    } catch (e) {
      if (sg === this.searchGeneration && g === this.generation) this.error = msg(e);
    } finally {
      if (sg === this.searchGeneration && g === this.generation) {
        this.searching = false;
        this.io.changed();
      }
    }
  }
  /** Watch or unwatch a character, NPC or location (`r.kind === 'location'` picks the list). */
  toggleWatch(r) {
    return this.mutate(this.isWatched(r) ? "Unwatch" : "Watch", { id: r.id, kind: r.kind === "location" ? "locations" : "characters" });
  }
  async mutate(op, data) {
    if (!this.allowed || this.busy) return;
    const g = this.generation;
    this.busy = true;
    this.error = "";
    this.io.changed();
    try {
      const r = await this.io.request(op, data);
      if (g === this.generation) this.watches = cleanWatches(r?.watches);
    } catch (e) {
      if (g === this.generation) this.error = msg(e);
    } finally {
      if (g === this.generation) {
        this.busy = false;
        this.io.changed();
      }
    }
  }
  /** Run `fn` (an Add puppet) with the busy flag, as Underspire's mutate does. */
  async busyWhile(fn) {
    if (!this.allowed || this.busy) return;
    const g = this.generation;
    this.busy = true;
    this.error = "";
    this.io.changed();
    try {
      await fn();
    } catch (e) {
      if (g === this.generation) this.error = msg(e);
    } finally {
      if (g === this.generation) {
        this.busy = false;
        this.io.changed();
      }
    }
  }
  /** The game's answer to a watch change that another client asked for. */
  setWatches(w) {
    if (this.allowed && this.mounted) {
      this.watches = cleanWatches(w);
      this.io.changed();
    }
  }
  /** A `Client.Activity.Error` that is not tied to a request in flight. */
  fail(message) {
    this.error = message;
    this.loading = this.searching = this.busy = false;
    this.io.changed();
  }
};

// src/panel.ts
var FOLLOW_PX = 32;
var SEARCH_MS = 250;
var hhmm = (ms) => ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
var iso = (ms) => {
  try {
    return ms ? new Date(ms).toISOString() : "";
  } catch {
    return "";
  }
};
function mountPanel(mu, env, el) {
  const c = mu.ui.css;
  const st = env.store;
  let prefs = env.view.get();
  let filter = "", query = "", manager = false, selected = null;
  let following = true, readSeq = 0, epoch = st.epoch, searchTimer;
  const catBtns = C.categories.map((x) => h("button", { type: "button", class: c.toggle, "data-cat": x.id, onclick: () => {
    prefs = { ...prefs, cat: x.id };
    env.view.set(prefs);
    draw();
  } }, x.label));
  const scopeG = h("button", { type: "button", class: c.toggle, "data-testid": "activity-scope-global", onclick: () => {
    prefs = { ...prefs, watched: false };
    env.view.set(prefs);
    draw();
  } }, C.global);
  const scopeW = h("button", { type: "button", class: c.toggle, "data-testid": "activity-scope-watched", onclick: () => {
    prefs = { ...prefs, watched: true };
    env.view.set(prefs);
    draw();
  } }, C.watched);
  const filterIn = h("input", { class: `${c.field} filter`, "aria-label": C.filter, placeholder: C.filterPlaceholder, "data-testid": "activity-filter", autocomplete: "off", spellcheck: "false" });
  const queryIn = h("input", { class: c.field, "aria-label": C.watchFind, placeholder: C.watchFindPlaceholder, "data-testid": "activity-watch-search", autocomplete: "off", spellcheck: "false" });
  const watchToggle = h("button", { type: "button", class: `${c.cmd} watch-toggle`, "data-testid": "activity-watch-toggle", onclick: () => {
    manager = !manager;
    if (!manager) {
      query = "";
      queryIn.value = "";
    }
    draw();
    if (manager) queryIn.focus();
  } });
  const searchHint = h("p", { class: "hint", "data-testid": "activity-search-hint" });
  const results = h("div", { class: "watch-results", "data-testid": "activity-results" });
  const watchList = h("div", { class: "watch-list", "data-testid": "activity-watches" });
  const watchHint = h("p", { class: "hint", "data-testid": "activity-watch-hint" }, C.watchHint);
  const mgr = h("div", { class: "watch-manager", "data-testid": "activity-watch-manager" }, queryIn, searchHint, results, watchList, watchHint);
  const controls = h(
    "div",
    { class: "controls" },
    h(
      "div",
      { class: "crow" },
      h("div", { class: "seg", role: "group", "aria-label": C.categoryGroup, "data-testid": "activity-category" }, catBtns),
      h("div", { class: "seg scope", role: "group", "aria-label": C.scopeGroup, "data-testid": "activity-scope" }, scopeG, scopeW)
    ),
    h("div", { class: "crow" }, filterIn, watchToggle),
    mgr
  );
  const errText = h("span", {});
  const errNote = h("div", { class: "notice err", role: "alert", "data-testid": "activity-error" }, errText, h("button", { type: "button", class: c.cmd, "data-testid": "activity-retry", onclick: () => {
    st.error = "";
    void st.ensureSubscribed();
    draw();
  } }, C.retry));
  const gapNote = h("div", { class: "notice", role: "status", "data-testid": "activity-gap" }, h("span", {}, C.gap), h("button", { type: "button", class: c.cmd, "data-testid": "activity-gap-dismiss", onclick: () => st.dismissGap() }, C.dismiss));
  const rolledNote = h("div", { class: "notice", "data-testid": "activity-rolled-out" }, h("span", {}, C.rolledOut));
  const empty = h("p", { class: "empty", "data-testid": "activity-empty" });
  const feed = h("div", { class: "feed", "data-testid": "activity-feed" });
  const status = h("span", { class: "st", "data-testid": "activity-status" });
  const latest = h("button", { type: "button", class: `${c.cmd} primary`, "data-testid": "activity-latest", onclick: () => jumpLatest() });
  const pause = h("button", { type: "button", class: c.cmd, "data-testid": "activity-pause", onclick: () => {
    st.togglePause();
    if (!st.paused) jumpLatest();
  } });
  const footer = h("div", { class: "footer" }, status, latest, pause);
  const root = h("div", { class: "act", role: "region", "aria-label": C.region, "data-testid": "activity" }, controls, errNote, gapNote, rolledNote, feed, footer);
  el.replaceChildren(root);
  filterIn.addEventListener("input", () => {
    filter = filterIn.value;
    draw();
  });
  queryIn.addEventListener("input", () => {
    query = queryIn.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void st.search(query), SEARCH_MS);
    draw();
  });
  feed.addEventListener("scroll", () => {
    if (feed.scrollHeight - feed.scrollTop - feed.clientHeight <= FOLLOW_PX) {
      following = true;
      if (!st.paused) readSeq = st.lastSeq;
    } else following = false;
    drawFooter();
  });
  feed.addEventListener("wheel", (e) => {
    if (e.deltaY < 0) {
      following = false;
      drawFooter();
    }
  }, { passive: true });
  function jumpLatest() {
    if (st.paused) st.togglePause();
    following = true;
    draw();
  }
  const watchBtn = (r, label) => h("button", { type: "button", class: c.cmd, disabled: st.busy, "data-testid": "activity-watch", onclick: () => void st.toggleWatch(r) }, label);
  function actions(e) {
    const out = [];
    if (e.actor) out.push(watchBtn(e.actor, C.watchName(st.isWatched(e.actor), e.actor.name ?? C.unknown)));
    const npcs = e.npc_targets ?? [];
    const pup = st.canPuppet ? env.puppets() : null;
    for (const n of npcs) {
      const ref = { ...n, kind: n.kind ?? "npc" };
      if (pup) {
        const inP = pup.has(sid(n.id));
        out.push(h(
          "button",
          { type: "button", class: `${c.cmd} add-puppet`, "data-testid": "activity-add-puppet", disabled: st.busy || inP, onclick: () => void st.busyWhile(() => pup.add(ref)) },
          C.puppetFor(inP ? C.inPuppets : C.addPuppet, n.name ?? sid(n.id), npcs.length > 1)
        ));
      }
      out.push(watchBtn(ref, C.watchName(st.isWatched(ref), n.name ?? sid(n.id))));
    }
    if (e.location) {
      const loc = { ...e.location, kind: "location" };
      out.push(watchBtn(loc, C.watchLocation(st.isWatched(loc))));
    }
    return h("div", { class: "actions", "data-testid": "activity-actions" }, out);
  }
  function row(e) {
    const id = sid(e.id), open = selected === id;
    const to = e.kind === "handset.group" ? e.meta?.group_name ? ` \u2192 ${e.meta.group_name}` : "" : e.targets?.length ? ` \u2192 ${e.targets.map((t) => t.name ?? sid(t.id)).join(", ")}` : "";
    const trigger = h(
      "button",
      { type: "button", class: `${c.row} event-trigger`, "aria-expanded": open ? "true" : "false", onclick: () => {
        selected = selected === id ? null : id;
        draw();
      } },
      h(
        "span",
        { class: "etop" },
        h("time", { datetime: iso(e.ts_ms) }, hhmm(e.ts_ms)),
        h("span", { class: "kind" }, C.kind(e.kind)),
        h("span", { class: "summary" }, h("span", { class: "who" }, e.actor?.name ?? C.unknown), to)
      ),
      h("span", { class: open ? "body expanded" : "body" }, e.body ?? ""),
      e.location ? h("span", { class: "location" }, e.location.name ?? sid(e.location.id)) : null
    );
    return h("div", { class: open ? "event selected" : "event", "data-testid": "activity-event", "data-id": id, "data-seq": String(e.seq), "data-kind": e.kind }, trigger, open ? actions(e) : null);
  }
  const rows = /* @__PURE__ */ new Map();
  const sigOf = (e) => `${e.seq}\0${e.kind}\0${e.body ?? ""}\0${e.actor?.name ?? ""}\0${e.location?.name ?? ""}\0${e.ts_ms ?? ""}`;
  function drawFooter() {
    const shown = st.filtered(prefs.cat, prefs.watched, filter);
    status.textContent = C.status(st.paused, following, shown.length);
    status.classList.toggle("paused", st.paused);
    const n = st.countAfter(readSeq, prefs.cat, prefs.watched, filter);
    latest.hidden = !(n && (!following || st.paused));
    latest.textContent = C.latest(n);
    pause.textContent = st.paused ? C.resume : C.pause;
    pause.setAttribute("aria-pressed", String(st.paused));
    return shown;
  }
  function draw() {
    if (st.epoch !== epoch) {
      epoch = st.epoch;
      selected = null;
      query = "";
      queryIn.value = "";
      manager = false;
      filter = "";
      filterIn.value = "";
      following = true;
      readSeq = 0;
      rows.clear();
    }
    for (const b of catBtns) b.setAttribute("aria-pressed", String(b.dataset.cat === prefs.cat));
    scopeG.setAttribute("aria-pressed", String(!prefs.watched));
    scopeW.setAttribute("aria-pressed", String(prefs.watched));
    watchToggle.textContent = C.watchToggle(st.watchCount);
    watchToggle.setAttribute("aria-expanded", String(manager));
    mgr.hidden = !manager;
    if (manager) {
      searchHint.hidden = !(st.searching || query.trim().length >= 2 && !st.results.length);
      searchHint.textContent = st.searching ? C.searching : C.noMatch;
      results.replaceChildren(...st.results.map((r) => {
        const ref = { id: r.id, kind: r.kind, name: r.name };
        return h(
          "button",
          { type: "button", class: c.row, disabled: st.busy, "data-testid": "activity-result", onclick: () => void st.toggleWatch(ref) },
          h("span", { class: "nm" }, `${r.name} `, h("small", { class: "meta" }, C.resultMeta(sid(r.id), r.kind))),
          h("span", { class: "op" }, st.isWatched(ref) ? C.unwatch : C.watch)
        );
      }));
      const chips = ["characters", "locations"].flatMap((kind) => st.watches[kind].map((w) => h(
        "button",
        { type: "button", class: c.cmd, disabled: st.busy, "aria-label": C.unwatchLabel(w.label), "data-testid": "activity-unwatch", onclick: () => void st.mutate("Unwatch", { kind, id: w.id }) },
        w.label,
        h("span", { "aria-hidden": "true" }, " \xD7")
      )));
      watchList.replaceChildren(...chips);
      watchList.hidden = !chips.length;
      watchHint.hidden = !!chips.length;
    }
    errNote.hidden = !st.error;
    errText.textContent = st.error;
    gapNote.hidden = !st.gap;
    rolledNote.hidden = !st.rolledOut;
    const shown = drawFooter();
    empty.textContent = !st.known || st.loading ? C.loading : !st.allowed ? C.notAllowed : st.paused ? C.pausedEmpty : prefs.watched && !st.watchCount ? C.noWatches : filter || prefs.watched || prefs.cat !== "all" ? C.noMatchFilters : C.waiting;
    const keep = /* @__PURE__ */ new Set();
    const els = shown.map((e) => {
      const id = sid(e.id);
      keep.add(id);
      const sig = sigOf(e) + (selected === id ? `\0open${st.busy}${st.canPuppet}` : "");
      const had = rows.get(id);
      if (had && had.sig === sig && selected !== id) return had.el;
      const r = { el: row(e), sig };
      rows.set(id, r);
      return r.el;
    });
    for (const k of [...rows.keys()]) if (!keep.has(k)) rows.delete(k);
    const kids = shown.length ? els : [empty];
    if (kids.length !== feed.children.length || kids.some((k, i) => feed.children[i] !== k)) feed.replaceChildren(...kids);
    if (following && !st.paused) {
      feed.scrollTop = feed.scrollHeight;
      readSeq = st.lastSeq;
      drawFooter();
    }
  }
  const off = env.listen(draw);
  draw();
  return {
    dispose: () => {
      off();
      clearTimeout(searchTimer);
      el.replaceChildren();
    },
    snapshot: () => ({ filter, query, manager, selected }),
    restore: (s) => {
      if (!s || typeof s !== "object") return;
      filter = String(s.filter ?? "");
      filterIn.value = filter;
      query = String(s.query ?? "");
      queryIn.value = query;
      manager = !!s.manager;
      selected = s.selected ?? null;
      draw();
    }
  };
}

// src/index.ts
var ID = "activity";
var P = "Client.Activity";
var ROLE = "activity";
var TIMEOUT_MS = 8e3;
var CATS = ["all", "text", "looc", "npc"];
var ANSWER = { Subscribe: "Snapshot", Search: "Results", Watch: "Watches", Unwatch: "Watches" };
var index_default = defineExtension({
  activate(ctx) {
    const mu = ctx.mu;
    mu.ui.style(CSS);
    const sessions = /* @__PURE__ */ new Map();
    const eventFns = /* @__PURE__ */ new Set();
    let reqSeq = Math.floor(Math.random() * 1e6) * 1e3;
    const errorWaiters = /* @__PURE__ */ new Map();
    const humanError = (e) => {
      const m = String(e?.message ?? e);
      return m === "timeout" ? C.noAnswer : m === "not sent" || m === "reserved" ? C.noGmcp : m;
    };
    function ask(sid2, op, data) {
      const req = ++reqSeq;
      const expect = `${P}.${ANSWER[op]}`;
      const answer = mu.gmcp.request(`${P}.${op}`, { ...data, req }, {
        sid: sid2,
        expect,
        timeoutMs: TIMEOUT_MS,
        key: `activity:${op}:${req}`,
        // The game echoes `req`; an answer without one (another client's, or a game that does not echo) is accepted.
        match: (d) => d?.req === void 0 || d.req === req
      });
      const failed = new Promise((_, reject) => errorWaiters.set(req, (m) => reject(new Error(m))));
      answer.catch(() => {
      });
      return Promise.race([answer, failed]).catch((e) => {
        throw new Error(humanError(e));
      }).finally(() => errorWaiters.delete(req));
    }
    const presence = /* @__PURE__ */ new Map();
    const channelOf = (sid2) => {
      if (presence.has(sid2)) return presence.get(sid2) ?? null;
      let ch = null;
      try {
        const c = mu.sync.channel("activity.open", { scope: "session", sid: sid2 });
        if (c && typeof c.publish === "function") ch = c;
      } catch {
      }
      presence.set(sid2, ch);
      return ch;
    };
    const othersOpen = (sid2) => {
      const ch = channelOf(sid2);
      try {
        return !!ch && Object.values(ch.all() ?? {}).some((v) => v?.value?.open);
      } catch {
        return false;
      }
    };
    let puppets = null;
    let puppetsAsk = null;
    const findPuppets = () => {
      if (puppets || puppetsAsk) return;
      puppetsAsk = ctx.api("puppets").then((api2) => {
        if (api2 && (typeof api2.add === "function" || typeof api2.get === "function")) {
          puppets = api2;
          for (const [sid2, s] of sessions) {
            watchPuppets(sid2, s);
            redraw(sid2);
          }
        }
      }).catch(() => {
      }).finally(() => {
        puppetsAsk = null;
      });
    };
    const watchPuppets = (sid2, s) => {
      if (!puppets?.watch || s.puppetsOff || !s.store.mounted) return;
      try {
        s.puppetsOff = puppets.watch(() => redraw(sid2), sid2);
      } catch {
        s.puppetsOff = null;
      }
    };
    const puppetsFor = (sid2) => {
      const p = puppets;
      if (!p) return null;
      try {
        if (p.canAdd && !p.canAdd(sid2)) return null;
      } catch {
        puppets = null;
        return null;
      }
      return {
        has: (id) => {
          try {
            return p.has ? p.has(id, sid2) : !!p.get?.("manifest", sid2)?.some((x) => sid(x.npc_id) === id);
          } catch {
            return false;
          }
        },
        add: async (r) => {
          const npc_id = sid(r.id);
          if (p.add) await p.add({ npc_id, ...r.name ? { name: r.name } : {} }, sid2);
          else if (await mu.gmcp.send("Client.Puppets.Add", { npc_id }, { sid: sid2, key: `activity:puppet:${npc_id}:${++reqSeq}` }) !== true) throw new Error(C.noGmcp);
          redraw(sid2);
        }
      };
    };
    const redraw = (sid2) => sessions.get(sid2)?.draws.forEach((f) => f());
    const S = (sid2) => sessions.get(sid2);
    const setIdentity = (sid2, s) => {
      const on = s.store.allowed;
      if (on && !s.identity) {
        s.identity = mu.sessions.provideIdentity(sid2, { roles: [ROLE] });
        mu.panels.touch(ID, sid2);
      } else if (!on && s.identity) {
        s.identity();
        s.identity = null;
      }
    };
    mu.sessions.each((ref) => {
      const sid2 = ref.id;
      const io = {
        request: (op, data) => ask(sid2, op, data),
        send: async (op, data) => {
          const r = await mu.gmcp.send(`${P}.${op}`, data, { sid: sid2, key: `activity:${op}:${++reqSeq}` });
          return r === true;
        },
        changed: () => {
          const s2 = sessions.get(sid2);
          if (s2) setIdentity(sid2, s2);
          redraw(sid2);
        },
        applied: (events) => {
          if (events.length) for (const f of eventFns) {
            try {
              f(events, sid2);
            } catch (e) {
              mu.log.warn("onEvents handler threw", e);
            }
          }
        }
      };
      const s = { store: new ActivityStore(io), draws: /* @__PURE__ */ new Set(), identity: null, puppetsOff: null };
      sessions.set(sid2, s);
      const role = mu.gmcp.state(`${P}.Role`, sid2);
      if (role && typeof role === "object") s.store.setRole(role);
      return () => {
        s.puppetsOff?.();
        s.identity?.();
        try {
          presence.get(sid2)?.close();
        } catch {
        }
        presence.delete(sid2);
        sessions.delete(sid2);
      };
    });
    mu.sessions.on("state", (ref) => {
      const s = S(ref.id);
      if (s && ref.state !== "connected") s.store.logout();
    });
    mu.gmcp.on(`${P}.`, (data, { sid: sid2, pkg, replay }) => {
      const s = S(sid2);
      if (!s) return;
      const d = data ?? {};
      const sub = pkg.slice(P.length + 1).toLowerCase();
      if (sub === "role") {
        s.store.setRole(d);
        return;
      }
      if (replay) return;
      if (sub === "batch") s.store.batch(d);
      else if (sub === "snapshot") s.store.snapshot(d);
      else if (sub === "watches") {
        if (d.req === void 0 || !errorWaiters.size) s.store.setWatches(d.watches);
      } else if (sub === "error") {
        const w = typeof d.req === "number" ? errorWaiters.get(d.req) : void 0;
        if (w) w(String(d.message ?? C.noAnswer));
        else if (d.req === void 0) s.store.fail(String(d.message ?? C.noAnswer));
      }
    });
    mu.gmcp.on("Client.Puppets.Manifest", (_d, { sid: sid2 }) => {
      if (puppets && !puppets.watch) redraw(sid2);
    });
    const viewOf = (sid2) => {
      const store = mu.storage.session(sid2);
      return {
        get: () => {
          const o = store.get("view", null) ?? {};
          return { cat: CATS.includes(o.cat) ? o.cat : "all", watched: !!o.watched };
        },
        set: (p) => store.set("view", p)
      };
    };
    const mounted = /* @__PURE__ */ new WeakMap();
    mu.panels.register({
      id: ID,
      title: C.title,
      defaultPosition: "right-bottom",
      show: "auto",
      role: ROLE,
      mount: (el, pc) => {
        const sid2 = pc.sid ?? mu.sessions.active()?.id ?? null;
        const s = sid2 ? S(sid2) : void 0;
        if (!sid2 || !s) {
          el.replaceChildren(h2("p", { class: "empty", "data-testid": "activity-empty" }, C.notAllowed));
          return () => el.replaceChildren();
        }
        findPuppets();
        const p = mountPanel(mu, { store: s.store, listen: (fn) => {
          s.draws.add(fn);
          return () => s.draws.delete(fn);
        }, view: viewOf(sid2), puppets: () => puppetsFor(sid2) }, el);
        mounted.set(el, p);
        s.store.open();
        watchPuppets(sid2, s);
        const ch = channelOf(sid2);
        void ch?.publish({ open: true }).catch(() => {
        });
        return () => {
          p.dispose();
          mounted.delete(el);
          s.store.close(othersOpen(sid2));
          if (!s.store.mounted) {
            s.puppetsOff?.();
            s.puppetsOff = null;
            void ch?.publish({ open: false }).catch(() => {
            });
          }
        };
      },
      // Hot reload: the filter, the watch search and the open row survive a rebuild.
      snapshot: (el) => mounted.get(el)?.snapshot(),
      restore: (el, saved) => {
        if (saved) mounted.get(el)?.restore(saved);
      }
    });
    mu.commands.register({ id: `${ID}.open`, title: C.openCommand, run: () => mu.panels.open(ID) });
    const sidOr = (sid2) => sid2 ?? mu.sessions.active()?.id ?? "";
    const api = (caller) => ({
      open: () => mu.panels.open(ID),
      allowed: (sid2) => !!S(sidOr(sid2))?.store.allowed,
      events: (sid2) => [...S(sidOr(sid2))?.store.events ?? []],
      watches: (sid2) => {
        const w = S(sidOr(sid2))?.store.watches;
        return { characters: [...w?.characters ?? []], locations: [...w?.locations ?? []] };
      },
      onEvents: (fn) => {
        eventFns.add(fn);
        return caller.track(() => {
          eventFns.delete(fn);
        });
      }
    });
    ctx.exports(api);
    return api({ id: ID, track: (d) => d });
  }
});
export {
  ROLE,
  index_default as default
};
