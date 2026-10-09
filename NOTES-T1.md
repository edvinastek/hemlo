# NOTES-T1 — live browser tests green (0.23.0)

Branch v23/t1 from main cbc1008. Harness port 5541 (throwaway, deleted at the end).

## Failing tests (live run): features, offline, privacy, tracking, tasksheet, modules, nav, transfer, landscape, tour

## Log
- Start: read task, house rules, all 10 failing logs.
- Cause found for landscape (and tasksheet): the throwaway accounts are made with empty user metadata, so the
  app treats them as older than the policy (2026-10-08) and shows "The privacy policy changed" line; the app
  then moves down 56 px (bar 390-56=334, 360-56=304, 800-56=744 — exact). Harness repro: with metadata {} the
  rail is 334/304/744 px; with privacy_version agreed it is 390/360/800. Portrait bar unaffected either way.
  Fix (environment): scripts/test-accounts.mjs makes accounts the way sign-up does (health_consent_at +
  privacy_version read from src/legal/policy.ts).
- App bug found on the way (tasksheet): the notice (z-index 35) sat over the note page (.np, z 30), covering its
  Back button (elementFromPoint at .np-back = the notice, at 360x740 and 844x390). Fix: notice z-index 19, part of
  the page; sheets, the note page and the fan cover it.
- nav: two causes. (1) Test: the swipe back from Plan started at Today's row height, which on today's Plan
  is the section tabs (Chromium also moves a touch to the nearest tab when it lands just under one); tabs keep
  a swipe by design (useSwipe LEAVE_ALONE). Harness: touchstart target = .tabs although elementFromPoint said
  .plan-bar. Fix: start the swipe back below Plan's head, tabs and strip, measured on Plan (plus a check that
  there is room). (2) App bug found while reproducing: useSwipe's effect was keyed on a ref; the app frame
  (.app) mounts after the pages are known (wizard / "Setting up your profile"), so in some runs the listeners
  were never attached and swiping between pages did nothing for the whole session (harness: 2 of 6 runs, no
  listener attached). Fix: the element is held in state (callback ref) and passed to useSwipe. After: 7 of 7.
- transfer: test. The second "Close" was the policy notice's × (aria-label Close), not a second sheet: no
  CALM-10 sheet-on-sheet. Fix: Close looked up inside the Export dialog (role dialog, name Export). Harness:
  whole test's UI steps pass with the notice showing (only the Postgres row check fails there, no server).
- modules: test. Since v18 (CALM-08) the Agenda event form keeps Where under More options; the renamed field
  is there (harness: 0 before opening More options, 1 after). Fix: open More options first, as section 4 does.
- tracking: test, date-dependent. Last green on 3/4 Oct 2026 (a weekend). On a weekday, after Mobility is
  changed to Weekends it is no longer due and moves into the closed "Not due today" list, so "More for
  Mobility" is not on screen. Fix: open that list when Archive is not in sight (the row is still open there).
  Harness (Friday): passes that step and every later UI step through the Excel import and Export (two-phone
  step and the second account need the server; skipped there).
- offline: test / environment. The fresh account's first sign-in ran the wizard (Minimal planner: Agenda only),
  so Training was off and the 'Training' task Calisthenics A is hidden by design (GEN-01, day-items-rules
  taskModule/shows, since v16). It passed before on a long-lived account with Training on. Harness: training
  off → 0 rows, on → 1 row; the tick and the 30-minute push through "Open here" work (17:00). Fix: switch
  Training on after signing in (modulesOn) and wait for it on the device (moduleHere) before looking.
- tasksheet: environment + app bug. Live it failed because the policy notice covered the note page's Back
  (fixed twice: accounts as sign-up makes them; notice z-index 19 under pages). Harness with the notice on:
  Back is hit (elementFromPoint = .np-back at 360x740 and 844x390) and the whole test's UI steps pass, with
  and without the notice. Also made "the sheet did not grow" measure after the sheet settles: with Projects on,
  More options adds Project and Goal a moment later (harness: 820 then 895 px), a flake waiting to happen.
- features, privacy, tour: environment. They launched Chromium at the sandbox's own path
  (/opt/pw-browsers/chromium-1194), which does not exist on GitHub. Fix: they use the shared open() from
  e2e.mjs (the sandbox's Chromium here, Playwright's own on GitHub, CHROMIUM when set). These three have not
  run against v19-23 at all, so their steps were dry-run on the harness: features' sign-up screen part
  (signed-out harness mode), tasks, meals (with the catalogue's recipes put into the local copy), Today's
  figure, Shop, Reminders and the policy all pass (one harness-only difference: the demo dinner is listed
  first); tour runs to the end with no page errors; privacy's Data page steps (one Sign out, Delete waits for
  the word) behave as the test expects. The server counts and the two-account steps need the live run.
- Passing logs: no page errors, warnings or notes in any of the 19.
- Workflow: no change needed (Playwright installs its Chromium with --with-deps; open() falls back to it).

## Verification (all on the throwaway harness at :5541: built app, stubbed sign-in, seeded Dexie, no network)
- npx tsc -b, npm run check, npx vite build: pass. node --check on every changed .mjs: pass.
- test-accounts.mjs create: the SQL now carries {"health_consent_at": ..., "privacy_version": "2026-10-08"}
  (checked with fetch stood in; noticeDue is false for it).
- Live tests dry-run on the harness (sql stood in by nothing, so server-count checks fail there by design):
  nav 33/33 three runs; landscape 109/109; layout all; modules, transfer, tasksheet (with and without the
  notice), tracking (to the Excel import / Export), features (from sign-up to the policy), tour: every UI step.
- Screenshots: shots23/t1/ — today with and without the policy line, the task sheet over it, the note page with
  Back free, at 360 and 844x390, light and dark.
- Harness deleted.
