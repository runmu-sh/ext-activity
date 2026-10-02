# Activity, a μClient extension

A live staff feed of player texts, LOOC and NPC actions. You can filter it by category, show global or watched activity only, search it as text, and watch characters, NPCs and locations. You can also pause it, and add an NPC as a puppet in one click (with the Puppets extension). The feed is shown only to characters the game allows, and it streams only while the panel is open.

Panel id `activity` (Activity). Command `activity.open`. Capability: `send-commands`.

## How it shows up

- The game sends `Client.Activity.Role {allowed:true}`. The session then gets the `activity` role (`sessions.provideIdentity`), and the panel is offered (`role: 'activity'`) and added once (`show: 'auto'`, `panels.touch`). A per-world **Show panel: auto / on / off** row is on the settings page.
- `allowed:false`, or a disconnect, withdraws the role, and the host closes the panel.
- While a panel for the session is open, the extension subscribes. When the last one closes, it unsubscribes, unless another of the player's clients still shows the feed for that session.

## GMCP: `Client.Activity 1`

Ids may be numbers or strings (`"#120"`); they are compared as strings. Every client→server message carries `req` (a number), and the answer should echo it. An answer without `req` is accepted too. Schemas are in `schema/` and declared in `contributes.gmcp[].messages`; the host validates inbound payloads.

### Server → client

| Message | Payload | When |
|---|---|---|
| `Client.Activity.Role` | `{allowed: bool, can_puppet?: bool}` | After login, and when it changes. `can_puppet` counts only if `allowed`. |
| `Client.Activity.Snapshot` | `{req?, stream_id, last_seq, events: Event[], role?: Role, watches?: Watches}` | The answer to Subscribe: the recent events (up to 1000), the role and the character's watches. |
| `Client.Activity.Batch` | `{stream_id, last_seq, events: Event[]}` | New events, while subscribed. `seq` goes up by 1 per event in a stream. A skipped range shows "Some activity was missed." A new `stream_id` makes the client subscribe again. |
| `Client.Activity.Results` | `{req?, query, results: [{id, name, kind}]}` | The answer to Search. |
| `Client.Activity.Watches` | `{req?, watches: Watches}` | The answer to Watch / Unwatch (the full list). |
| `Client.Activity.Error` | `{req?, message}` | A request failed (with `req`), or the feed failed (without it). The message is shown with Retry. |

`Event`: `{id, seq, ts_ms?, kind, body?, actor?: Ref, targets?: Ref[], npc_targets?: Ref[], location?: Ref, meta?: {group_name?}}`. `kind` takes these values:

- `handset.<x>` is shown as Text. `handset.group` names `meta.group_name`.
- `looc` is shown as LOOC.
- `npc.action`, or anything else, is shown as NPC.

The other shapes:

- `Ref`: `{id, kind?: 'character'|'npc'|'location'|…, name?}`.
- `Watches`: `{characters: [{id, label}], locations: [{id, label}]}`.

### Client → server

| Message | Payload | Answer |
|---|---|---|
| `Client.Activity.Subscribe` | `{req}` | `Snapshot` |
| `Client.Activity.Unsubscribe` | `{req}` | none |
| `Client.Activity.Search` | `{req, query}` (2+ characters, sent 250 ms after typing stops) | `Results` |
| `Client.Activity.Watch` / `Unwatch` | `{req, id, kind: 'characters'|'locations'}` (NPCs go under `characters`) | `Watches` |

**Add puppet** uses the Puppets extension. With Puppets 1.2+ it calls `api.add({npc_id, name}, sid)`, so the player's per-world action settings apply. With Puppets 1.1 it sends `Client.Puppets.Add {npc_id}` itself, and reads `Client.Puppets.Manifest` to show "In puppets". Without Puppets the button is not shown.

## API

```ts
import type { ActivityApi } from '@runmu.sh/ext-activity/src/types';
const activity = await ctx.api<ActivityApi>('activity');
activity.allowed(sid?)            // the game allows the feed
activity.events(sid?)             // the events held while the panel is open (oldest first, ≤ 1000)
activity.watches(sid?)            // {characters, locations}
activity.onEvents((events, sid) => …)   // new events; removed when your extension is disabled
activity.open()
```

## Develop

```
npm install
npm run build && npm run typecheck && npm test   # headless host + happy-dom
node <muClient>/clients/extensions/dev/serve.mjs . --port 0   # then ?demo&ext-dev=<url>
```

`test/fixtures/session.murec` is a Role → Subscribe → Snapshot → Batch session.
