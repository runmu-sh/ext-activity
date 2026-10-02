/**
 * One session's Activity feed, after Underspire's activity store: the role, the subscription while a panel is
 * mounted, the stream and its sequence numbers (a missed range raises the gap notice), batches queued while a
 * subscribe is in flight, the 1000-event cap, pause with a cutoff, the category/scope/text filter, watches and the
 * server search. The game is reached through `io`, so this file has no SDK calls and is tested on its own.
 */
import type { ActivityEvent, Batch, Ref, Role, SearchResult, Snapshot, WatchKind, Watches } from './types';

export const CAP = 1000;
/** Batches kept while a subscribe is in flight (Underspire keeps the last 64). */
export const QUEUE = 64;
export type Category = 'all' | 'text' | 'looc' | 'npc';

export interface StoreIO {
  /** Ask the game and resolve with its answer: Subscribe → Snapshot, Search → Results, Watch/Unwatch → Watches. */
  request(op: 'Subscribe', data: Record<string, never>): Promise<Snapshot>;
  request(op: 'Search', data: { query: string }): Promise<{ query?: string; results: SearchResult[] }>;
  request(op: 'Watch' | 'Unwatch', data: { id: string | number; kind: WatchKind }): Promise<{ watches: Watches }>;
  /** Tell the game, without waiting (Unsubscribe). Resolves false when it could not be sent. */
  send(op: 'Unsubscribe', data: Record<string, never>): Promise<boolean>;
  /** Something the panel shows changed. */
  changed(): void;
  /** Events newly applied to the feed. */
  applied?(events: ActivityEvent[]): void;
}

const noWatches = (): Watches => ({ characters: [], locations: [] });
export const sid = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const msg = (e: unknown) => String((e as Error)?.message ?? e);

/** Normalise what the game sent: string ids, arrays present, events with a numeric seq. */
export function cleanEvent(e: ActivityEvent): ActivityEvent {
  return { ...e, id: sid(e.id), targets: Array.isArray(e.targets) ? e.targets : [], npc_targets: Array.isArray(e.npc_targets) ? e.npc_targets : [], meta: e.meta && typeof e.meta === 'object' ? e.meta : {} };
}
export function cleanWatches(w: Partial<Watches> | undefined | null): Watches {
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((i) => i && i.id !== undefined).map((i) => ({ id: sid(i.id), label: String(i.label ?? i.id) })) : []);
  return { characters: list(w?.characters), locations: list(w?.locations) };
}
/** An NPC target without a kind is an NPC. */
const refKind = (r: Ref | null | undefined, npc = false) => r?.kind ?? (npc ? 'npc' : undefined);

export class ActivityStore {
  allowed = false;
  known = false;
  canPuppet = false;
  events: ActivityEvent[] = [];
  watches: Watches = noWatches();
  results: SearchResult[] = [];
  query = '';
  loading = false;
  searching = false;
  busy = false;
  error = '';
  gap = false;
  paused = false;
  pauseCutoff = 0;
  /** Bumped whenever the feed starts over (clear, a new stream): panels reset their view state. */
  epoch = 0;
  lastSeq = 0;
  streamId = '';
  mounted = 0;
  private generation = 0;
  private searchGeneration = 0;
  private subscribing: Promise<void> | null = null;
  private queued: Batch[] = [];

  constructor(private io: StoreIO) {}

  get subscribed() { return !!this.streamId; }

  setRole(r: Role) {
    this.known = true;
    this.allowed = !!r.allowed;
    this.canPuppet = this.allowed && !!r.can_puppet;
    if (this.allowed) void this.ensureSubscribed(); else this.clear();
    this.io.changed();
  }

  /** A panel for this session mounted. */
  open() { this.mounted++; void this.ensureSubscribed(); this.io.changed(); }

  /**
   * A panel unmounted. The last one unsubscribes (unless `othersWatching`: another of the player's clients still
   * shows the feed on the same game connection) and drops the feed.
   */
  close(othersWatching = false) {
    this.mounted = Math.max(0, this.mounted - 1);
    if (this.mounted) return;
    const g = this.generation;
    if (this.allowed && this.subscribed && !othersWatching) {
      this.io.send('Unsubscribe', {}).then((ok) => { if (!ok && g === this.generation && this.allowed) this.error = 'unsubscribe'; }, (e) => { if (g === this.generation && this.allowed) this.error = msg(e); });
    }
    this.clear();
    this.io.changed();
  }

  /** The link went down, or the character logged out. */
  logout() { this.allowed = false; this.canPuppet = false; this.known = true; this.clear(); this.io.changed(); }

  clear() {
    this.generation++;
    this.searchGeneration++;
    this.epoch++;
    this.events = [];
    this.watches = noWatches();
    this.results = [];
    this.query = '';
    this.streamId = '';
    this.lastSeq = 0;
    this.gap = false;
    this.paused = false;
    this.pauseCutoff = 0;
    this.loading = this.searching = this.busy = false;
    this.error = '';
    this.queued = [];
    this.subscribing = null;
  }

  ensureSubscribed(): Promise<void> {
    if (!this.allowed || !this.mounted) return Promise.resolve();
    if (this.subscribing) return this.subscribing;
    const g = this.generation;
    this.loading = true;
    this.error = '';
    const p: Promise<void> = this.io.request('Subscribe', {})
      .then((s) => { if (g === this.generation && this.allowed && this.mounted) this.snapshot(s, true); })
      .catch((e) => { if (g === this.generation) this.error = msg(e); })
      .finally(() => { if (this.subscribing === p) { this.subscribing = null; this.loading = false; this.io.changed(); } });
    this.subscribing = p;
    this.io.changed();
    return p;
  }

  /**
   * A Snapshot: the answer to our Subscribe (`ours`), or one another client of the player asked for, which is
   * applied the same way while a panel is open.
   */
  snapshot(s: Snapshot, ours = false) {
    if (!this.allowed || !this.mounted) return;
    if (!ours && this.subscribing) return; // our own answer is on its way
    if (s.role && !s.role.allowed) { this.setRole(s.role); return; }
    const queued = this.queued;
    this.queued = [];
    const events = (s.events ?? []).map(cleanEvent);
    if (s.stream_id !== this.streamId) {
      this.events = [];
      this.lastSeq = 0;
      this.gap = false;
      this.results = [];
      this.query = '';
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

  batch(b: Batch) {
    if (!this.allowed || !this.mounted) return;
    if (this.subscribing) { this.queued = [...this.queued, b].slice(-QUEUE); return; }
    if (b.stream_id !== this.streamId) { void this.ensureSubscribed(); return; }
    this.applyBatch(b);
    this.io.changed();
  }

  private applyBatch(b: Batch) {
    const fresh = (b.events ?? []).map(cleanEvent).filter((e) => e.seq > this.lastSeq).sort((x, y) => x.seq - y.seq);
    if (!fresh.length) return;
    if (fresh[0].seq > this.lastSeq + 1) this.gap = true;
    this.merge(fresh);
    this.lastSeq = Math.max(this.lastSeq, Number(b.last_seq) || 0, fresh[fresh.length - 1].seq);
    this.io.applied?.(fresh);
  }

  private merge(list: ActivityEvent[]) {
    const m = new Map(this.events.map((e) => [sid(e.id), e]));
    for (const e of list) m.set(sid(e.id), e);
    this.events = [...m.values()].sort((a, b) => a.seq - b.seq).slice(-CAP);
  }

  togglePause() { this.paused = !this.paused; this.pauseCutoff = this.lastSeq; this.io.changed(); }
  dismissGap() { this.gap = false; this.io.changed(); }
  /** Paused, and events from before the pause have rolled out of the 1000 kept. */
  get rolledOut() { return this.paused && (this.events[0]?.seq ?? 0) > this.pauseCutoff; }
  get watchCount() { return this.watches.characters.length + this.watches.locations.length; }

  isWatched(r: Ref): boolean {
    const list = r.kind === 'location' ? this.watches.locations : this.watches.characters;
    return list.some((w) => sid(w.id) === sid(r.id));
  }

  /** The event names a watched character or NPC, or happened in a watched location. */
  watched(e: ActivityEvent): boolean {
    const ids = [e.actor ? [e.actor, refKind(e.actor)] : null, ...(e.targets ?? []).map((t) => [t, refKind(t)]), ...(e.npc_targets ?? []).map((t) => [t, refKind(t, true)])]
      .filter((x): x is [Ref, string] => !!x && (x[1] === 'character' || x[1] === 'npc'))
      .map(([r]) => sid(r.id));
    return this.watches.characters.some((w) => ids.includes(sid(w.id))) || this.watches.locations.some((w) => !!e.location && sid(w.id) === sid(e.location.id));
  }

  matches(e: ActivityEvent, cat: Category, watchedOnly: boolean, text: string): boolean {
    if (cat === 'text' && !e.kind.startsWith('handset.')) return false;
    if (cat === 'looc' && e.kind !== 'looc') return false;
    if (cat === 'npc' && e.kind !== 'npc.action') return false;
    if (watchedOnly && !this.watched(e)) return false;
    if (!text) return true;
    return [e.body, e.actor?.name, e.location?.name, ...(e.targets ?? []).map((t) => t.name), ...(e.npc_targets ?? []).map((t) => t.name), e.meta?.group_name]
      .some((v) => String(v ?? '').toLocaleLowerCase().includes(text));
  }

  filtered(cat: Category, watchedOnly: boolean, text: string): ActivityEvent[] {
    const t = text.trim().toLocaleLowerCase();
    return this.events.filter((e) => !(this.paused && e.seq > this.pauseCutoff) && this.matches(e, cat, watchedOnly, t));
  }

  countAfter(seq: number, cat: Category, watchedOnly: boolean, text: string): number {
    const t = text.trim().toLocaleLowerCase();
    return this.events.filter((e) => e.seq > seq && this.matches(e, cat, watchedOnly, t)).length;
  }

  /** Ask the game for characters, NPCs and locations matching `q` (2 characters at least). */
  async search(q: string) {
    this.query = q;
    const sg = ++this.searchGeneration, g = this.generation;
    this.results = [];
    if (q.trim().length < 2 || !this.allowed) { this.searching = false; this.io.changed(); return; }
    this.searching = true;
    this.io.changed();
    try {
      const r = await this.io.request('Search', { query: q.trim() });
      if (sg !== this.searchGeneration || g !== this.generation) return;
      this.results = (Array.isArray(r?.results) ? r.results : []).map((x) => ({ ...x, id: sid(x.id) }));
    } catch (e) {
      if (sg === this.searchGeneration && g === this.generation) this.error = msg(e);
    } finally {
      if (sg === this.searchGeneration && g === this.generation) { this.searching = false; this.io.changed(); }
    }
  }

  /** Watch or unwatch a character, NPC or location (`r.kind === 'location'` picks the list). */
  toggleWatch(r: Ref) {
    return this.mutate(this.isWatched(r) ? 'Unwatch' : 'Watch', { id: r.id, kind: r.kind === 'location' ? 'locations' : 'characters' });
  }

  async mutate(op: 'Watch' | 'Unwatch', data: { id: string | number; kind: WatchKind }) {
    if (!this.allowed || this.busy) return;
    const g = this.generation;
    this.busy = true;
    this.error = '';
    this.io.changed();
    try {
      const r = await this.io.request(op, data);
      if (g === this.generation) this.watches = cleanWatches(r?.watches);
    } catch (e) {
      if (g === this.generation) this.error = msg(e);
    } finally {
      if (g === this.generation) { this.busy = false; this.io.changed(); }
    }
  }

  /** Run `fn` (an Add puppet) with the busy flag, as Underspire's mutate does. */
  async busyWhile(fn: () => Promise<unknown>) {
    if (!this.allowed || this.busy) return;
    const g = this.generation;
    this.busy = true;
    this.error = '';
    this.io.changed();
    try { await fn(); } catch (e) { if (g === this.generation) this.error = msg(e); } finally { if (g === this.generation) { this.busy = false; this.io.changed(); } }
  }

  /** The game's answer to a watch change that another client asked for. */
  setWatches(w: Partial<Watches>) { if (this.allowed && this.mounted) { this.watches = cleanWatches(w); this.io.changed(); } }
  /** A `Client.Activity.Error` that is not tied to a request in flight. */
  fail(message: string) { this.error = message; this.loading = this.searching = this.busy = false; this.io.changed(); }
}
