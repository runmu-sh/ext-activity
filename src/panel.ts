/**
 * The Activity panel in plain DOM, after Underspire's `activity` view: category and scope segments, the filter,
 * the watch manager, the notices, the feed (newest at the bottom, following while scrolled to the end), and the
 * footer with the status, Latest (N) and Pause. Built with `mu.ui.h` and the `mu.ui.css` primitives.
 */
import { h, type Dispose, type Mu } from '@muclient/sdk';
import { C } from './copy';
import type { ActivityStore, Category } from './store';
import { sid as idOf } from './store';
import type { ActivityEvent, Ref } from './types';

/** What the panel needs from the extension for one session. */
export interface PanelEnv {
  store: ActivityStore;
  /** Redraw this panel when the store changes. */
  listen(fn: () => void): Dispose;
  /** The view settings kept for the session (category and scope). */
  view: { get(): ViewPrefs; set(v: ViewPrefs): void };
  /** Add puppet: null when the button should not show (no Puppets extension, or it cannot add here). */
  puppets(): { has(id: string): boolean; add(r: Ref): Promise<unknown> } | null;
}
export interface ViewPrefs { cat: Category; watched: boolean }
/** What survives a hot reload (`snapshot`/`restore`). */
export interface PanelSnap { filter: string; query: string; manager: boolean; selected: string | null }

/** Follow while within this many px of the bottom (Underspire: 32). */
const FOLLOW_PX = 32;
const SEARCH_MS = 250;

const hhmm = (ms?: number) => (ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
const iso = (ms?: number) => { try { return ms ? new Date(ms).toISOString() : ''; } catch { return ''; } };

export function mountPanel(mu: Mu, env: PanelEnv, el: HTMLElement): { dispose: Dispose; snapshot(): PanelSnap; restore(s: PanelSnap): void } {
  const c = mu.ui.css;
  const st = env.store;
  let prefs = env.view.get();
  let filter = '', query = '', manager = false, selected: string | null = null;
  let following = true, readSeq = 0, epoch = st.epoch, searchTimer: ReturnType<typeof setTimeout> | undefined;

  // ── skeleton ──
  const catBtns = C.categories.map((x) => h('button', { type: 'button', class: c.toggle, 'data-cat': x.id, onclick: () => { prefs = { ...prefs, cat: x.id }; env.view.set(prefs); draw(); } }, x.label));
  const scopeG = h('button', { type: 'button', class: c.toggle, 'data-testid': 'activity-scope-global', onclick: () => { prefs = { ...prefs, watched: false }; env.view.set(prefs); draw(); } }, C.global);
  const scopeW = h('button', { type: 'button', class: c.toggle, 'data-testid': 'activity-scope-watched', onclick: () => { prefs = { ...prefs, watched: true }; env.view.set(prefs); draw(); } }, C.watched);
  const filterIn = h('input', { class: `${c.field} filter`, 'aria-label': C.filter, placeholder: C.filterPlaceholder, 'data-testid': 'activity-filter', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  const queryIn = h('input', { class: c.field, 'aria-label': C.watchFind, placeholder: C.watchFindPlaceholder, 'data-testid': 'activity-watch-search', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  const watchToggle = h('button', { type: 'button', class: `${c.cmd} watch-toggle`, 'data-testid': 'activity-watch-toggle', onclick: () => { manager = !manager; if (!manager) { query = ''; queryIn.value = ''; } draw(); if (manager) queryIn.focus(); } });
  const searchHint = h('p', { class: 'hint', 'data-testid': 'activity-search-hint' });
  const results = h('div', { class: 'watch-results', 'data-testid': 'activity-results' });
  const watchList = h('div', { class: 'watch-list', 'data-testid': 'activity-watches' });
  const watchHint = h('p', { class: 'hint', 'data-testid': 'activity-watch-hint' }, C.watchHint);
  const mgr = h('div', { class: 'watch-manager', 'data-testid': 'activity-watch-manager' }, queryIn, searchHint, results, watchList, watchHint);
  const controls = h('div', { class: 'controls' },
    h('div', { class: 'crow' },
      h('div', { class: 'seg', role: 'group', 'aria-label': C.categoryGroup, 'data-testid': 'activity-category' }, catBtns),
      h('div', { class: 'seg scope', role: 'group', 'aria-label': C.scopeGroup, 'data-testid': 'activity-scope' }, scopeG, scopeW)),
    h('div', { class: 'crow' }, filterIn, watchToggle),
    mgr);
  const errText = h('span', {});
  const errNote = h('div', { class: 'notice err', role: 'alert', 'data-testid': 'activity-error' }, errText, h('button', { type: 'button', class: c.cmd, 'data-testid': 'activity-retry', onclick: () => { st.error = ''; void st.ensureSubscribed(); draw(); } }, C.retry));
  const gapNote = h('div', { class: 'notice', role: 'status', 'data-testid': 'activity-gap' }, h('span', {}, C.gap), h('button', { type: 'button', class: c.cmd, 'data-testid': 'activity-gap-dismiss', onclick: () => st.dismissGap() }, C.dismiss));
  const rolledNote = h('div', { class: 'notice', 'data-testid': 'activity-rolled-out' }, h('span', {}, C.rolledOut));
  const empty = h('p', { class: 'empty', 'data-testid': 'activity-empty' });
  const feed = h('div', { class: 'feed', 'data-testid': 'activity-feed' });
  const status = h('span', { class: 'st', 'data-testid': 'activity-status' });
  const latest = h('button', { type: 'button', class: `${c.cmd} primary`, 'data-testid': 'activity-latest', onclick: () => jumpLatest() });
  const pause = h('button', { type: 'button', class: c.cmd, 'data-testid': 'activity-pause', onclick: () => { st.togglePause(); if (!st.paused) jumpLatest(); } });
  const footer = h('div', { class: 'footer' }, status, latest, pause);
  const root = h('div', { class: 'act', role: 'region', 'aria-label': C.region, 'data-testid': 'activity' }, controls, errNote, gapNote, rolledNote, feed, footer);
  el.replaceChildren(root);

  filterIn.addEventListener('input', () => { filter = filterIn.value; draw(); });
  queryIn.addEventListener('input', () => {
    query = queryIn.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void st.search(query), SEARCH_MS);
    draw();
  });
  feed.addEventListener('scroll', () => {
    if (feed.scrollHeight - feed.scrollTop - feed.clientHeight <= FOLLOW_PX) { following = true; if (!st.paused) readSeq = st.lastSeq; } else following = false;
    drawFooter();
  });
  feed.addEventListener('wheel', (e) => { if ((e as WheelEvent).deltaY < 0) { following = false; drawFooter(); } }, { passive: true });

  function jumpLatest() {
    if (st.paused) st.togglePause();
    following = true;
    draw();
  }

  // ── rows ──
  const watchBtn = (r: Ref, label: string) => h('button', { type: 'button', class: c.cmd, disabled: st.busy, 'data-testid': 'activity-watch', onclick: () => void st.toggleWatch(r) }, label);
  function actions(e: ActivityEvent) {
    const out: HTMLElement[] = [];
    if (e.actor) out.push(watchBtn(e.actor, C.watchName(st.isWatched(e.actor), e.actor.name ?? C.unknown)));
    const npcs = e.npc_targets ?? [];
    const pup = st.canPuppet ? env.puppets() : null;
    for (const n of npcs) {
      const ref: Ref = { ...n, kind: n.kind ?? 'npc' };
      if (pup) {
        const inP = pup.has(idOf(n.id));
        out.push(h('button', { type: 'button', class: `${c.cmd} add-puppet`, 'data-testid': 'activity-add-puppet', disabled: st.busy || inP, onclick: () => void st.busyWhile(() => pup.add(ref)) },
          C.puppetFor(inP ? C.inPuppets : C.addPuppet, n.name ?? idOf(n.id), npcs.length > 1)));
      }
      out.push(watchBtn(ref, C.watchName(st.isWatched(ref), n.name ?? idOf(n.id))));
    }
    if (e.location) { const loc: Ref = { ...e.location, kind: 'location' }; out.push(watchBtn(loc, C.watchLocation(st.isWatched(loc)))); }
    return h('div', { class: 'actions', 'data-testid': 'activity-actions' }, out);
  }
  function row(e: ActivityEvent) {
    const id = idOf(e.id), open = selected === id;
    const to = e.kind === 'handset.group' ? (e.meta?.group_name ? ` → ${e.meta.group_name}` : '') : (e.targets?.length ? ` → ${e.targets.map((t) => t.name ?? idOf(t.id)).join(', ')}` : '');
    const trigger = h('button', { type: 'button', class: `${c.row} event-trigger`, 'aria-expanded': open ? 'true' : 'false', onclick: () => { selected = selected === id ? null : id; draw(); } },
      h('span', { class: 'etop' },
        h('time', { datetime: iso(e.ts_ms) }, hhmm(e.ts_ms)),
        h('span', { class: 'kind' }, C.kind(e.kind)),
        h('span', { class: 'summary' }, h('span', { class: 'who' }, e.actor?.name ?? C.unknown), to)),
      h('span', { class: open ? 'body expanded' : 'body' }, e.body ?? ''),
      e.location ? h('span', { class: 'location' }, e.location.name ?? idOf(e.location.id)) : null);
    return h('div', { class: open ? 'event selected' : 'event', 'data-testid': 'activity-event', 'data-id': id, 'data-seq': String(e.seq), 'data-kind': e.kind }, trigger, open ? actions(e) : null);
  }

  // Rows are rebuilt only when what they show changes (keyed by id; the open row is always rebuilt).
  const rows = new Map<string, { el: HTMLElement; sig: string }>();
  const sigOf = (e: ActivityEvent) => `${e.seq}\u0000${e.kind}\u0000${e.body ?? ''}\u0000${e.actor?.name ?? ''}\u0000${e.location?.name ?? ''}\u0000${e.ts_ms ?? ''}`;

  function drawFooter() {
    const shown = st.filtered(prefs.cat, prefs.watched, filter);
    status.textContent = C.status(st.paused, following, shown.length);
    status.classList.toggle('paused', st.paused);
    const n = st.countAfter(readSeq, prefs.cat, prefs.watched, filter);
    latest.hidden = !(n && (!following || st.paused));
    latest.textContent = C.latest(n);
    pause.textContent = st.paused ? C.resume : C.pause;
    pause.setAttribute('aria-pressed', String(st.paused));
    return shown;
  }

  function draw() {
    if (st.epoch !== epoch) {
      // The feed started over: forget the view state, as Underspire does on a new epoch.
      epoch = st.epoch;
      selected = null; query = ''; queryIn.value = ''; manager = false; filter = ''; filterIn.value = ''; following = true; readSeq = 0;
      rows.clear();
    }
    for (const b of catBtns) b.setAttribute('aria-pressed', String(b.dataset.cat === prefs.cat));
    scopeG.setAttribute('aria-pressed', String(!prefs.watched));
    scopeW.setAttribute('aria-pressed', String(prefs.watched));
    watchToggle.textContent = C.watchToggle(st.watchCount);
    watchToggle.setAttribute('aria-expanded', String(manager));
    mgr.hidden = !manager;
    if (manager) {
      searchHint.hidden = !(st.searching || (query.trim().length >= 2 && !st.results.length));
      searchHint.textContent = st.searching ? C.searching : C.noMatch;
      results.replaceChildren(...st.results.map((r) => {
        const ref: Ref = { id: r.id, kind: r.kind, name: r.name };
        return h('button', { type: 'button', class: c.row, disabled: st.busy, 'data-testid': 'activity-result', onclick: () => void st.toggleWatch(ref) },
          h('span', { class: 'nm' }, `${r.name} `, h('small', { class: 'meta' }, C.resultMeta(idOf(r.id), r.kind))),
          h('span', { class: 'op' }, st.isWatched(ref) ? C.unwatch : C.watch));
      }));
      const chips = (['characters', 'locations'] as const).flatMap((kind) => st.watches[kind].map((w) =>
        h('button', { type: 'button', class: c.cmd, disabled: st.busy, 'aria-label': C.unwatchLabel(w.label), 'data-testid': 'activity-unwatch', onclick: () => void st.mutate('Unwatch', { kind, id: w.id }) },
          w.label, h('span', { 'aria-hidden': 'true' }, ' ×'))));
      watchList.replaceChildren(...chips);
      watchList.hidden = !chips.length;
      watchHint.hidden = !!chips.length;
    }
    errNote.hidden = !st.error;
    errText.textContent = st.error;
    gapNote.hidden = !st.gap;
    rolledNote.hidden = !st.rolledOut;

    const shown = drawFooter();
    empty.textContent = !st.known || st.loading ? C.loading : !st.allowed ? C.notAllowed : st.paused ? C.pausedEmpty : prefs.watched && !st.watchCount ? C.noWatches : filter || prefs.watched || prefs.cat !== 'all' ? C.noMatchFilters : C.waiting;
    const keep = new Set<string>();
    const els: HTMLElement[] = shown.map((e) => {
      const id = idOf(e.id);
      keep.add(id);
      const sig = sigOf(e) + (selected === id ? `\u0000open${st.busy}${st.canPuppet}` : '');
      const had = rows.get(id);
      if (had && had.sig === sig && selected !== id) return had.el;
      const r = { el: row(e), sig };
      rows.set(id, r);
      return r.el;
    });
    for (const k of [...rows.keys()]) if (!keep.has(k)) rows.delete(k);
    const kids = shown.length ? els : [empty];
    if (kids.length !== feed.children.length || kids.some((k, i) => feed.children[i] !== k)) feed.replaceChildren(...kids);
    // Follow the end while following and not paused (Underspire's auto-follow).
    if (following && !st.paused) { feed.scrollTop = feed.scrollHeight; readSeq = st.lastSeq; drawFooter(); }
  }

  const off = env.listen(draw);
  draw();
  return {
    dispose: () => { off(); clearTimeout(searchTimer); el.replaceChildren(); },
    snapshot: () => ({ filter, query, manager, selected }),
    restore: (s) => {
      if (!s || typeof s !== 'object') return;
      filter = String(s.filter ?? ''); filterIn.value = filter;
      query = String(s.query ?? ''); queryIn.value = query;
      manager = !!s.manager; selected = s.selected ?? null;
      draw();
    },
  };
}
