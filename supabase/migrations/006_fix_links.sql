-- GetIt 006: link the four ingredient lines whose alias named a food the
-- catalogue spells differently.
update recipe_line rl set food_id = f.id
from food f
where rl.food_id is null and f.owner_id is null and (
     (rl.raw_text = 'Beef steak (grilled, lean)' and f.name = 'Beef Sirloin Top')
  or (rl.raw_text = 'Cherry tomatoes'            and f.name = 'Tomato Red')
  or (rl.raw_text = 'Turkey breast (grilled)'    and f.name = 'Turkey Breast Meat+Skin')
);
select count(*) as still_unlinked from recipe_line where food_id is null;
