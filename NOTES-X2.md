# NOTES-X2 — version 19, engineer X2 (food extras)

Branch v19/x2. Migration 036, no Dexie version needed so far (new fields on existing rows only).

Gaps: FOOD-17 vitamins and minerals, REC-11 recipe photo, REC-12 cook mode, SUP-07 supplement nutrients,
BODY-17 adaptive maintenance, PROD-05 unknown product.

## Running log

- Start: read preamble, task, requirement rows, competitor notes, calm.md and the code.
- FOOD-17: micros-rules.ts (Annex XIII list, NRVs, sums, day line, stats keys); import-nevo.mjs reads the 20 NEVO
  columns (unit checked against the app's), writes migration 036's generated block ([code, {figures}] per line,
  399 kB, rewritten only where different; 027 untouched). Shown on the food page (%NRV table), recipe page (a portion),
  Food → Day ("NRV: …" line), stats measures nutrition:m_<code> (+ planned). Picked in Settings → Food. Off by default.
  Own foods: fields in the food form for the chosen ones (and any the food has), copies keep NEVO's.
- Why one jsonb column: see the head of migration 036 (27 nutrients, most rows all-or-nothing, one set read
  together; columns would widen every synced row and need a migration per nutrient). Checked by private.micros_ok().
- SUP-07: supplement.nutrients jsonb (036) on the row (synced field by field, a dose is the same every day);
  "Counts towards" in the supplement sheet's More options; ticked doses add to the day line and stats.
- REC-12: cook-rules.ts (steps, timers EN/NL, ranges → upper bound, clock, end-time timers); recipe-cook.ts (app-wide
  timers, sound via Web Audio + vibration, Wake Lock with re-acquire on visibility). RecipeCook.tsx from ⋮ "Cook".
  Keep-awake: @capacitor-community/keep-awake 8.0.1 does support Capacitor 8 (npm registry, peer @capacitor/core >=8),
  but the Wake Lock API works in the Android WebView (Chromium 84+, secure context https://localhost), so no new
  native dependency (node_modules is shared between worktrees, too).
- REC-11: recipe.photo_path (036, checked to sit in the recipe's own folder), storage policies on 'record-photos'
  for 'recipes/<id>/<photo>.jpg' (read: whoever can read the recipe, via recipe RLS; write: owner only).
  recipe-photo.ts: make/keep/upload via modules/photos.ts; set-aside list for replaced/removed photos, removed from
  Storage a day later; deleted recipes' photos a day after; account deletion removes them (photos.ts removeAllPhotos).
- Local DB: added a Storage stand-in to scripts/stub.sql (storage.buckets/objects with RLS and the delete guard), so
  033's and 036's storage policies now actually run in the security suite. 282/282 ok.
