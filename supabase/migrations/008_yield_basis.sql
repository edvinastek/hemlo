-- GetIt 008: correct the yield basis.
-- D_Food is not uniformly raw. Grains and legumes in it are stored on a COOKED
-- basis (Brown Rice 110 kcal/100g, not the ~370 of dry rice), so expanding them
-- by a dry-to-cooked factor was wrong. Meat, fish and vegetables are raw-basis
-- and do need converting. The test is the food's own energy density.
update food set cook_yield = 1.00
where owner_id is null and cook_yield is not null and cook_yield > 1 and kcal < 200;

-- Anything already on a cooked basis is labelled as such, so the app never
-- converts it twice.
update food set state = 'cooked'
where owner_id is null and cook_yield = 1.00 and name in
  ('Brown Rice','White Rice','Quinoa','Oat','Chickpeas','Lentils','Whole-wheat pasta (cooked)');
