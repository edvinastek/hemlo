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
