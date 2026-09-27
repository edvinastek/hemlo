-- Batch 1 of the phone feedback: a planner first, body tracking second.
--
-- profile.settings holds the choices that shape the app for one person: the
-- setup template, work hours and commute (both optional), which nutrients are
-- tracked and which one Today shows, and default meal times (none unless set).
-- It is one JSON value so a new choice needs no migration; the app reads it
-- with defaults for every key, so an empty object is a valid setting.
alter table public.profile
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- A country is a two-letter ISO code; free text would make the shopping and
-- holiday lookups guess.
alter table public.profile drop constraint if exists profile_country_check;
alter table public.profile add constraint profile_country_check
  check (country is null or country ~ '^[A-Z]{2}$');
alter table public.profile drop constraint if exists profile_city_check;
alter table public.profile add constraint profile_city_check
  check (city is null or length(city) <= 80);

-- A meal can have its own time on a day (none by default), and can be planned
-- as plain numbers instead of a recipe: "a sandwich, about 450 kcal".
alter table public.meal_plan_slot
  add column if not exists slot_time time,
  add column if not exists label text,
  add column if not exists kcal numeric,
  add column if not exists protein_g numeric,
  add column if not exists carbs_g numeric,
  add column if not exists fat_g numeric,
  add column if not exists fiber_g numeric,
  add column if not exists grams numeric;

-- The same for what was eaten: a quick entry carries its own numbers.
alter table public.food_log
  add column if not exists label text,
  add column if not exists kcal numeric,
  add column if not exists protein_g numeric,
  add column if not exists carbs_g numeric,
  add column if not exists fat_g numeric,
  add column if not exists fiber_g numeric;

alter table public.meal_plan_slot drop constraint if exists meal_plan_slot_numbers_check;
alter table public.meal_plan_slot add constraint meal_plan_slot_numbers_check check (
  (kcal is null or kcal between 0 and 20000) and (grams is null or grams between 0 and 20000)
  and (protein_g is null or protein_g between 0 and 2000) and (carbs_g is null or carbs_g between 0 and 2000)
  and (fat_g is null or fat_g between 0 and 2000) and (fiber_g is null or fiber_g between 0 and 2000)
  and (label is null or length(label) <= 120));
alter table public.food_log drop constraint if exists food_log_numbers_check;
alter table public.food_log add constraint food_log_numbers_check check (
  (kcal is null or kcal between 0 and 20000)
  and (protein_g is null or protein_g between 0 and 2000) and (carbs_g is null or carbs_g between 0 and 2000)
  and (fat_g is null or fat_g between 0 and 2000) and (fiber_g is null or fiber_g between 0 and 2000)
  and (label is null or length(label) <= 120));

-- Stock is edited by hand now, from every device in the household, so it gets
-- what the other synced tables have: a deletion that syncs, a note, and an
-- updated_at the server sets.
alter table public.stock
  add column if not exists note text,
  add column if not exists deleted_at timestamptz;
alter table public.stock alter column updated_at set default now();
update public.stock set updated_at = now() where updated_at is null;
alter table public.stock alter column updated_at set not null;
alter table public.stock drop constraint if exists stock_grams_check;
alter table public.stock add constraint stock_grams_check
  check (grams_on_hand >= 0 and grams_on_hand <= 1000000 and (note is null or length(note) <= 200));
drop trigger if exists stock_touch on public.stock;
create trigger stock_touch before update on public.stock
  for each row execute function public.touch_updated_at();
create index if not exists stock_updated_idx on public.stock (updated_at);
