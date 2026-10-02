# Changelog

## 1.0.1

- Installed or enabled mid-session: a `Client.Activity.Role` that arrived before activation now adds the panel. The role was read before the panel was registered, so its `panels.touch` did nothing; the panel is touched again once registered. Has a regression test.

## 1.0.0

- First release: the Activity panel for staff. It shows a live feed of player texts, LOOC and NPC actions, with each event's time, kind, who, to whom, the text and the place.
- Filter by All / Text / LOOC / NPC, show Global or Watched activity only, and filter the feed as text.
- Watch characters, NPCs and locations: search by name or #id, or watch from any event. Remove a watch from its chip.
- Pause the feed and read at your own pace. **Latest (N)** shows how many new events are waiting. A notice says when activity was missed, or when paused events have rolled out of the feed.
- Add an NPC as a puppet from the event (with the Puppets extension). An NPC that is already a puppet shows **In puppets**.
- The panel appears only for characters the game allows, and is added the first time it is. It streams only while it is open, and stops when you close it.
