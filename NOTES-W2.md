# NOTES-W2 (version 18): food, units, recipes and body

Running log. Branch v18/w2, worktree /home/claude/wt18/w2. Migration 035, Dexie 17 (only if needed).

## Log
1. USDA units (UNIT-10/13/14) and staples (FOOD-10/11): scripts/units-usda.mjs generates migration
   035_food_units_usda.sql from USDA FoodData Central SR Legacy CSV (portions, nutrients) + SR28 ASCII
   FOOD_DES (refuse %). Raw files not committed (scratchpad/w2usda). Coverage of foods bought by the
   piece: 38 of 137 before, 101 of 137 after; shared NEVO foods with units 97 → 170, plus 21 kept foods
   and 3 new foods. Local DB: all migrations OK, 035 idempotent (second run touches 0 rows); security
   suite 247/247 (catalogue count check updated: Human milk hidden; 5 new 035 checks).
2. FOOD-06: src/lib/day-ri-rules.ts (+ dayri check): %RI line under the Food day's totals, toggled from the Day ⋮
   ("Show/Hide % of reference intake", the same setting as the food page).
3. REC-07: src/lib/recipe-fetch-rules.ts (+ recipefetch check) and recipe-fetch.ts: CapacitorHttp in the app, fetch on
   the web with a message pointing to pasting; addresses on the own network refused; RecipeImport keeps the page apart
   from pasted text ("Read from site · Paste instead"); Back closes it.
4. BODY-16: activity.ts trainingKcal/dayBudget/isCardio (+ activity check), body.ts trainingOn: with "logged
   separately and added", each logged set counts 2 min (or its own time) at MET 3.5 (cardio 7, Compendium 2011),
   less 1 MET, × weight on or before the day. Added to the Food day's kcal budget with one line, and to Today's kcal
   figure (Today.tsx, 3 lines).
5. DATA-04: match-food planImport plans exercises (own, muscle guessed, names deduped against catalogue and own);
   import.ts writes them with the queue; More.tsx preview/summary lines updated.
6. GEN-55: W1's CopySheet meals commit (8b483d0) cherry-picked; FoodDay's CopyDays removed, day and meal copy use
   CopySheet.
7. GEN-54: books-rules putBack/bookBack (+ books check); BookTable offers Undo for bulk delete (rows back, and back in
   their books), take out of book, and book delete. Select mode and the book sheets close on Back.
8. CALM-10/08: useBackClose in AddFoodSheet, FoodUnits, FoodEditor, RecipeEditor (+ its scan), RecipeView, MyRecipes,
   ProductSearch (both), FoodTabs sheets, BookTable sheets, BookBar sheet, RecipeImport. FoodUnits' unit plural under
   More options. e2e updated (units, food-units, books).
9. Screens: harness at scratchpad/harness-w2 (port 5402), shots in scratchpad/shots18/w2.
