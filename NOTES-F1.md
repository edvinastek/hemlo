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
