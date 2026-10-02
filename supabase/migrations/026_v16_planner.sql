-- 026: version 16.
--
--  1. Habits get any schedule (the same rule shapes a repeating task has), a
--     time, a pinned note and an optional count to reach; a day's tick can
--     carry an amount and which items of the pinned checklist were ticked.
--  2. Foods get the fields the EU label (Regulation 1169/2011) declares, and
--     the shared catalogue's carbohydrate is put on the EU footing: the old
--     figures were US "by difference" values, which include fibre.
--  3. A shopping list people write into, shared by the household: manual
--     items, and the ticks on items the meal plan puts there.
--  4. Household chores as rows of their own, shared by the household, with a
--     schedule and a log of who did what when.
--  5. A task can belong to a project (a Projects record).
--  6. A planned meal can be a single food, and meals keep an order.
--  7. A new account starts with only the core switched on; the starting
--     layout picked at setup switches the rest on.
--
-- Safe to run more than once.

-- 1: habits ------------------------------------------------------------------
alter table public.habit
  add column if not exists rule text,
  add column if not exists rule_config jsonb not null default '{}'::jsonb,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists time_of_day time,
  add column if not exists note text,
  add column if not exists target numeric(10,2),
  add column if not exists unit text;

do $$ begin
  alter table public.habit add constraint habit_rule_check
    check (rule is null or rule in ('daily','weekdays','weekends','weekly','every_n_weeks','monthly','monthly_nth','yearly','dates','times_per_week'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.habit add constraint habit_rule_config_check
    check (jsonb_typeof(rule_config) = 'object' and pg_column_size(rule_config) <= 16384);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.habit add constraint habit_note_check check (note is null or length(note) <= 4000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.habit add constraint habit_target_check check (target is null or (target > 0 and target <= 100000));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.habit add constraint habit_unit_check check (unit is null or length(unit) between 1 and 16);
exception when duplicate_object then null; end $$;

alter table public.habit_log
  add column if not exists amount numeric(10,2),
  add column if not exists checks jsonb not null default '[]'::jsonb;
do $$ begin
  alter table public.habit_log add constraint habit_log_amount_check check (amount is null or (amount >= 0 and amount <= 100000));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.habit_log add constraint habit_log_checks_check
    check (jsonb_typeof(checks) = 'array' and jsonb_array_length(checks) <= 200);
exception when duplicate_object then null; end $$;

-- 2: foods on the EU label --------------------------------------------------
alter table public.food
  add column if not exists kj numeric(8,2),
  add column if not exists sat_fat_g numeric(7,2),
  add column if not exists mufa_g numeric(7,2),
  add column if not exists pufa_g numeric(7,2),
  add column if not exists sugars_g numeric(7,2),
  add column if not exists polyols_g numeric(7,2),
  add column if not exists starch_g numeric(7,2),
  add column if not exists salt_g numeric(7,3),
  add column if not exists alcohol_g numeric(7,2),
  add column if not exists per_ml boolean not null default false,
  -- 'eu' when carbohydrate leaves fibre out, as on an EU label; 'us' when it
  -- is the US figure that includes it. Older rows are marked below.
  add column if not exists carb_basis text not null default 'eu';
do $$ begin
  alter table public.food add constraint food_eu_fields_check check (
    (kj is null or kj between 0 and 4000) and
    (sat_fat_g is null or sat_fat_g between 0 and 100) and
    (mufa_g is null or mufa_g between 0 and 100) and
    (pufa_g is null or pufa_g between 0 and 100) and
    (sugars_g is null or sugars_g between 0 and 100) and
    (polyols_g is null or polyols_g between 0 and 100) and
    (starch_g is null or starch_g between 0 and 100) and
    (salt_g is null or salt_g between 0 and 100) and
    (alcohol_g is null or alcohol_g between 0 and 100));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.food add constraint food_carb_basis_check check (carb_basis in ('eu','us'));
exception when duplicate_object then null; end $$;

-- The shared catalogue came from a US list. Its carbohydrate includes fibre;
-- the EU definition does not. Each food's stated energy agrees with its
-- macros far better on the EU footing (18 foods off by more than 15% against
-- 87 the US way), which confirms the reading. Done once, marked by
-- carb_basis, so running this again changes nothing.
update public.food
   set carb_basis = 'us'
 where owner_id is null and coalesce(source, 'catalogue') = 'catalogue' and carb_basis = 'eu'
   and not exists (select 1 from private.settings where key = 'food_eu_basis_done');
update public.food
   set carbs_g = greatest(0, carbs_g - coalesce(fiber_g, 0)), carb_basis = 'eu'
 where owner_id is null and carb_basis = 'us' and carbs_g is not null;
-- Foods people imported from their own workbook came from the same list.
update public.food
   set carb_basis = 'us'
 where owner_id is not null and source = 'import'
   and not exists (select 1 from private.settings where key = 'food_eu_basis_done');
update public.food
   set carbs_g = greatest(0, carbs_g - coalesce(fiber_g, 0)), carb_basis = 'eu'
 where owner_id is not null and source = 'import' and carb_basis = 'us' and carbs_g is not null;
insert into private.settings (key, value) values ('food_eu_basis_done', 'yes') on conflict (key) do nothing;

-- Three catalogue foods had a broken fat value. Fat in an oil or a rendered
-- fat is all of it; quinoa (dry) is about 6 g in 100 g.
update public.food set fat_g = 100 where owner_id is null and name = 'Grapeseed Oil' and coalesce(fat_g, 0) = 0;
update public.food set fat_g = 99.8 where owner_id is null and name = 'Chicken Fat' and fat_g is null;
update public.food set fat_g = 6.07 where owner_id is null and name = 'Quinoa' and fat_g is null;
-- Fibre recorded as 0 on these plant foods means "not measured", not none.
update public.food set fiber_g = null
 where owner_id is null and fiber_g = 0 and name in (
  'Acorn','Acorn Dried','Amaranth Leaves','Apple Crab','Apple Rose','Arrowhead','Beechnut Dried',
  'Bitter Gourd Leafy Tips','Chestnut Chinese','Chestnut Chinese Dried','Chestnut European (without peel)',
  'Chestnut European Dried (without peel)','Chestnut Japanese','Chestnut Japanese Dried','Cowpea Leafy Tips',
  'Currant Black','Jujube','Lemon Grass','Lotus Seed','Lotus Seed Dried','Oheloberry','Physalis','Pilinut',
  'Pineapple','Pitanga','Plum Java','Roselle','Safflower Seed Kernel','Snake Gourd','Spinach Vine','Spiny Gourd',
  'Squash Indian','Squash Winter Pumpkin Flowers','Squash Winter Pumpkin Leaves','Taro Shoots','Taro Tahitian',
  'Yardlong Beans');

-- 3: the shopping list -------------------------------------------------------
create table if not exists public.shopping_entry (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  -- Set on a tick for an item the meal plan put on the list: which item it
  -- was (the food id, or 'name:<name>'), so the tick follows the item.
  plan_key text,
  food_id uuid references public.food(id) on delete set null,
  name text,
  qty numeric(10,2),
  unit text,
  grams numeric(10,2),
  note text,
  aisle text,
  shop text,
  checked boolean not null default false,
  checked_at timestamptz,
  sort_order int not null default 0,
  added_by uuid references public.profile(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint shopping_entry_what check (plan_key is not null or food_id is not null or (name is not null and length(btrim(name)) > 0)),
  constraint shopping_entry_lengths check (
    (name is null or length(name) <= 120) and (note is null or length(note) <= 200) and
    (unit is null or length(unit) <= 24) and (aisle is null or length(aisle) <= 40) and
    (shop is null or length(shop) <= 60) and (plan_key is null or length(plan_key) <= 140)),
  constraint shopping_entry_amounts check (
    (qty is null or (qty > 0 and qty <= 100000)) and (grams is null or (grams >= 0 and grams <= 1000000)))
);
create unique index if not exists shopping_entry_plan_key_idx
  on public.shopping_entry (household_id, plan_key) where plan_key is not null and deleted_at is null;
create index if not exists shopping_entry_household_idx on public.shopping_entry (household_id, updated_at);

-- 4: household chores ----------------------------------------------------------
-- A household member's name as the household sees it, set by that member.
alter table public.household_member add column if not exists display_name text;
do $$ begin
  alter table public.household_member add constraint household_member_display_name_check
    check (display_name is null or length(display_name) between 1 and 40);
exception when duplicate_object then null; end $$;

create or replace function public.set_my_member_name(h uuid, name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.household_member
     set display_name = nullif(btrim(name), '')
   where household_id = h and user_id = (select auth.uid());
end $$;
revoke all on function public.set_my_member_name(uuid, text) from public, anon;
grant execute on function public.set_my_member_name(uuid, text) to authenticated;

create table if not exists public.chore (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  room text check (room is null or length(room) <= 40),
  -- 'fixed': on the days its rule gives; 'after': every_days after it was
  -- last done; 'flexible': about every every_days, never "failed".
  mode text not null default 'fixed' check (mode in ('fixed','after','flexible')),
  rule text check (rule is null or rule in ('daily','weekdays','weekends','weekly','every_n_weeks','monthly','monthly_nth','yearly','dates','times_per_week')),
  rule_config jsonb not null default '{}'::jsonb check (jsonb_typeof(rule_config) = 'object' and pg_column_size(rule_config) <= 16384),
  every_days int check (every_days is null or every_days between 1 and 730),
  start_date date,
  end_date date,
  time_of_day time,
  minutes int check (minutes is null or minutes between 0 and 1440),
  -- Household members (auth user ids) it goes to, in rotation order.
  assignees uuid[] not null default '{}' check (cardinality(assignees) <= 12),
  rotation text not null default 'none' check (rotation in ('none','each_time','each_week','least_recent')),
  note text check (note is null or length(note) <= 4000),
  paused boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chore_household_idx on public.chore (household_id, updated_at);

create table if not exists public.chore_log (
  id uuid primary key default gen_random_uuid(),
  chore_id uuid not null references public.chore(id) on delete cascade,
  done_on date not null,
  done_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (chore_id, done_on)
);
create index if not exists chore_log_updated_idx on public.chore_log (updated_at);

alter table public.shopping_entry enable row level security;
alter table public.chore enable row level security;
alter table public.chore_log enable row level security;

drop policy if exists shopping_entry_household on public.shopping_entry;
create policy shopping_entry_household on public.shopping_entry for all to authenticated
  using (household_id in (select private.my_households()))
  with check (household_id in (select private.my_households()));
drop policy if exists chore_household on public.chore;
create policy chore_household on public.chore for all to authenticated
  using (household_id in (select private.my_households()))
  with check (household_id in (select private.my_households()));
drop policy if exists chore_log_household on public.chore_log;
create policy chore_log_household on public.chore_log for all to authenticated
  using (chore_id in (select c.id from public.chore c where c.household_id in (select private.my_households())))
  with check (chore_id in (select c.id from public.chore c where c.household_id in (select private.my_households())));

revoke all on public.shopping_entry, public.chore, public.chore_log from anon;
grant select, insert, update, delete on public.shopping_entry, public.chore, public.chore_log to authenticated;

drop trigger if exists shopping_entry_touch on public.shopping_entry;
create trigger shopping_entry_touch before update on public.shopping_entry for each row execute function public.touch_updated_at();
drop trigger if exists chore_touch on public.chore;
create trigger chore_touch before update on public.chore for each row execute function public.touch_updated_at();
drop trigger if exists chore_log_touch on public.chore_log;
create trigger chore_log_touch before update on public.chore_log for each row execute function public.touch_updated_at();

-- 5: tasks in projects -----------------------------------------------------------
alter table public.task add column if not exists project_id uuid references public.module_record(id) on delete set null;
create index if not exists task_project_idx on public.task (project_id) where project_id is not null;

-- 6: meals made of a single food, in an order --------------------------------------
alter table public.meal_plan_slot
  add column if not exists food_id uuid references public.food(id) on delete set null,
  add column if not exists sort_order int not null default 0;

-- 7: a new account starts with only the core on ------------------------------------
-- Before, nine modules were switched on here and onboarding switched the ones
-- not picked off again; if onboarding never reached the server, modules the
-- person never chose stayed on. Now setup switches on what was picked.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare h uuid; p uuid;
begin
  insert into public.household (name, owner_id) values ('Home', new.id) returning id into h;
  insert into public.household_member (household_id, user_id, role) values (h, new.id, 'owner');
  insert into public.profile (household_id, user_id, name, is_default, timezone)
  values (h, new.id, coalesce(nullif(split_part(new.email, '@', 1), ''), 'Me'), true, 'Europe/Amsterdam')
  returning id into p;
  insert into public.channel_setting (profile_id) values (p);
  insert into public.module_instance (profile_id, module_key, enabled, sort_order)
  select p, m.key, m.key = 'core', row_number() over (order by m.key)
  from public.module m where m.builtin;
  insert into public.note_section (profile_id, name, sort_order) values (p, 'Notes', 0);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
