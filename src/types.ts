/**
 * The public types of @runmu.sh/ext-activity: the `Client.Activity 1` payloads (see README and schema/) and the API
 * other extensions get with `await ctx.api<ActivityApi>('activity')`. The API is per caller (SDK 1.12 `ctx.exports`):
 * what you register through it is removed when your extension is disabled.
 */
import type { Dispose } from '@muclient/sdk';

/** An id as the game sends it (a dbref number or a string). Compared as strings. */
export type Id = string | number;

/** Someone or something an event names. `kind` is `character`, `npc` or `location` (others are shown, not watched). */
export interface Ref { id: Id; kind?: string; name?: string }

/**
 * One feed event. `kind`: `handset.<x>` (a text; `handset.group` names `meta.group_name`), `looc`, `npc.action`, or
 * anything else (shown under NPC). `seq` increases by one per event within a stream.
 */
export interface ActivityEvent {
  id: Id;
  seq: number;
  ts_ms?: number;
  kind: string;
  body?: string;
  actor?: Ref | null;
  targets?: Ref[];
  npc_targets?: Ref[];
  location?: Ref | null;
  meta?: { group_name?: string; [k: string]: unknown };
}

export interface WatchItem { id: Id; label: string }
export interface Watches { characters: WatchItem[]; locations: WatchItem[] }
export type WatchKind = keyof Watches;
export interface SearchResult { id: Id; name: string; kind: string }

/** `Client.Activity.Role` (also inside a Snapshot). */
export interface Role { allowed: boolean; can_puppet?: boolean }
/** `Client.Activity.Batch`: new events of a stream. */
export interface Batch { stream_id: string; last_seq: number; events: ActivityEvent[] }
/** `Client.Activity.Snapshot`: the answer to Subscribe (the recent events, the role and the player's watches). */
export interface Snapshot extends Batch { role?: Role; watches?: Watches }

/** `ctx.api<ActivityApi>('activity')`. `sid` defaults to the active session. */
export interface ActivityApi {
  /** Open the Activity panel (in the active session). */
  open(): void;
  /** The game allows this character the feed (Client.Activity.Role). */
  allowed(sid?: string): boolean;
  /** The events held for the session (at most 1000, oldest first), while its panel is open. */
  events(sid?: string): readonly ActivityEvent[];
  watches(sid?: string): Watches;
  /** New events as they are applied to a session's feed. Removed when your extension is disabled. */
  onEvents(fn: (events: readonly ActivityEvent[], sid: string) => void): Dispose;
}
