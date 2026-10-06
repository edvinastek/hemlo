# NOTES-F1 (version 22): REC-08, MOD-12 and the stale partial rows

Running log. Branch v22/f1 from main (0.22.0). Harness port 5531, local DB pg22f1 on 55481.

## Plan
1. REC-08 Add to shopping list: one path for recipes onto the list, built on the meal plan's own rules
   (planNeeds + plannedLines), merging with mergeAmounts, one Undo, "N items added to Shopping · Undo · Open".
2. MOD-12 audit of rating, percent, money, photo, link, checklist, timespan end to end.
3. GEN-33, TOD-24, TSK-01, FOOD-18, WID-12: read the code, decide, update the cells.

## Log
- Start: read the task, preamble, calm.md, rows, code.
