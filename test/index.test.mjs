/**
 * `npm test`: the extension in the headless μClient host (@runmu.sh/dev/test), with happy-dom for the panel. The
 * host runs `activate` against a fake `mu`; the tests feed it Client.Activity GMCP (or the .murec in
 * test/fixtures) and assert on what it sent, the session's roles, the panel's DOM and its API.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load, dom, tick } from './load.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CREATED_FROM = '/tank/data/Dev/games/muClient/clients/extensions/dev/test.mjs';
function find() {
  if (process.env.MUCLIENT_DEV_TEST) return process.env.MUCLIENT_DEV_TEST;
  try { return createRequire(join(ROOT, 'package.json')).resolve('@runmu.sh/dev/test'); } catch { /* next */ }
  if (CREATED_FROM && existsSync(CREATED_FROM)) return CREATED_FROM;
  throw new Error('@runmu.sh/dev/test was not found. Run npm install (it is in the @runmu.sh/dev devDependency).');
}
const { createHost } = await import(pathToFileURL(find()).href);
await dom();
const def = (await load('src/index.ts')).default;
const FIX = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/session.murec'), 'utf8'));
const SNAP = FIX.events.find((e) => e.pkg === 'Client.Activity.Snapshot').data;
const BATCH = FIX.events.find((e) => e.pkg === 'Client.Activity.Batch').data;

/** Load the extension; `puppets` is what `ctx.api('puppets')` resolves (undefined: it rejects, as with no Puppets). */
async function start({ puppets, sessions } = {}) {
  const host = createHost({ root: ROOT, ...(sessions ? { sessions } : {}) });
  const ext = await host.load({ activate: (ctx) => { if (puppets) ctx.api = async (id) => { if (id !== 'puppets') throw new Error('no'); return puppets; }; return def.activate(ctx); } });
  return { host, ext };
}
/** Mount the panel for `sid` into a fresh element; returns helpers over its DOM. */
function mount(host, sid = 's1') {
  const el = document.createElement('div');
  document.body.append(el);
  const off = host.panels.get('activity').mount(el, { sid, worldId: 'w1', params: {} });
  const $ = (t) => el.querySelector(`[data-testid="${t}"]`);
  const $$ = (t) => [...el.querySelectorAll(`[data-testid="${t}"]`)];
  const rows = () => $$('activity-event').map((r) => r.dataset.seq);
  const click = (node) => node.dispatchEvent(new window.Event('click', { bubbles: true }));
  const type = (node, v) => { node.value = v; node.dispatchEvent(new window.Event('input', { bubbles: true })); };
  return { el, off, $, $$, rows, click, type };
}
const reqs = (host, pkg) => host.sends('gmcp').filter((s) => s.pkg === `Client.Activity.${pkg}`);
async function live(o = {}) {
  const x = await start(o);
  x.host.gmcp('s1', 'Client.Activity.Role', { allowed: true, can_puppet: true });
  const p = mount(x.host);
  await tick();
  x.host.gmcp('s1', 'Client.Activity.Snapshot', SNAP);
  await tick();
  return { ...x, ...p };
}

test('registers the panel (auto, staff role), the command and the API', async () => {
  const { host, ext } = await start();
  const spec = host.panels.get('activity');
  assert.equal(spec.title, 'Activity');
  assert.equal(spec.show, 'auto');
  assert.equal(spec.role, 'activity');
  assert.ok(host.commands.has('activity.open'));
  assert.equal(typeof ext.api.events, 'function');
  host.commands.get('activity.open').run();
  assert.deepEqual(host.calls.find((c) => c.path === 'panels.open').args[0], 'activity');
});

test('a Role that arrived before activation touches the panel after it is registered (mid-session install)', async () => {
  const host = createHost({ root: ROOT });
  host.gmcp('s1', 'Client.Activity.Role', { allowed: true, can_puppet: true });
  const touchAfterRegister = [];
  await host.load({ activate: (ctx) => {
    const mu = ctx.mu; let registered = false;
    const wrapped = new Proxy(mu, { get: (t, k) => k !== 'panels' ? t[k] : new Proxy(t.panels, { get: (p, m) => m === 'register' ? (spec) => { registered = true; return p.register(spec); } : m === 'touch' ? (id, sid) => { touchAfterRegister.push(registered); return p.touch(id, sid); } : p[m] }) });
    return def.activate(new Proxy(ctx, { get: (c, k) => (k === 'mu' ? wrapped : c[k]) }));
  } });
  assert.deepEqual(host.sessions[0].roles, ['activity']);
  assert.ok(touchAfterRegister.includes(true), `touched after register: ${JSON.stringify(touchAfterRegister)}`);
});

test('Role allowed gives the session the activity role and touches the panel; not allowed takes it away', async () => {
  const { host, ext } = await start();
  assert.deepEqual(host.sessions[0].roles, []);
  host.gmcp('s1', 'Client.Activity.Role', { allowed: true, can_puppet: false });
  assert.deepEqual(host.sessions[0].roles, ['activity']);
  assert.ok(host.calls.some((c) => c.path === 'panels.touch' && c.args[0] === 'activity' && c.args[1] === 's1'));
  assert.equal(ext.api.allowed('s1'), true);
  assert.equal(reqs(host, 'Subscribe').length, 0, 'no panel: no subscribe');
  const n = host.live().filter((k) => k === 'sessions.provideIdentity').length;
  host.gmcp('s1', 'Client.Activity.Role', { allowed: false });
  assert.equal(ext.api.allowed('s1'), false);
  assert.equal(host.live().filter((k) => k === 'sessions.provideIdentity').length, n - 1, 'identity disposed');
});

test('a Role sent before activation is picked up', async () => {
  const host = createHost({ root: ROOT });
  host.gmcp('s1', 'Client.Activity.Role', { allowed: true });
  await host.load(def);
  assert.deepEqual(host.sessions[0].roles, ['activity']);
});

test('subscribes when the panel mounts, shows the snapshot, unsubscribes when it closes', async () => {
  const { host, ext, rows, $, off } = await live();
  assert.equal(reqs(host, 'Subscribe').length, 1);
  assert.deepEqual(rows(), ['1', '2', '3', '4']);
  assert.equal($('activity-watch-toggle').textContent, 'Watch (1)');
  assert.match($('activity-status').textContent, /^Following · 4 shown$/);
  assert.equal(ext.api.events('s1').length, 4);
  off();
  assert.equal(reqs(host, 'Unsubscribe').length, 1);
  assert.equal(ext.api.events('s1').length, 0, 'the feed is dropped');
});

test('the .murec fixture plays into a live feed (Role, Snapshot, Batch)', async () => {
  const { host } = await start();
  const p = mount(host);
  await host.play('test/fixtures/session.murec');
  await tick();
  assert.equal(reqs(host, 'Subscribe').length, 1);
  assert.deepEqual(p.rows(), ['1', '2', '3', '4', '5', '6']);
});

test('a batch adds rows; one from a skipped range shows the gap notice; Dismiss hides it', async () => {
  const { host, rows, $, click } = await live();
  host.gmcp('s1', 'Client.Activity.Batch', BATCH);
  assert.deepEqual(rows(), ['1', '2', '3', '4', '5', '6']);
  assert.equal($('activity-gap').hidden, true);
  host.gmcp('s1', 'Client.Activity.Batch', { stream_id: SNAP.stream_id, last_seq: 9, events: [{ ...BATCH.events[0], id: 'ev-9', seq: 9 }] });
  assert.equal($('activity-gap').hidden, false);
  assert.equal($('activity-gap').getAttribute('role'), 'status');
  click($('activity-gap-dismiss'));
  assert.equal($('activity-gap').hidden, true);
});

test('a batch of a new stream subscribes again and the feed starts over', async () => {
  const { host, rows } = await live();
  host.gmcp('s1', 'Client.Activity.Batch', { stream_id: 'other', last_seq: 1, events: [] });
  assert.equal(reqs(host, 'Subscribe').length, 2);
  host.gmcp('s1', 'Client.Activity.Snapshot', { stream_id: 'other', last_seq: 1, events: [{ ...SNAP.events[0], id: 'n1', seq: 1 }] });
  await tick();
  assert.deepEqual(rows(), ['1']);
});

test('rows: time, kind, actor → targets / group, body, location', async () => {
  const { $$ } = await live();
  const [sms, looc, npc, group] = $$('activity-event');
  assert.equal(sms.querySelector('.kind').textContent, 'Text');
  assert.equal(sms.querySelector('.summary').textContent, 'Ada Vell → Bo Harrow');
  assert.equal(sms.querySelector('.body').textContent, 'Meet me by the fountain after the bell.');
  assert.equal(sms.querySelector('.location').textContent, 'The Lantern Market');
  assert.match(sms.querySelector('time').textContent, /^\d\d:\d\d$/);
  assert.equal(sms.querySelector('time').getAttribute('datetime'), new Date(SNAP.events[0].ts_ms).toISOString());
  assert.equal(looc.querySelector('.kind').textContent, 'LOOC');
  assert.equal(npc.querySelector('.kind').textContent, 'NPC');
  assert.equal(group.querySelector('.summary').textContent, 'Ada Vell → Night Shift');
});

test('category, scope and text filters, with the matching empty copy', async () => {
  const { rows, $, click, type, host } = await live();
  const cat = (id) => $('activity-category').querySelector(`[data-cat="${id}"]`);
  click(cat('text'));
  assert.deepEqual(rows(), ['1', '4']);
  assert.equal(cat('text').getAttribute('aria-pressed'), 'true');
  click(cat('looc')); assert.deepEqual(rows(), ['2']);
  click(cat('npc')); assert.deepEqual(rows(), ['3']);
  click(cat('all'));
  click($('activity-scope-watched'));
  assert.deepEqual(rows(), ['3'], 'Sister Wren is watched');
  click($('activity-scope-global'));
  type($('activity-filter'), 'night');
  assert.deepEqual(rows(), ['4']);
  type($('activity-filter'), 'zzz');
  assert.equal($('activity-empty').textContent, 'No activity matches these filters.');
  type($('activity-filter'), '');
  assert.equal(host.mu.storage.session('s1').get('view').cat, 'all', 'category and scope kept per session');
});

test('empty states: loading, waiting, no watches', async () => {
  const { host } = await start();
  host.gmcp('s1', 'Client.Activity.Role', { allowed: true });
  const p = mount(host);
  assert.equal(p.$('activity-empty').textContent, 'Loading activity…');
  host.gmcp('s1', 'Client.Activity.Snapshot', { stream_id: 'x', last_seq: 0, events: [], watches: { characters: [], locations: [] } });
  await tick();
  assert.equal(p.$('activity-empty').textContent, 'New player activity will appear here.');
  p.click(p.$('activity-scope-watched'));
  assert.equal(p.$('activity-empty').textContent, 'Add a watch to see activity for a character or location.');
  const q = await start();
  const p2 = mount(q.host);
  assert.equal(p2.$('activity-empty').textContent, 'Loading activity…', 'role not known yet');
  q.host.gmcp('s1', 'Client.Activity.Role', { allowed: false });
  assert.equal(p2.$('activity-empty').textContent, 'Activity is not available to this character.');
});

test('pause: new events wait, Latest (N) and Resume show them', async () => {
  const { host, rows, $, click, type } = await live();
  click($('activity-pause'));
  assert.equal($('activity-pause').getAttribute('aria-pressed'), 'true');
  assert.equal($('activity-pause').textContent, 'Resume');
  host.gmcp('s1', 'Client.Activity.Batch', BATCH);
  assert.deepEqual(rows(), ['1', '2', '3', '4']);
  assert.match($('activity-status').textContent, /^Paused · 4 shown$/);
  assert.equal($('activity-latest').hidden, false);
  assert.equal($('activity-latest').textContent, 'Latest (2)');
  click($('activity-latest'));
  assert.deepEqual(rows(), ['1', '2', '3', '4', '5', '6']);
  assert.equal($('activity-pause').textContent, 'Pause');
  assert.equal($('activity-latest').hidden, true);
  click($('activity-pause'));
  type($('activity-filter'), 'zzz');
  assert.equal($('activity-empty').textContent, 'Feed paused. Resume to see new activity.', 'paused copy comes before the filter copy');
});

test('paused past the 1000 kept: the rolled-out notice', async () => {
  const { host, $, click } = await live();
  click($('activity-pause'));
  const events = Array.from({ length: 1000 }, (_, i) => ({ ...BATCH.events[0], id: `x${i}`, seq: 5 + i }));
  host.gmcp('s1', 'Client.Activity.Batch', { stream_id: SNAP.stream_id, last_seq: 1004, events });
  assert.equal($('activity-rolled-out').hidden, false);
});

test('expanding a row shows its actions; watch the actor, an NPC and the location', async () => {
  const { host, $, $$, click } = await live();
  const row = () => $$('activity-event')[2];
  click(row().querySelector('.event-trigger'));
  assert.equal(row().querySelector('.event-trigger').getAttribute('aria-expanded'), 'true');
  assert.ok(row().classList.contains('selected'));
  const labels = [...row().querySelectorAll('[data-testid="activity-actions"] button')].map((b) => b.textContent);
  assert.deepEqual(labels, ['Watch Cyprian', 'Unwatch Sister Wren', 'Watch location'], 'no puppets extension: no Add puppet');
  click([...row().querySelectorAll('[data-testid="activity-watch"]')][2]);
  const w = reqs(host, 'Watch').at(-1);
  assert.equal(w.data.id, '#300');
  assert.equal(w.data.kind, 'locations');
  assert.ok(row().querySelectorAll('[data-testid="activity-watch"]')[0].disabled, 'busy while in flight');
  host.gmcp('s1', 'Client.Activity.Watches', { req: w.data.req, watches: { characters: [{ id: '#901', label: 'Sister Wren' }], locations: [{ id: '#300', label: 'The Lantern Market' }] } });
  await tick();
  assert.equal($('activity-watch-toggle').textContent, 'Watch (2)');
  assert.equal(row().querySelectorAll('[data-testid="activity-watch"]')[2].textContent, 'Unwatch location');
  click(row().querySelectorAll('[data-testid="activity-watch"]')[1]);
  assert.deepEqual({ id: reqs(host, 'Unwatch').at(-1).data.id, kind: reqs(host, 'Unwatch').at(-1).data.kind }, { id: '#901', kind: 'characters' });
  click(row().querySelector('.event-trigger'));
  assert.equal(row().querySelector('[data-testid="activity-actions"]'), null, 'collapses');
});

test('watch manager: search after 250 ms, results, chips that unwatch', async () => {
  const { host, $, $$, click, type } = await live();
  click($('activity-watch-toggle'));
  assert.equal($('activity-watch-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal($('activity-watch-manager').hidden, false);
  assert.equal($$('activity-unwatch')[0].getAttribute('aria-label'), 'Unwatch Sister Wren');
  assert.equal($('activity-watch-hint').hidden, true);
  type($('activity-watch-search'), 'fe');
  assert.equal(reqs(host, 'Search').length, 0, 'debounced');
  await tick(300);
  assert.equal(reqs(host, 'Search').at(-1).data.query, 'fe');
  assert.equal($('activity-search-hint').textContent, 'Searching…');
  host.gmcp('s1', 'Client.Activity.Results', { req: reqs(host, 'Search').at(-1).data.req, query: 'fe', results: [{ id: '#902', name: 'the ferryman', kind: 'npc' }] });
  await tick();
  const r = $$('activity-result')[0];
  assert.match(r.textContent, /the ferryman #902 · npc/);
  assert.match(r.textContent, /Watch$/);
  click(r);
  assert.deepEqual([reqs(host, 'Watch').at(-1).data.id, reqs(host, 'Watch').at(-1).data.kind], ['#902', 'characters']);
  host.gmcp('s1', 'Client.Activity.Watches', { watches: { characters: [], locations: [] } });
  await tick();
  type($('activity-watch-search'), 'zz');
  await tick(300);
  host.gmcp('s1', 'Client.Activity.Results', { query: 'zz', results: [] });
  await tick();
  assert.equal($('activity-search-hint').textContent, 'No matching character, NPC or location.');
  assert.equal($('activity-watch-hint').hidden, false, 'no watches: the hint');
});

test('an Error answer shows the alert; Retry subscribes again', async () => {
  const { host } = await start();
  host.gmcp('s1', 'Client.Activity.Role', { allowed: true });
  const p = mount(host);
  const req = reqs(host, 'Subscribe')[0].data.req;
  host.gmcp('s1', 'Client.Activity.Error', { req, message: 'Feed unavailable.' });
  await tick();
  assert.equal(p.$('activity-error').hidden, false);
  assert.equal(p.$('activity-error').getAttribute('role'), 'alert');
  assert.match(p.$('activity-error').textContent, /Feed unavailable\./);
  p.click(p.$('activity-retry'));
  assert.equal(reqs(host, 'Subscribe').length, 2);
});

test('Add puppet through the Puppets extension; In puppets once added; hidden without can_puppet', async () => {
  const added = [];
  const set = new Set(['#902']);
  const puppets = { add: async (npc, sid) => { added.push([npc, sid]); set.add(npc.npc_id); return 'sent'; }, has: (id) => set.has(String(id)), canAdd: () => true };
  const { host, $$, click } = await live({ puppets });
  await tick();
  const row = () => $$('activity-event')[2];
  click(row().querySelector('.event-trigger'));
  const btn = () => row().querySelector('[data-testid="activity-add-puppet"]');
  assert.equal(btn().textContent, 'Add puppet');
  click(btn());
  await tick();
  assert.deepEqual(added, [[{ npc_id: '#901', name: 'Sister Wren' }, 's1']]);
  assert.equal(btn().textContent, 'In puppets');
  assert.equal(btn().disabled, true);
  host.gmcp('s1', 'Client.Activity.Batch', BATCH);
  const five = $$('activity-event')[4];
  click(five.querySelector('.event-trigger'));
  const labels = [...$$('activity-event')[4].querySelectorAll('[data-testid="activity-add-puppet"]')].map((b) => b.textContent);
  assert.deepEqual(labels, ['In puppets: the ferryman', 'Add puppet: a dock gull'], 'names appended when several');
  host.gmcp('s1', 'Client.Activity.Role', { allowed: true, can_puppet: false });
  assert.equal($$('activity-event')[4].querySelector('[data-testid="activity-add-puppet"]'), null);
});

test('per session: two sessions keep separate feeds and roles', async () => {
  const { host } = await start({ sessions: [{ id: 's1', worldId: 'w1' }, { id: 's2', worldId: 'w1' }] });
  host.gmcp('s1', 'Client.Activity.Role', { allowed: true });
  host.gmcp('s2', 'Client.Activity.Role', { allowed: false });
  assert.deepEqual(host.sessions.map((s) => s.roles), [['activity'], []]);
  const a = mount(host, 's1');
  const b = mount(host, 's2');
  host.gmcp('s1', 'Client.Activity.Snapshot', SNAP);
  await tick();
  assert.equal(a.rows().length, 4);
  assert.equal(b.rows().length, 0);
  assert.equal(reqs(host, 'Subscribe').every((s) => s.sid === 's1'), true);
});

test('a disconnect drops the feed and the role', async () => {
  const { host, ext, rows } = await live();
  host.setState('s1', 'disconnected');
  assert.equal(ext.api.allowed('s1'), false);
  assert.deepEqual(rows(), []);
  assert.equal(host.live().filter((k) => k === 'sessions.provideIdentity').length, 0, 'the role is withdrawn');
});

test('API: onEvents gets the new events; watches()', async () => {
  const { host, ext } = await live();
  const got = [];
  ext.api.onEvents((evs, sid) => got.push([sid, evs.map((e) => e.seq)]));
  host.gmcp('s1', 'Client.Activity.Batch', BATCH);
  assert.deepEqual(got, [['s1', [5, 6]]]);
  assert.deepEqual(ext.api.watches('s1').characters.map((w) => w.label), ['Sister Wren']);
});

test('hot reload keeps the filter and the open row', async () => {
  const { host, $, type, click, $$ } = await live();
  type($('activity-filter'), 'wren');
  click($$('activity-event')[0].querySelector('.event-trigger'));
  const spec = host.panels.get('activity');
  const el = $('activity').parentElement;
  const saved = spec.snapshot(el);
  assert.deepEqual(saved, { filter: 'wren', query: '', manager: false, selected: 'ev-3' });
});

test('unload leaves nothing registered', async () => {
  const { host } = await live();
  await host.unload();
  assert.deepEqual(host.live(), []);
});

test('Puppets 1.1 (no add): Add puppet sends Client.Puppets.Add itself; In puppets from get(manifest)', async () => {
  const list = [{ npc_id: '#902' }];
  const puppets = { get: (what) => (what === 'manifest' ? list : []) };
  const { host, $$, click } = await live({ puppets });
  await tick();
  const row = () => $$('activity-event')[2];
  click(row().querySelector('.event-trigger'));
  click(row().querySelector('[data-testid="activity-add-puppet"]'));
  await tick();
  assert.deepEqual(host.sends('gmcp').filter((s) => s.pkg === 'Client.Puppets.Add').map((s) => s.data), [{ npc_id: '#901' }]);
  list.push({ npc_id: '#901' });
  host.gmcp('s1', 'Client.Puppets.Manifest', { puppets: list });
  assert.equal(row().querySelector('[data-testid="activity-add-puppet"]').textContent, 'In puppets');
});
