# K2 — calm Food (v17): running log

Branch v17/k2. Harness: scratchpad/harness-k2 (port 5302), shots in scratchpad/shots17/k2.

## Before (360 px, light, tappable things above the fold, page only, no page bar, no list rows)
- Food → Day: 20 (date, 7 strip days, 3 tabs, + Add food, Copy day to…, per meal: eaten tick, +, ⋮; Export)
- Food → Recipes: 19 (+2 Open buttons of the duplicate "Your recipes" list)
- Food → Foods: 19
- Add-food sheet: 11 on step 1 (meal chips, when chips, eaten, Next) before any food can be picked
- Recipe page: 10 · Food page: 5 (the add-unit form always open)

## Plan
1. Food page head: ⋮ slot (portal) top right; Recipes/Foods: heading "Food", no strip; + per tab; no Export link.
2. Day: meal header name · kcal · + · ⋮ (MoreMenu); no eaten tick; Copy day / Export in page ⋮; no footnote.
3. Recipes: one list; Mine chip; Import, Export, Sort, New book, Select in ⋮; sharing column only for shared/waiting.
4. Foods: one search with scan icon; Find in stores as fallback; Figures sheet, New book, Select in ⋮; + = New food; credits out.
5. Add-food sheet: opens on step 2; tabs Recent · Search; Just the numbers link; scan in field; Copy from another day in ⋮.
6. Recipe page / food page: header ⋮; main action at the foot.
7. Editors: More options; e2e updates; screenshots.

## Log
- Steps 1–7 done and committed (see git log). Checks: tsc, npm run check, vite build pass. Harness smoke (27 interactions) passes with no page errors.

## After (360 px, light, same counting)
- Food → Day: 17 (13 without the meal headers' + and ⋮; 11 of them are PageHead's date, strip and tabs) — before 20
- Food → Recipes: 8 — before 19 (21 with the duplicate list's Open buttons)
- Food → Foods: 9 — before 19
- Add-food sheet: 8, and a food can be picked at once — before 11 on a step with no food
- Recipe page: 6 — before 10 · Food page: 4 — before 5

## Shared-file notes for the lead
- e2e outside my list touched (small): features.e2e.mjs (add-sheet flow, meal eaten via ⋮), stock.e2e.mjs (meal eaten via ⋮).
- New: src/sections/FoodMenu.tsx (portal for the Food page ⋮), src/ui/FoodDataCredits.tsx (for K3's About), ScanIcon in BarcodeScan.tsx (K5 may reuse).
