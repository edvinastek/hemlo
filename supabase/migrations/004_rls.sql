-- GetIt 004: row-level security. Nothing is readable across accounts.
do $$
declare t text;
begin
  -- Tables scoped directly by profile_id
  foreach t in array array[
    'profile','goal','phase','series','away_period','task','calendar_event',
    'note_section','review','reminder','channel_setting','meal_plan_slot','food_log',
    'workout_log','body_log','target','habit','supplement','sleep_log',
    'module_instance','module_record'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_own on %I', t, t);
    if t = 'profile' then
      execute format($f$create policy %I_own on %I for all
        using (household_id in (select app_households()))
        with check (household_id in (select app_households()))$f$, t, t);
    else
      execute format($f$create policy %I_own on %I for all
        using (profile_id in (select app_profiles()))
        with check (profile_id in (select app_profiles()))$f$, t, t);
    end if;
  end loop;

  -- Tables scoped by household_id
  foreach t in array array['stock','shopping_trip'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_own on %I', t, t);
    execute format($f$create policy %I_own on %I for all
      using (household_id in (select app_households()))
      with check (household_id in (select app_households()))$f$, t, t);
  end loop;

  -- Catalogue tables: shared rows (owner_id null) are readable by everyone,
  -- writable by no one; a user's own rows are fully theirs.
  foreach t in array array['food','recipe','exercise','store','workout','template'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    if t = 'template' then
      execute format($f$create policy %I_read on %I for select
        using (owner_id = auth.uid() or shared)$f$, t, t);
    else
      execute format($f$create policy %I_read on %I for select
        using (owner_id is null or owner_id = auth.uid())$f$, t, t);
    end if;
    execute format($f$create policy %I_write on %I for all
      using (owner_id = auth.uid()) with check (owner_id = auth.uid())$f$, t, t);
  end loop;
end $$;

-- Household and membership
alter table household enable row level security;
drop policy if exists household_own on household;
create policy household_own on household for all
  using (id in (select app_households())) with check (owner_id = auth.uid());

alter table household_member enable row level security;
drop policy if exists household_member_own on household_member;
create policy household_member_own on household_member for all
  using (user_id = auth.uid() or household_id in (select app_households()))
  with check (household_id in (select app_households()));

-- Child tables inherit their parent's reach
alter table milestone enable row level security;
drop policy if exists milestone_own on milestone;
create policy milestone_own on milestone for all
  using (goal_id in (select id from goal)) with check (goal_id in (select id from goal));

alter table series_exception enable row level security;
drop policy if exists series_exception_own on series_exception;
create policy series_exception_own on series_exception for all
  using (series_id in (select id from series)) with check (series_id in (select id from series));

alter table task_event enable row level security;
drop policy if exists task_event_own on task_event;
create policy task_event_own on task_event for all
  using (task_id in (select id from task)) with check (task_id in (select id from task));

alter table extension_log enable row level security;
drop policy if exists extension_log_own on extension_log;
create policy extension_log_own on extension_log for all
  using (task_id in (select id from task) or goal_id in (select id from goal))
  with check (task_id in (select id from task) or goal_id in (select id from goal));

alter table note_page enable row level security;
drop policy if exists note_page_own on note_page;
create policy note_page_own on note_page for all
  using (section_id in (select id from note_section))
  with check (section_id in (select id from note_section));

alter table recipe_line enable row level security;
drop policy if exists recipe_line_read on recipe_line;
create policy recipe_line_read on recipe_line for select using (recipe_id in (select id from recipe));
drop policy if exists recipe_line_write on recipe_line;
create policy recipe_line_write on recipe_line for all
  using (recipe_id in (select id from recipe where owner_id = auth.uid()))
  with check (recipe_id in (select id from recipe where owner_id = auth.uid()));

alter table workout_line enable row level security;
drop policy if exists workout_line_own on workout_line;
create policy workout_line_own on workout_line for all
  using (workout_id in (select id from workout)) with check (workout_id in (select id from workout));

alter table store_product enable row level security;
drop policy if exists store_product_own on store_product;
create policy store_product_own on store_product for all
  using (store_id in (select id from store)) with check (store_id in (select id from store));

alter table shopping_item enable row level security;
drop policy if exists shopping_item_own on shopping_item;
create policy shopping_item_own on shopping_item for all
  using (trip_id in (select id from shopping_trip)) with check (trip_id in (select id from shopping_trip));

alter table habit_log enable row level security;
drop policy if exists habit_log_own on habit_log;
create policy habit_log_own on habit_log for all
  using (habit_id in (select id from habit)) with check (habit_id in (select id from habit));

alter table supplement_log enable row level security;
drop policy if exists supplement_log_own on supplement_log;
create policy supplement_log_own on supplement_log for all
  using (supplement_id in (select id from supplement)) with check (supplement_id in (select id from supplement));

-- Module catalogue: built-ins readable by all, custom modules private
alter table module enable row level security;
drop policy if exists module_read on module;
create policy module_read on module for select using (builtin or created_by = auth.uid());
drop policy if exists module_write on module;
create policy module_write on module for all
  using (created_by = auth.uid()) with check (created_by = auth.uid());

-- Definition tables: built-in rows (profile_id null) readable, user rows private
do $$
declare t text;
begin
  foreach t in array array['field_definition','view_definition','rule_definition'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format($f$create policy %I_read on %I for select
      using (profile_id is null or profile_id in (select app_profiles()))$f$, t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format($f$create policy %I_write on %I for all
      using (profile_id in (select app_profiles()))
      with check (profile_id in (select app_profiles()))$f$, t, t);
  end loop;
end $$;
