# K4 notes (v17 calm: module pages)

Running log; newest last.

- Harness: scratchpad/harness-k4 (Vite on 5304, Dexie seeded through the app's own write functions, sign-in stubbed).
  `SRC=$PWD/base/src TAG=before npx vite --config vite.config.ts` for v17/base, plain for the worktree; `node shoot.mjs before|after [name]`.
  Before shots and counts taken from v17/base (counts-before.json).
- Module head (src/modules/ModuleHead.tsx): ModuleHeadProvider draws glyph, name and a slot; sections render <ModuleMenu>
  (portal into the slot) with views / own items / export; useHideModuleHead for builder, session, project and goal pages.
  A page that renders no ModuleMenu gets the plain one (Export, Edit module, About). ViewBar over a power view; QuietAdd lines.
- Done: Sleep, Health, Training (+session), Finance, Learning (renamed), Projects/Goals, Habits, Chores, Supplements, Stats,
  Stats builder, StatsView export into card ⋮, Generic module page (views into ⋮ → Views).
- Left: e2e selectors, checks, final shots, report.
