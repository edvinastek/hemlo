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
- e2e updated (stats, tracking, modules, views, transfer). Health lists weigh-ins once; empty generic page has one add.
- Verified: npx tsc -b, npm run check (all passed), npx vite build. Shots and counts in scratchpad/shots17/k4.
- Harness deleted. Done; report sent.
