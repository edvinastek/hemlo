# NOTES-F1 (version 22): REC-08, MOD-12 and the stale partial rows

Running log. Branch v22/f1 from main (0.22.0). Harness port 5531, local DB pg22f1 on 55481.

## Plan
1. REC-08 Add to shopping list: one path for recipes onto the list, built on the meal plan's own rules
   (planNeeds + plannedLines), merging with mergeAmounts, one Undo, "N items added to Shopping · Undo · Open".
2. MOD-12 audit of rating, percent, money, photo, link, checklist, timespan end to end.
3. GEN-33, TOD-24, TSK-01, FOOD-18, WID-12: read the code, decide, update the cells.

## Log
- Start: read the task, preamble, calm.md, rows, code.
- REC-08 done (commit bc49891 and the next). Decisions:
  - One path from recipes to the list: `addRecipesToList` (shopping.ts) on `recipe-shop-rules.ts`, which treats each
    picked recipe as a planned meal of N servings and runs the meal plan's own `planNeeds` + `plannedLines` (packs,
    whole ones, g/kg, ml/l; cooked weights bought raw). The older `toBuy` (recipe-rules) and `addToShoppingList`
    (recipe-actions.ts) are gone; ShopList's "Add from recipes" and Stock's "Put the rest on the list" use the same path.
  - Merging (`fitOnList`): the same food in the same unit, or g/kg, ml/l, adds (mergeAmounts); another unit is a line of
    its own; ticked, removed, planned (plan_key) and other lists' rows are never added to.
  - "Asks servings only if needed": a recipe's page has said its portions already, so its ⋮ adds at once unless
    something is at home (then the choices replace the page, never a sheet on a sheet). The select bar always asks,
    as there is nowhere else to say servings: a small sheet, a quiet −/+ a recipe, each at its own servings.
  - Stock: "Leave out what is at home" (on by default) shows only when something is at home; a Stock minimum is not
    added by this action (the list itself already handles minimums).
  - Aisle/shop: a new line takes the aisle and shop of the last time the household bought that food; otherwise none,
    so the list works the aisle out from the food as for any item. A new line's note says "For Chicken curry".
  - One Undo for the batch; the bar says "12 items added to Shopping" with Undo and Open (Undo.tsx: `offerUndo` takes
    an optional second step; the bar wraps like an offer so both fit at 360 px).
  - Fixed on the way: MoreMenu opened upwards inside a short sheet and was clipped by it (a short recipe's ⋮ could not
    be tapped); it now goes up only when it fits under the sheet's top.
  - Harness scenarios 01–07 (shots22/f1/0*): menu, ask, added, direct, select sheet, added with Undo, Open → /shop.
- MOD-12 done. What the audit found and fixed (field-kinds.ts is the one place a kind's meaning lives):
  - Field editor: money had a free-text "Currency" (a sign); now an ISO currency list, defaulting to the profile's
    country (older "€"/"£" units read as EUR/GBP). Rating: 3, 5 or 10 stars (`max`). Percent: a range (`min`/`max`,
    0–100 by default, ±1000 at most). In Stats: stars and shares offer only Average/Count; a start-and-end can be
    added up or averaged as minutes. Presets' money takes the person's currency.
  - Form: stars to the field's scale (10 wrap to two rows of five, 44 px targets), labelled "3 of 10 stars"; percent
    input bounded by the range; money label shows the currency's sign.
  - Rows/cards/board: money via Intl ("€249.50"), stars to scale; cards and board cards read out stars as words.
    A link to a deleted record shows "Quick Fit (deleted)" (lookups now carry deleted records marked `gone`, never
    offered in the picker); an unknown id says "Deleted" — no crash, no bare id.
  - Table: money/percent columns carry the currency sign or %. Totals: per kind (money in its currency, averages for
    stars/shares, span as "5 h 15 min" — it was NaN before). Chart: stars/shares averaged per period (were summed),
    a span drawable as minutes.
  - Sort/filter: a span sorts by its length (Longest/Shortest first) and filters by minutes (was by its text).
  - Stats: percent and timespan were missing from the measures; rating/percent are always averaged; money's unit is
    its currency code. One field is one currency, so different currencies are never one sum (decision: changing a
    field's currency re-labels its amounts; there is no per-amount currency).
  - Files: links to built modules' records were exported as ids and could not be imported (keyed by 'record' for
    every module); now keyed by linkKey, names out, names or ids in, deleted ones "(deleted)" and never re-linked.
    Photo cells: a photo's own name is kept, anything else left empty (was an error). Messages say the scale/range.
  - Design files: links to other modules were dropped; now they carry the module's name and are re-linked to the
    importer's module of the same key or name, else kept as a text field. A link to the module's own other kind
    (MOD-15) is marked and follows the new key — createBuiltModule now remaps self-links (a latent bug for drafts).
  - Sync: no SQL needed; definitions and records with every kind round-trip through JSON unchanged (node check).
  - Photo: harness test (scratchpad harness-f1/photo.mjs, light and dark): camera input fed a picture, Storage stood
    in for by an in-memory bucket behind the same REST calls; made smaller to JPEG, kept on the device, uploaded,
    shown offline on the card and the record, fetched again when the copy is gone, record deleted with Undo, tidy
    leaves it while Undo can still bring it back, removes it from Storage and the device a day later. 20/20 ok.
    Local DB pg22f1: migrations 001–039 OK, security suite 325/325 ok (photo bucket rows 283–291).
  - store/phone-tests.md steps 30–35: the owner's camera check on the live project.
