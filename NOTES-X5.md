# NOTES-X5 — Android: launcher shortcuts (NAV-24), quick-add widget (WID-11), Health Connect sleep import (SLP-05)

Running log, newest at the bottom. Branch v19/x5, worktree /home/claude/wt19/x5.

## Plan (decided after reading the code)

- Deep links: the app already routes `app.getit.planner://open/<path>` (src/lib/widget.ts `openWidgetLink`, rule
  `widgetPath` in widget-rules.ts). Shortcuts and the quick-add widget use the same shape:
  `app.getit.planner://open/?add=<entry key>` (entry keys are the + menu's own: `task`, `inbox`, `food`, `event`,
  `m:<module>`). Today's + (AddFab) reads `?add=`, opens that entry's sheet, and drops the parameter.
- The + menu's top items are the person's own arrangement (`arrangeAdd`: most used first or their own order,
  hidden ones left out, off modules never there). The app sends the first four to the phone whenever they change;
  the phone keeps them for the quick-add widget and publishes them as dynamic launcher shortcuts.
- Health Connect: no maintained Capacitor 8 plugin fits (see below), so a small local plugin in Kotlin against
  androidx.health.connect:connect-client.
- Sleep rows have no `data` column, and a row is inserted whole on sync, so the Health Connect id needs a column:
  migration 039 adds `sleep_log.import_id`.
