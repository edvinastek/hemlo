# NOTES-INT17 — v17 integration: live tests green, one calm walk

Running log, newest last. Runner: scratchpad/int17/run.sh <test> (sources the env, never prints it).

## e2e
- offline — test: pushes now live in the open row (⋮ → Open here → Push 30 min); setup moved before sign-in (a
  task removed after the first pull stayed on the device: two rows). App: the row ⋮ (11 items) opened above a row
  near the top and ran off the screen; it now opens on the side with more room and scrolls inside itself.
- Console error on every page with holidays: "Moment Timezone has no data for Europe/Amsterdam" — the build's
  trimmed zones left links pointing at links; flattenLinks (src/lib/tz-links-rules.ts, checked in holidays.check).
