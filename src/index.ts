/**
 * Activity: the staff activity feed, after Underspire's Activity view. Player texts, LOOC and NPC actions stream in
 * over GMCP `Client.Activity` while the panel is open (Subscribe on mount, Unsubscribe when the last panel of the
 * session closes), with category, scope and text filters, watches on characters, NPCs and locations, pause, the
 * gap notice, and "Add puppet" through the Puppets extension when it is enabled.
 *
 * The game says who may see it with `Client.Activity.Role`; the extension then gives the session the `activity`
 * role (`sessions.provideIdentity`), which is what the panel needs to be listed (`role: 'activity'`), and touches
 * the panel so it is added once (`show: 'auto'`). See README.md for the protocol and src/types.ts for the API.
 */
import { defineExtension, h, type CallerContext, type Dispose, type Mu, type SyncChannel } from '@muclient/sdk';
import { C } from './copy';
import { CSS } from './css';
import { mountPanel, type PanelSnap, type ViewPrefs } from './panel';
import { ActivityStore, sid as idOf, type Category, type StoreIO } from './store';
import type { ActivityApi, ActivityEvent, Batch, Ref, Role, Snapshot, Watches } from './types';

export type { ActivityApi, ActivityEvent, Batch, Ref, Role, Snapshot, Watches, WatchItem, WatchKind } from './types';

const ID = 'activity';
const P = 'Client.Activity';
/** The role the session gets while the game allows the feed (the panel's `role`). */
export const ROLE = 'activity';
const TIMEOUT_MS = 8000;
const CATS: readonly Category[] = ['all', 'text', 'looc', 'npc'];

/** The answer package each request waits for. */
const ANSWER = { Subscribe: 'Snapshot', Search: 'Results', Watch: 'Watches', Unwatch: 'Watches' } as const;
type Op = keyof typeof ANSWER;

/**
 * What we use of the Puppets extension (`ctx.api('puppets')`): 1.2+ has `add`/`has`/`canAdd`/`watch`; 1.1 has
 * `get('manifest')` only, and then Add puppet sends its default action (`Client.Puppets.Add { npc_id }`) here.
 */
interface PuppetsLike {
  add?(npc: { npc_id: string; name?: string }, sid?: string): Promise<string>;
  has?(npcId: string, sid?: string): boolean;
  canAdd?(sid?: string): boolean;
  watch?(fn: () => void, sid?: string): Dispose;
  get?(what: 'manifest', sid?: string): ReadonlyArray<{ npc_id: string | number }>;
}

export default defineExtension({
  activate(ctx) {
    const mu: Mu = ctx.mu;
    mu.ui.style(CSS);

    interface Sess { store: ActivityStore; draws: Set<() => void>; identity: Dispose | null; puppetsOff: Dispose | null }
    const sessions = new Map<string, Sess>();
    const eventFns = new Set<(events: readonly ActivityEvent[], sid: string) => void>();
    let reqSeq = Math.floor(Math.random() * 1e6) * 1000;

    // ── talking to the game ──
    const errorWaiters = new Map<number, (message: string) => void>();
    const humanError = (e: unknown) => {
      const m = String((e as Error)?.message ?? e);
      return m === 'timeout' ? C.noAnswer : m === 'not sent' || m === 'reserved' ? C.noGmcp : m;
    };
    function ask(sid: string, op: Op, data: Record<string, unknown>): Promise<any> {
      const req = ++reqSeq;
      const expect = `${P}.${ANSWER[op]}`;
      const answer = mu.gmcp.request(`${P}.${op}`, { ...data, req }, {
        sid, expect, timeoutMs: TIMEOUT_MS, key: `activity:${op}:${req}`,
        // The game echoes `req`; an answer without one (another client's, or a game that does not echo) is accepted.
        match: (d: any) => d?.req === undefined || d.req === req,
      });
      const failed = new Promise<never>((_, reject) => errorWaiters.set(req, (m) => reject(new Error(m))));
      answer.catch(() => {});
      return Promise.race([answer, failed]).catch((e) => { throw new Error(humanError(e)); }).finally(() => errorWaiters.delete(req));
    }

    // Another client of the player showing the feed for the same session: the last panel to close unsubscribes.
    const presence = new Map<string, SyncChannel<{ open: boolean }> | null>();
    const channelOf = (sid: string) => {
      if (presence.has(sid)) return presence.get(sid) ?? null;
      let ch: SyncChannel<{ open: boolean }> | null = null;
      try { const c = mu.sync.channel<{ open: boolean }>('activity.open', { scope: 'session', sid }); if (c && typeof c.publish === 'function') ch = c; } catch { /* no sync: this client decides alone */ }
      presence.set(sid, ch);
      return ch;
    };
    const othersOpen = (sid: string) => {
      const ch = channelOf(sid);
      try { return !!ch && Object.values(ch.all() ?? {}).some((v) => v?.value?.open); } catch { return false; }
    };

    // ── the Puppets bridge ──
    let puppets: PuppetsLike | null = null;
    let puppetsAsk: Promise<void> | null = null;
    const findPuppets = () => {
      if (puppets || puppetsAsk) return;
      puppetsAsk = ctx.api<PuppetsLike>('puppets')
        .then((api) => { if (api && (typeof api.add === 'function' || typeof api.get === 'function')) { puppets = api; for (const [sid, s] of sessions) { watchPuppets(sid, s); redraw(sid); } } })
        .catch(() => { /* Puppets is not enabled here: no Add puppet button */ })
        .finally(() => { puppetsAsk = null; });
    };
    const watchPuppets = (sid: string, s: Sess) => {
      if (!puppets?.watch || s.puppetsOff || !s.store.mounted) return;
      try { s.puppetsOff = puppets.watch(() => redraw(sid), sid); } catch { s.puppetsOff = null; }
    };
    const puppetsFor = (sid: string) => {
      const p = puppets;
      if (!p) return null;
      try { if (p.canAdd && !p.canAdd(sid)) return null; } catch { puppets = null; return null; }
      return {
        has: (id: string) => {
          try { return p.has ? p.has(id, sid) : !!p.get?.('manifest', sid)?.some((x) => idOf(x.npc_id) === id); } catch { return false; }
        },
        add: async (r: Ref) => {
          const npc_id = idOf(r.id);
          if (p.add) await p.add({ npc_id, ...(r.name ? { name: r.name } : {}) }, sid);
          else if ((await mu.gmcp.send('Client.Puppets.Add', { npc_id }, { sid, key: `activity:puppet:${npc_id}:${++reqSeq}` })) !== true) throw new Error(C.noGmcp);
          redraw(sid);
        },
      };
    };

    // ── sessions ──
    const redraw = (sid: string) => sessions.get(sid)?.draws.forEach((f) => f());
    const S = (sid: string): Sess | undefined => sessions.get(sid);
    const setIdentity = (sid: string, s: Sess) => {
      const on = s.store.allowed;
      if (on && !s.identity) { s.identity = mu.sessions.provideIdentity(sid, { roles: [ROLE] }); mu.panels.touch(ID, sid); }
      else if (!on && s.identity) { s.identity(); s.identity = null; }
    };
    mu.sessions.each((ref) => {
      const sid = ref.id;
      const io: StoreIO = {
        request: (op: Op, data: Record<string, unknown>) => ask(sid, op, data),
        send: async (op, data) => { const r = await mu.gmcp.send(`${P}.${op}`, data, { sid, key: `activity:${op}:${++reqSeq}` }); return r === true; },
        changed: () => { const s = sessions.get(sid); if (s) setIdentity(sid, s); redraw(sid); },
        applied: (events) => { if (events.length) for (const f of eventFns) { try { f(events, sid); } catch (e) { mu.log.warn('onEvents handler threw', e); } } },
      } as StoreIO;
      const s: Sess = { store: new ActivityStore(io), draws: new Set(), identity: null, puppetsOff: null };
      sessions.set(sid, s);
      // The role, when the game sent it before we activated.
      const role = mu.gmcp.state(`${P}.Role`, sid) as Role | undefined;
      if (role && typeof role === 'object') s.store.setRole(role);
      return () => {
        s.puppetsOff?.(); s.identity?.();
        try { presence.get(sid)?.close(); } catch { /* gone */ }
        presence.delete(sid);
        sessions.delete(sid);
      };
    });
    // A new connection starts over: the game sends the role again after login.
    mu.sessions.on('state', (ref) => { const s = S(ref.id); if (s && ref.state !== 'connected') s.store.logout(); });

    mu.gmcp.on(`${P}.`, (data, { sid, pkg, replay }) => {
      const s = S(sid);
      if (!s) return;
      const d = (data ?? {}) as any;
      const sub = pkg.slice(P.length + 1).toLowerCase();
      if (sub === 'role') { s.store.setRole(d as Role); return; }
      if (replay) return; // stale stream data: a Subscribe fetches what is current
      if (sub === 'batch') s.store.batch(d as Batch);
      else if (sub === 'snapshot') s.store.snapshot(d as Snapshot);
      else if (sub === 'watches') { if (d.req === undefined || !errorWaiters.size) s.store.setWatches(d.watches as Watches); }
      else if (sub === 'error') {
        const w = typeof d.req === 'number' ? errorWaiters.get(d.req) : undefined;
        if (w) w(String(d.message ?? C.noAnswer));
        else if (d.req === undefined) s.store.fail(String(d.message ?? C.noAnswer));
      }
    });

    // Puppets 1.1 has no `watch`: redraw (In puppets) when the game sends the puppet list.
    mu.gmcp.on('Client.Puppets.Manifest', (_d, { sid }) => { if (puppets && !puppets.watch) redraw(sid); });

    // ── the panel ──
    const viewOf = (sid: string) => {
      const store = mu.storage.session(sid);
      return {
        get: (): ViewPrefs => {
          const o = store.get<Partial<ViewPrefs> | null>('view', null) ?? {};
          return { cat: CATS.includes(o.cat as Category) ? (o.cat as Category) : 'all', watched: !!o.watched };
        },
        set: (p: ViewPrefs) => store.set('view', p),
      };
    };
    const mounted = new WeakMap<HTMLElement, ReturnType<typeof mountPanel>>();
    mu.panels.register({
      id: ID, title: C.title, defaultPosition: 'right-bottom', show: 'auto', role: ROLE,
      mount: (el, pc) => {
        const sid = pc.sid ?? mu.sessions.active()?.id ?? null;
        const s = sid ? S(sid) : undefined;
        if (!sid || !s) { el.replaceChildren(h('p', { class: 'empty', 'data-testid': 'activity-empty' }, C.notAllowed)); return () => el.replaceChildren(); }
        findPuppets();
        const p = mountPanel(mu, { store: s.store, listen: (fn) => { s.draws.add(fn); return () => s.draws.delete(fn); }, view: viewOf(sid), puppets: () => puppetsFor(sid) }, el);
        mounted.set(el, p);
        s.store.open();
        watchPuppets(sid, s);
        const ch = channelOf(sid);
        void ch?.publish({ open: true }).catch(() => {});
        return () => {
          p.dispose();
          mounted.delete(el);
          s.store.close(othersOpen(sid));
          if (!s.store.mounted) { s.puppetsOff?.(); s.puppetsOff = null; void ch?.publish({ open: false }).catch(() => {}); }
        };
      },
      // Hot reload: the filter, the watch search and the open row survive a rebuild.
      snapshot: (el) => mounted.get(el)?.snapshot(),
      restore: (el, saved) => { if (saved) mounted.get(el)?.restore(saved as PanelSnap); },
    });
    mu.commands.register({ id: `${ID}.open`, title: C.openCommand, run: () => mu.panels.open(ID) });
    // A role that arrived before the panel was registered (the game sent it before this extension activated):
    // its `touch` was a no-op then, so touch again now that the panel exists.
    for (const [sid, s] of sessions) if (s.identity) mu.panels.touch(ID, sid);

    // ── the API (per caller) ──
    const sidOr = (sid?: string) => sid ?? mu.sessions.active()?.id ?? '';
    const api = (caller: CallerContext): ActivityApi => ({
      open: () => mu.panels.open(ID),
      allowed: (sid) => !!S(sidOr(sid))?.store.allowed,
      events: (sid) => [...(S(sidOr(sid))?.store.events ?? [])],
      watches: (sid) => { const w = S(sidOr(sid))?.store.watches; return { characters: [...(w?.characters ?? [])], locations: [...(w?.locations ?? [])] }; },
      onEvents: (fn) => { eventFns.add(fn); return caller.track(() => { eventFns.delete(fn); }); },
    });
    ctx.exports(api);
    return api({ id: ID, track: (d) => d });
  },
});
