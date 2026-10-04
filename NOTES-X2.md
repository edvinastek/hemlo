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
- BODY-17: adaptive-rules.ts (window: the last 2–3 whole weeks before today, each ≥6 of 7 days logged and ≥1 weigh-in;
  a day under half the median intake counts as not logged; trend rate from trend-rules weeklyRate over the window;
  maintenance = avg intake − rate/7 × 7700, rounded to 10; sane 1,200–5,000). Offered under the targets (WeighIn,
  one line inserted; X3 owns the rest of WeighIn) only for today, when ≥50 kcal off what the targets rest on and the
  factor would be 1.2–2.4; Not now = 14 days. "Use" sets profile.activity_level = estimate ÷ BMR (the basis the
  targets already use, so later weigh-ins keep it), recalcTargets('activity'), Undo restores factor and choice.
  The choice is kept in Health's body settings ('adaptive'). About text in the offer's ⋮ (PlainSheet).
- PROD-05: no on-device OCR: @capacitor-mlkit/barcode-scanning is the only ML Kit package installed (barcodes only);
  text recognition would be a new native plugin. So: the label photo (made smaller with makePhoto) stays in view at
  the top of the new-food form (sticky) to type from; where the browser has TextDetector (Shape Detection API) it is
  read and fills empty fields; "Paste the label's text" (Android can copy text out of a photo) runs the same parser
  (eu-label-rules readLabelText: EN/NL/DE/FR names, sub-lines first, next-line numbers, "<x" = 0, sodium → salt,
  vitamins in their units). Unknown barcode in the add-food sheet's scan → "Add it from its label" (form takes the
  sheet's place). OFF write: products-write-rules.ts (form fields, answers, addToOff with injected fetch — checked with
  a stand-in only). The v18 Open Prices token is Open Prices' own (create_token = "<user>__U<uuid>" in open-prices'
  authentication.py), so it cannot write to OFF: the user name comes from the v18 account and the password is asked
  each time, sent only in the two form posts (product_jqm2.pl, product_image_upload.pl), never kept. CORS checked
  with an OPTIONS request (allow-origin *, X-User-Agent allowed); no write was ever sent.
  Sources: openfoodfacts.github.io/openfoodfacts-server/api/ (Authentication, tutorial "Write data", tutorial
  "uploading images"); registry.npmjs.org/@capacitor-community/keep-awake; github.com/openfoodfacts/open-prices
  (open_prices/common/authentication.py, api/auth/views.py).
- Privacy: src/legal/policy.ts (the text site/privacy.html renders): new section "Adding a product to Open Food
  Facts", recipe photos under "Where your data is kept", "Who else can see it" updated; docs/privacy/processors.md.
  POLICY_VERSION left at 2026-10-05: the lead bumps it at release.
- Harness: scratchpad/harness-x2 (port 5502), shots in scratchpad/shots19/x2. The machine was at load 60–110 on
  2 CPUs for most of the afternoon (other worktrees' tsc, gradle, browsers), so shots were slow.
