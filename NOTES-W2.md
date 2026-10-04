# NOTES-W2 (version 18): food, units, recipes and body

Running log. Branch v18/w2, worktree /home/claude/wt18/w2. Migration 035, Dexie 17 (only if needed).

## Log
1. USDA units (UNIT-10/13/14) and staples (FOOD-10/11): scripts/units-usda.mjs generates migration
   035_food_units_usda.sql from USDA FoodData Central SR Legacy CSV (portions, nutrients) + SR28 ASCII
   FOOD_DES (refuse %). Raw files not committed (scratchpad/w2usda). Coverage of foods bought by the
   piece: 38 of 137 before, 101 of 137 after; shared NEVO foods with units 97 → 170, plus 21 kept foods
   and 3 new foods. Local DB: all migrations OK, 035 idempotent (second run touches 0 rows); security
   suite 247/247 (catalogue count check updated: Human milk hidden; 5 new 035 checks).
