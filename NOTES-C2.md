# C2 running log (recipes, foods, units, body targets)

Deleted by the lead at merge.

## Plan
1. NEVO generator (scripts/import-nevo.mjs + scripts/nevo-additions.mjs), migration 027 (schema + generated data), fixture + check.
2. Types, sync (food pulled by what changed; replaced foods repointed on the device), food data check (FOOD-19).
3. eu-label-rules, units-rules (sizes, as bought, volumes, plurals), FoodEditor, food sheet, Foods tab.
4. Recipes: view, editor (lines), search/sort, actions (task note, plan, shopping), ready meals, import/export.
5. Body: activity presets + picker, calc without fallbacks, settings panel, onboarding, recalculation.
6. security.sql, e2e files, README, screenshots, final checks.

## Done
All six steps (see git log). tsc, npm run check (incl. nevo, fooddata, eulabel, foodreplaced, recipe, recipeio,
activity), vite build, localdb with 001-027 and the security suite (152 rows, no FAIL) pass. 027 re-run rewrites
nothing.

## Decisions
- NEVO rows used unchanged; display name, units, cook yields are GetIt additions, marked on the food page.
- Old catalogue: 266 replaced by the NEVO food (repointed, hidden with replaced_by), 86 kept with British names
  (source usda, no NEVO match), 455 hidden (US retail cuts, game, duplicates). Late writes for an old food are
  redirected by triggers; phones repoint locally (food-replaced.ts).
- FOOD-16 extra label figures and own unit overlays live in the nutrition module_instance settings (label,
  unit_overlay); the five core figures stay in settings.nutrients. Widening Nutrient would break stats/FoodDay.
- Body plan numbers and activity answers live in the health module_instance settings (body).
- targetsFor returns null without sex, height and date of birth: no fallbacks anywhere.

## Left (for others / later)
- DATA-04: no client exercise table in the branch; BODY-16 "added" has nothing to add yet.
- FOOD-06 %RI on the day (FoodDay belongs to food logging).
- Portie weights only for ~22 foods (H3.3 incomplete: red onion, XL egg edible weight, more).
- NEVO has no chicken thigh.
