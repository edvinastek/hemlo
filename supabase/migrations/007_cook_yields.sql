-- GetIt 007: cook yields + live recipe macro views.
-- cook_yield = cooked weight / raw weight. A line recorded as a cooked weight
-- is converted back to raw before macros are applied, because the catalogue
-- stores raw per-100g values.
update food set cook_yield = v.y from (values
  ('Brown Rice',            3.00),  -- dry rice roughly triples
  ('White Rice',            2.90),
  ('Quinoa',                2.80),
  ('Oat',                   2.50),
  ('Chickpeas',             2.40),  -- dry to cooked
  ('Lentils',               2.40),
  ('Whole-wheat pasta (cooked)', 1.00), -- already a cooked-basis entry
  ('Fish Cod Atlantic',     0.75),  -- lean fish loses about a quarter
  ('Fish Salmon Atlantic Farmed', 0.78),
  ('Fish Tuna Skipjack',    0.75),
  ('Chicken Broiler/Fryer Breast Meat', 0.75),
  ('Turkey Breast Meat+Skin', 0.75),
  ('Beef Sirloin Top',      0.73),
  ('Tofu Firm',             0.95),
  ('Broccoli',              0.90),  -- steamed vegetables lose a little water
  ('Cauliflower',           0.90),
  ('Squash Winter Zucchini (with skin)', 0.80),
  ('Egg Chicken',           1.00),
  ('Shrimp',                0.75)
) as v(n,y) where food.name = v.n and food.owner_id is null;

-- Raw grams behind a line: cooked weights divided by the yield.
create or replace view recipe_line_resolved as
select rl.*,
       case when rl.state = 'cooked' and coalesce(f.cook_yield,0) > 0
            then rl.grams_per_portion / f.cook_yield
            else rl.grams_per_portion end as raw_grams,
       f.name as food_name, f.kcal, f.carbs_g, f.fiber_g, f.fat_g, f.protein_g
from recipe_line rl left join food f on f.id = rl.food_id;

-- Live per-portion macros. The spec's rule: calculated, never stored.
create or replace view recipe_macros as
select r.id as recipe_id, r.name,
       round(sum(rlr.kcal      * rlr.raw_grams / 100)::numeric, 0) as kcal,
       round(sum(rlr.carbs_g   * rlr.raw_grams / 100)::numeric, 1) as carbs_g,
       round(sum(rlr.fiber_g   * rlr.raw_grams / 100)::numeric, 1) as fiber_g,
       round(sum(rlr.fat_g     * rlr.raw_grams / 100)::numeric, 1) as fat_g,
       round(sum(rlr.protein_g * rlr.raw_grams / 100)::numeric, 1) as protein_g,
       r.kcal as sheet_kcal, r.protein_g as sheet_protein
from recipe r left join recipe_line_resolved rlr on rlr.recipe_id = r.id
group by r.id, r.name, r.kcal, r.protein_g;
