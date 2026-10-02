// The feed's state on its own (src/store.ts), behaviour by behaviour, as Underspire's activity store has it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, fakeIO, tick } from './load.mjs';

const { ActivityStore, CAP, QUEUE } = await load('src/store.ts');

const ev = (seq, o = {}) => ({ id: `e${seq}`, seq, ts_ms: 1700000000000 + seq * 1000, kind: 'handset.sms', body: `body ${seq}`, actor: { id: 1, kind: 'character', name: 'Ada' }, targets: [], npc_targets: [], location: { id: 50, kind: 'location', name: 'Dock' }, ...o });
const snap = (o = {}) => ({ stream_id: 'A', last_seq: 3, events: [ev(1), ev(2), ev(3)], role: { allowed: true, can_puppet: true }, watches: { characters: [], locations: [] }, ...o });
async function subscribed(o) {
  const io = fakeIO();
  const st = new ActivityStore(io);
  st.setRole({ allowed: true, can_puppet: true });
  st.open();
  io.answer('Subscribe', snap(o));
  await tick();
  return { io, st };
}

test('role: allowed and can_puppet; can_puppet needs allowed', () => {
  const st = new ActivityStore(fakeIO());
  assert.equal(st.known, false);
  st.setRole({ allowed: false, can_puppet: true });
  assert.deepEqual([st.known, st.allowed, st.canPuppet], [true, false, false]);
  st.setRole({ allowed: true, can_puppet: true });
  assert.deepEqual([st.allowed, st.canPuppet], [true, true]);
});

test('subscribes only while allowed and a panel is mounted, once', async () => {
  const io = fakeIO();
  const st = new ActivityStore(io);
  st.open();
  assert.equal(io.asked.length, 0, 'not allowed yet: no subscribe');
  st.setRole({ allowed: true });
  assert.equal(io.open('Subscribe').length, 1, 'allowed with a panel: subscribe');
  st.open();
  void st.ensureSubscribed();
  assert.equal(io.open('Subscribe').length, 1, 'deduped while in flight');
  assert.equal(st.loading, true);
  const io2 = fakeIO(), st2 = new ActivityStore(io2);
  st2.setRole({ allowed: true });
  assert.equal(io2.asked.length, 0, 'allowed but no panel: no subscribe');
});

test('snapshot sets the stream, events, watches and can_puppet', async () => {
  const { st, io } = await subscribed({ watches: { characters: [{ id: 7, label: 'Bo' }], locations: [] }, role: { allowed: true, can_puppet: false } });
  assert.equal(st.streamId, 'A');
  assert.equal(st.lastSeq, 3);
  assert.deepEqual(st.events.map((e) => e.seq), [1, 2, 3]);
  assert.deepEqual(st.watches.characters, [{ id: '7', label: 'Bo' }]);
  assert.equal(st.canPuppet, false);
  assert.equal(st.loading, false);
  assert.equal(io.got.length, 3);
});

test('a snapshot that says not allowed drops the feed', async () => {
  const io = fakeIO(), st = new ActivityStore(io);
  st.setRole({ allowed: true }); st.open();
  io.answer('Subscribe', snap({ role: { allowed: false } }));
  await tick();
  assert.equal(st.allowed, false);
  assert.equal(st.events.length, 0);
});

test('batch: applies newer events, ignores old ones, merges by id, sorts by seq', async () => {
  const { st } = await subscribed();
  st.batch({ stream_id: 'A', last_seq: 5, events: [ev(5), ev(4), ev(2, { body: 'dup' })] });
  assert.deepEqual(st.events.map((e) => e.seq), [1, 2, 3, 4, 5]);
  assert.equal(st.events[1].body, 'body 2', 'seq <= lastSeq is ignored');
  assert.equal(st.lastSeq, 5);
  assert.equal(st.gap, false);
});

test('batch with a missing range raises the gap; Dismiss clears it', async () => {
  const { st } = await subscribed();
  st.batch({ stream_id: 'A', last_seq: 9, events: [ev(9)] });
  assert.equal(st.gap, true);
  st.dismissGap();
  assert.equal(st.gap, false);
});

test('resubscribe on the same stream detects a gap', async () => {
  const { st, io } = await subscribed();
  void st.ensureSubscribed();
  io.answer('Subscribe', snap({ last_seq: 8, events: [ev(6), ev(7), ev(8)] }));
  await tick();
  assert.equal(st.gap, true);
  assert.equal(st.lastSeq, 8);
});

test('a batch of another stream resubscribes; a new stream resets the feed', async () => {
  const { st, io } = await subscribed();
  const epoch = st.epoch;
  st.batch({ stream_id: 'B', last_seq: 1, events: [ev(1, { id: 'b1' })] });
  assert.equal(io.open('Subscribe').length, 1);
  io.answer('Subscribe', snap({ stream_id: 'B', last_seq: 2, events: [ev(1, { id: 'b1' }), ev(2, { id: 'b2' })] }));
  await tick();
  assert.equal(st.streamId, 'B');
  assert.deepEqual(st.events.map((e) => e.id), ['b1', 'b2']);
  assert.equal(st.gap, false);
  assert.ok(st.epoch > epoch, 'view state resets');
});

test('batches that arrive while subscribing are queued (last 64) and applied after', async () => {
  const io = fakeIO(), st = new ActivityStore(io);
  st.setRole({ allowed: true }); st.open();
  for (let i = 0; i < QUEUE + 5; i++) st.batch({ stream_id: 'A', last_seq: 4 + i, events: [ev(4 + i)] });
  io.answer('Subscribe', snap());
  await tick();
  assert.equal(st.lastSeq, 3 + QUEUE + 5);
  assert.equal(st.gap, true, 'the 5 dropped batches leave a gap');
  const st2 = new ActivityStore(fakeIO());
  st2.batch({ stream_id: 'A', last_seq: 1, events: [ev(1)] });
  assert.equal(st2.events.length, 0, 'ignored when not allowed or not mounted');
});

test('keeps the last 1000 events', async () => {
  const { st } = await subscribed();
  st.batch({ stream_id: 'A', last_seq: 1100, events: Array.from({ length: 1097 }, (_, i) => ev(4 + i)) });
  assert.equal(st.events.length, CAP);
  assert.equal(st.events[0].seq, 101);
});

test('closing the last panel unsubscribes and clears', async () => {
  const { st, io } = await subscribed();
  st.open();
  st.close();
  assert.equal(io.sent.length, 0, 'one panel still mounted');
  st.close();
  assert.deepEqual(io.sent.map((s) => s.op), ['Unsubscribe']);
  assert.equal(st.events.length, 0);
  assert.equal(st.streamId, '');
  const b = await subscribed();
  b.st.close(true);
  assert.equal(b.io.sent.length, 0, 'another client still shows the feed: no unsubscribe');
});

test('logout drops everything', async () => {
  const { st } = await subscribed();
  st.logout();
  assert.deepEqual([st.allowed, st.canPuppet, st.events.length, st.known], [false, false, 0, true]);
});

test('an error during subscribe is shown, Retry subscribes again', async () => {
  const io = fakeIO(), st = new ActivityStore(io);
  st.setRole({ allowed: true }); st.open();
  io.reject('Subscribe', 'The game did not answer.');
  await tick();
  assert.equal(st.error, 'The game did not answer.');
  assert.equal(st.loading, false);
  void st.ensureSubscribed();
  assert.equal(io.open('Subscribe').length, 1);
});

test('pause hides events after the cutoff; rolled out when the cutoff leaves the feed', async () => {
  const { st } = await subscribed();
  st.togglePause();
  assert.equal(st.pauseCutoff, 3);
  st.batch({ stream_id: 'A', last_seq: 4, events: [ev(4)] });
  assert.deepEqual(st.filtered('all', false, '').map((e) => e.seq), [1, 2, 3]);
  assert.equal(st.countAfter(3, 'all', false, ''), 1);
  assert.equal(st.rolledOut, false);
  st.batch({ stream_id: 'A', last_seq: 1004, events: Array.from({ length: 1000 }, (_, i) => ev(5 + i)) });
  assert.equal(st.rolledOut, true);
  st.togglePause();
  assert.equal(st.filtered('all', false, '').length, CAP);
});

test('filters: category, watched scope, text', async () => {
  const { st } = await subscribed({ last_seq: 5, events: [
    ev(1, { kind: 'handset.sms' }),
    ev(2, { kind: 'looc', actor: { id: 2, kind: 'character', name: 'Bo' }, body: 'ooc talk' }),
    ev(3, { kind: 'npc.action', npc_targets: [{ id: 901, name: 'Sister Wren' }], body: 'nods' }),
    ev(4, { kind: 'handset.group', meta: { group_name: 'Night Shift' }, location: { id: 60, kind: 'location', name: 'Mill' } }),
    ev(5, { kind: 'combat', targets: [{ id: 3, kind: 'character', name: 'Cy' }] }),
  ], watches: { characters: [{ id: 901, label: 'Sister Wren' }], locations: [{ id: 60, label: 'Mill' }] } });
  const seqs = (...a) => st.filtered(...a).map((e) => e.seq);
  assert.deepEqual(seqs('text', false, ''), [1, 4]);
  assert.deepEqual(seqs('looc', false, ''), [2]);
  assert.deepEqual(seqs('npc', false, ''), [3]);
  assert.deepEqual(seqs('all', true, ''), [3, 4], 'watched NPC target and watched location');
  assert.deepEqual(seqs('all', false, 'NIGHT'), [4], 'group name, any case');
  assert.deepEqual(seqs('all', false, 'wren'), [3], 'npc target name');
  assert.deepEqual(seqs('all', false, 'cy'), [5], 'target name');
  assert.deepEqual(seqs('all', false, 'mill'), [4], 'location name');
  assert.deepEqual(seqs('all', false, 'ooc'), [2], 'body');
  assert.equal(st.countAfter(2, 'text', false, ''), 1);
});

test('search: two characters at least, answers of an older query are dropped', async () => {
  const { st, io } = await subscribed();
  await st.search('a');
  assert.equal(io.open('Search').length, 0);
  const first = st.search('ad');
  const second = st.search('ada');
  assert.equal(st.searching, true);
  io.answer('Search', { results: [{ id: 1, name: 'old', kind: 'character' }] });
  io.answer('Search', { results: [{ id: 1, name: 'Ada', kind: 'character' }] });
  await Promise.all([first, second]);
  assert.deepEqual(st.results, [{ id: '1', name: 'Ada', kind: 'character' }]);
  assert.equal(st.searching, false);
  assert.equal(io.asked.find((a) => a.op === 'Search').data.query, 'ad');
});

test('watch / unwatch: characters or locations, busy while in flight, watches from the answer', async () => {
  const { st, io } = await subscribed();
  const p = st.toggleWatch({ id: 1, kind: 'character', name: 'Ada' });
  assert.equal(st.busy, true);
  void st.toggleWatch({ id: 50, kind: 'location' });
  assert.equal(io.open('Watch').length, 1, 'no second change while busy');
  io.answer('Watch', { watches: { characters: [{ id: 1, label: 'Ada' }], locations: [] } });
  await p;
  assert.equal(st.busy, false);
  assert.equal(st.isWatched({ id: '1', kind: 'character' }), true);
  const q = st.toggleWatch({ id: 1, kind: 'npc' });
  assert.deepEqual(io.open('Unwatch')[0].data, { id: 1, kind: 'characters' });
  io.answer('Unwatch', { watches: { characters: [], locations: [] } });
  await q;
  const r = st.toggleWatch({ id: 50, kind: 'location' });
  assert.deepEqual(io.open('Watch')[0].data, { id: 50, kind: 'locations' });
  io.reject('Watch', 'nope');
  await r;
  assert.equal(st.error, 'nope');
});
