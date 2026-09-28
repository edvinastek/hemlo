-- GetIt 022: food counted in units ("2 eggs", "1 slice", "1 tbsp"), not only grams.
--
-- Grams stay the one truth. Every sum (calories, macros, stock, the shopping
-- list) keeps working in grams; a unit is only how an amount is typed and
-- shown.
--
--  * food.units: how the food is counted besides grams, as a short list:
--    [{"name": "egg", "plural": "eggs", "g": 50}]. At most 8, a name of 1 to
--    24 characters (never a weight such as "g" or "kg"), each name once, and
--    a weight of 0.1 to 5000 g. A millilitre of a drink counts as a gram.
--    Your own foods' units are yours to change; the shared catalogue's are
--    set here and read-only, like the rest of the catalogue (012's policies
--    already cover the column: nobody writes another person's food).
--  * unit and unit_qty on recipe_line, food_log and meal_plan_slot: the unit
--    an entry was typed in and how many. Both set or both empty; empty means
--    grams. The app works the grams out in the same edit (how many × the
--    unit's weight) and saves them in the grams column beside them, so every
--    existing sum keeps working unchanged.
--  * unit and unit_qty on stock: only how to show the amount ("12 eggs").
--    grams_on_hand stays the amount.
--
-- No silent changes: if a food's unit is later given another weight, entries
-- already saved keep their grams. "2 eggs (100 g)" stays 100 g; only new
-- entries use the new weight.
--
-- Order: apply this before shipping the build that has units. The build
-- works against a database without it (every plain-gram entry is sent as
-- before, without the new columns), but an entry typed in a unit, a food
-- given units and a product whose pack states a serving carry the new
-- columns; PostgREST refuses those (PGRST204) and the sync keeps them on the
-- device, waiting, until this is applied.

-- A food's units -----------------------------------------------------------------
-- A plain function so the rule reads as a sentence and the constraint stays short.
-- Immutable: it looks at nothing but the value it is given.
create or replace function private.food_units_ok(u jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when u is null or jsonb_typeof(u) <> 'array' then false
    when jsonb_array_length(u) > 8 then false
    else not exists (
      select 1 from jsonb_array_elements(u) as e(v)
      where case
        when jsonb_typeof(e.v) <> 'object' then true
        -- Only these three keys.
        when exists (select 1 from jsonb_object_keys(e.v) as k(key) where k.key not in ('name', 'plural', 'g')) then true
        when jsonb_typeof(e.v -> 'name') is distinct from 'string' then true
        when length(btrim(e.v ->> 'name')) not between 1 and 24 then true
        when lower(btrim(e.v ->> 'name')) in ('g', 'gr', 'gram', 'grams', 'kg', 'kilo', 'kilos', 'kilogram', 'kilograms') then true
        when e.v ? 'plural' and jsonb_typeof(e.v -> 'plural') not in ('string', 'null') then true
        when jsonb_typeof(e.v -> 'plural') = 'string' and length(btrim(e.v ->> 'plural')) not between 1 and 24 then true
        when jsonb_typeof(e.v -> 'g') is distinct from 'number' then true
        when (e.v ->> 'g')::numeric not between 0.1 and 5000 then true
        else false
      end)
      -- Each name once, whatever the capitals.
      and (select count(distinct lower(btrim(e.v ->> 'name'))) from jsonb_array_elements(u) as e(v)) = jsonb_array_length(u)
  end
$$;
-- The constraint runs as whoever writes the row, so signed-in people may call it.
revoke all on function private.food_units_ok(jsonb) from public, anon;
grant execute on function private.food_units_ok(jsonb) to authenticated, service_role;

alter table public.food add column if not exists units jsonb not null default '[]'::jsonb;
alter table public.food drop constraint if exists food_units_check;
alter table public.food add constraint food_units_check check (private.food_units_ok(units));

-- The unit an entry was typed in ----------------------------------------------------
alter table public.recipe_line
  add column if not exists unit text,
  add column if not exists unit_qty numeric;
alter table public.food_log
  add column if not exists unit text,
  add column if not exists unit_qty numeric;
alter table public.meal_plan_slot
  add column if not exists unit text,
  add column if not exists unit_qty numeric;
alter table public.stock
  add column if not exists unit text,
  add column if not exists unit_qty numeric;

-- Both or neither; a name of 1 to 24 characters; up to 100 000 of it. An entry
-- has more than none of it; stock can be out (0 eggs).
alter table public.recipe_line drop constraint if exists recipe_line_unit_check;
alter table public.recipe_line add constraint recipe_line_unit_check check (
  (unit is null) = (unit_qty is null)
  and (unit is null or length(btrim(unit)) between 1 and 24)
  and (unit_qty is null or (unit_qty > 0 and unit_qty <= 100000)));
alter table public.food_log drop constraint if exists food_log_unit_check;
alter table public.food_log add constraint food_log_unit_check check (
  (unit is null) = (unit_qty is null)
  and (unit is null or length(btrim(unit)) between 1 and 24)
  and (unit_qty is null or (unit_qty > 0 and unit_qty <= 100000)));
alter table public.meal_plan_slot drop constraint if exists meal_plan_slot_unit_check;
alter table public.meal_plan_slot add constraint meal_plan_slot_unit_check check (
  (unit is null) = (unit_qty is null)
  and (unit is null or length(btrim(unit)) between 1 and 24)
  and (unit_qty is null or (unit_qty > 0 and unit_qty <= 100000)));
alter table public.stock drop constraint if exists stock_unit_check;
alter table public.stock add constraint stock_unit_check check (
  (unit is null) = (unit_qty is null)
  and (unit is null or length(btrim(unit)) between 1 and 24)
  and (unit_qty is null or (unit_qty >= 0 and unit_qty <= 100000)));

-- Units for the shared catalogue ---------------------------------------------------
-- Only where counting is how people think of the food, and only foods that
-- have none yet, so running this again changes nothing. Weights are the
-- edible part, as the catalogue's figures are: an egg without its shell, a
-- banana without its peel. Names are the catalogue's own (005).
with defaults (food, units) as (values
  ('Egg Chicken',        '[{"name":"egg","plural":"eggs","g":50}]'),
  ('Egg Duck',           '[{"name":"egg","plural":"eggs","g":70}]'),
  ('Egg Goose',          '[{"name":"egg","plural":"eggs","g":144}]'),
  ('Egg Quail',          '[{"name":"egg","plural":"eggs","g":9}]'),
  ('Egg Turkey',         '[{"name":"egg","plural":"eggs","g":79}]'),
  ('White Bread',        '[{"name":"slice","plural":"slices","g":35}]'),
  ('Whole Wheat Bread',  '[{"name":"slice","plural":"slices","g":35}]'),
  ('Whole-wheat bread',  '[{"name":"slice","plural":"slices","g":35}]'),
  ('Sour Dough Bread',   '[{"name":"slice","plural":"slices","g":35}]'),
  ('Whole-wheat pita',   '[{"name":"pita","plural":"pitas","g":60}]'),
  ('Banana',             '[{"name":"banana","plural":"bananas","g":120}]'),
  ('Apple',              '[{"name":"apple","plural":"apples","g":180}]'),
  ('Apple Granny Smith', '[{"name":"apple","plural":"apples","g":180}]'),
  ('Pear',               '[{"name":"pear","plural":"pears","g":170}]'),
  ('Orange',             '[{"name":"orange","plural":"oranges","g":130}]'),
  ('Orange Navel',       '[{"name":"orange","plural":"oranges","g":130}]'),
  ('Clementine',         '[{"name":"clementine","plural":"clementines","g":75}]'),
  ('Orange Tangerine',   '[{"name":"tangerine","plural":"tangerines","g":75}]'),
  ('Kiwifruit',          '[{"name":"kiwi","plural":"kiwis","g":70}]'),
  ('Peach Yellow',       '[{"name":"peach","plural":"peaches","g":150}]'),
  ('Peach Nectarine',    '[{"name":"nectarine","plural":"nectarines","g":140}]'),
  ('Plum',               '[{"name":"plum","plural":"plums","g":65}]'),
  ('Apricot',            '[{"name":"apricot","plural":"apricots","g":35}]'),
  ('Avocado',            '[{"name":"avocado","plural":"avocados","g":150}]'),
  ('Dates Medjool',      '[{"name":"date","plural":"dates","g":24}]'),
  ('Dates Deglet Noor',  '[{"name":"date","plural":"dates","g":7}]'),
  ('Garlic',             '[{"name":"clove","plural":"cloves","g":5}]'),
  ('Onion',              '[{"name":"onion","plural":"onions","g":110}]'),
  ('Tomato Red',         '[{"name":"tomato","plural":"tomatoes","g":120}]'),
  ('Carrot',             '[{"name":"carrot","plural":"carrots","g":60}]'),
  ('Potato',             '[{"name":"potato","plural":"potatoes","g":170}]'),
  ('Bell Peppers',       '[{"name":"pepper","plural":"peppers","g":150}]'),
  ('Capsicum Red',       '[{"name":"pepper","plural":"peppers","g":150}]'),
  ('Capsicum Green',     '[{"name":"pepper","plural":"peppers","g":150}]'),
  ('Capsicum Yellow',    '[{"name":"pepper","plural":"peppers","g":150}]'),
  ('Olive Black',        '[{"name":"olive","plural":"olives","g":4}]'),
  ('Olive Green',        '[{"name":"olive","plural":"olives","g":4}]'),
  ('Butter',             '[{"name":"tbsp","g":14},{"name":"tsp","g":5}]'),
  ('Butter Peanut Smooth', '[{"name":"tbsp","g":16},{"name":"tsp","g":5}]'),
  ('Butter Almond',      '[{"name":"tbsp","g":16}]'),
  ('Butter Cashew',      '[{"name":"tbsp","g":16}]'),
  ('Butter Sesame Tahini', '[{"name":"tbsp","g":15}]'),
  ('Hummus',             '[{"name":"tbsp","g":15}]'),
  ('Sugar',              '[{"name":"tsp","g":4},{"name":"tbsp","g":12.5}]'),
  ('Lemon Juice',        '[{"name":"tbsp","g":15},{"name":"tsp","g":5}]'),
  ('Lime Juice',         '[{"name":"tbsp","g":15},{"name":"tsp","g":5}]'),
  ('Chia Seed',          '[{"name":"tbsp","g":12}]'),
  ('Flaxseed',           '[{"name":"tbsp","g":10}]'),
  ('Whey protein powder', '[{"name":"scoop","plural":"scoops","g":30}]'),
  ('Mixed nuts',         '[{"name":"handful","plural":"handfuls","g":30}]'),
  ('Milk Cow',           '[{"name":"glass","plural":"glasses","g":250},{"name":"cup","plural":"cups","g":240}]'),
  ('Milk Cow Lactose Free', '[{"name":"glass","plural":"glasses","g":250},{"name":"cup","plural":"cups","g":240}]'),
  ('Milk Almond',        '[{"name":"glass","plural":"glasses","g":250},{"name":"cup","plural":"cups","g":240}]'),
  ('Milk Soy',           '[{"name":"glass","plural":"glasses","g":250},{"name":"cup","plural":"cups","g":240}]'),
  ('Milk Goat',          '[{"name":"glass","plural":"glasses","g":250},{"name":"cup","plural":"cups","g":240}]'),
  ('Milk Rice',          '[{"name":"glass","plural":"glasses","g":250},{"name":"cup","plural":"cups","g":240}]'),
  ('Buttermilk',         '[{"name":"glass","plural":"glasses","g":250},{"name":"cup","plural":"cups","g":240}]'),
  ('Kefir',              '[{"name":"glass","plural":"glasses","g":250},{"name":"cup","plural":"cups","g":240}]'),
  ('Cheese Gouda',       '[{"name":"slice","plural":"slices","g":20}]'),
  ('Cheese Edam',        '[{"name":"slice","plural":"slices","g":20}]'),
  ('Cheese Cheddar',     '[{"name":"slice","plural":"slices","g":20}]'),
  ('Cheese Swiss',       '[{"name":"slice","plural":"slices","g":20}]')
)
update public.food f set units = d.units::jsonb
from defaults d
where f.owner_id is null and f.name = d.food and f.units = '[]'::jsonb;

-- Every catalogue oil: a tablespoon and a teaspoon.
update public.food
set units = '[{"name":"tbsp","g":13.5},{"name":"tsp","g":4.5}]'::jsonb
where owner_id is null and units = '[]'::jsonb and name ~ ' Oil( |$)' and name !~ '^Fish Oil';

-- The shared recipes' boiled eggs, written as 50 g each, are counted as eggs,
-- so the recipe reads "1 egg" rather than "50 g". Their grams stay as they are.
update public.recipe_line l
set unit = 'egg', unit_qty = round(l.grams_per_portion / 50, 3)
from public.recipe r, public.food f
where r.id = l.recipe_id and r.owner_id is null
  and f.id = l.food_id and f.owner_id is null and f.name = 'Egg Chicken'
  and l.unit is null and l.grams_per_portion > 0
  and mod(l.grams_per_portion, 25) = 0;
