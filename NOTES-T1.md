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
