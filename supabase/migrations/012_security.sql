-- GetIt 012: security and privacy review.
--
-- Findings this migration closes, most severe first:
--  1. recipe_line_resolved and recipe_macros were SECURITY DEFINER views, so they
--     ran as their owner and ignored row-level security: any signed-in user could
--     read every account's private recipes through them.
--  2. Any household member could make themselves owner, add or remove members,
--     and read every profile's health data (weight, food log, targets).
--  3. Anyone could rewrite the products of a shared store or the lines of a shared
--     workout, because those child policies only checked the parent was visible.
--  4. Anyone could publish a module marked built-in, visible to every account.
--  5. The anonymous role could read every table that had a permissive policy.
--  6. Policy helper functions sat in the exposed schema, callable over the API.
--  7. Sign-ups were open to anyone who read the key out of the app bundle.
--  8. There was no way to delete an account, which GDPR and Google Play require.
--
-- Every existing policy is dropped and rebuilt below. Policies are permissive and
-- combine with OR, so patching one and leaving an old one behind would keep the
-- hole open without any error to say so.

-- 1 ------------------------------------------------------------------------
alter view public.recipe_line_resolved set (security_invoker = true);
alter view public.recipe_macros       set (security_invoker = true);

-- 6: helpers move out of the API's reach -----------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Ownership has one source of truth: household.owner_id.
create or replace function private.my_households()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select household_id from public.household_member where user_id = (select auth.uid())
$$;

create or replace function private.owned_households()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select id from public.household where owner_id = (select auth.uid())
$$;

-- A profile is yours if it is your own, or a managed profile (no login of its
-- own, e.g. one you plan for someone else) in a household you own. Being in
-- the same household does not open someone else's health data.
create or replace function private.my_profiles()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.profile p
  where p.user_id = (select auth.uid())
     or (p.user_id is null and p.household_id in (
           select h.id from public.household h where h.owner_id = (select auth.uid())))
$$;

revoke all on function private.my_households(), private.owned_households(), private.my_profiles() from public, anon;
grant execute on function private.my_households(), private.owned_households(), private.my_profiles() to authenticated;

-- 5: the app always signs in; the anonymous role needs nothing ------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- Rebuild every policy ------------------------------------------------------
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

drop function if exists public.app_profiles();
drop function if exists public.app_households();

-- Profile-scoped tables: yours and your managed profiles only.
do $$
declare t text;
begin
  foreach t in array array[
    'goal','phase','series','away_period','task','calendar_event','note_section','review',
    'reminder','channel_setting','meal_plan_slot','food_log','workout_log','body_log','target',
    'habit','supplement','sleep_log','module_instance','module_record'
  ] loop
    execute format($f$create policy %1$I_mine on public.%1$I for all to authenticated
      using (profile_id in (select private.my_profiles()))
      with check (profile_id in (select private.my_profiles()))$f$, t);
  end loop;

  -- Genuinely shared household data: the cupboard and the shopping trips.
  foreach t in array array['stock','shopping_trip'] loop
    execute format($f$create policy %1$I_household on public.%1$I for all to authenticated
      using (household_id in (select private.my_households()))
      with check (household_id in (select private.my_households()))$f$, t);
  end loop;

  -- Catalogue tables: shared rows readable, never writable; your own rows yours.
  foreach t in array array['food','recipe','exercise','store','workout'] loop
    execute format($f$create policy %1$I_read on public.%1$I for select to authenticated
      using (owner_id is null or owner_id = (select auth.uid()))$f$, t);
    execute format($f$create policy %1$I_insert on public.%1$I for insert to authenticated
      with check (owner_id = (select auth.uid()))$f$, t);
    execute format($f$create policy %1$I_update on public.%1$I for update to authenticated
      using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))$f$, t);
    execute format($f$create policy %1$I_delete on public.%1$I for delete to authenticated
      using (owner_id = (select auth.uid()))$f$, t);
  end loop;
end $$;

-- 2: profiles and households -------------------------------------------------
create policy profile_read on public.profile for select to authenticated
  using (id in (select private.my_profiles()));
create policy profile_insert on public.profile for insert to authenticated
  with check (household_id in (select private.owned_households())
              and (user_id is null or user_id = (select auth.uid())));
create policy profile_update on public.profile for update to authenticated
  using (id in (select private.my_profiles()))
  with check (household_id in (select private.my_households())
              and (user_id = (select auth.uid())
                   or (user_id is null and household_id in (select private.owned_households()))));
create policy profile_delete on public.profile for delete to authenticated
  using (user_id = (select auth.uid())
         or (user_id is null and household_id in (select private.owned_households())));

create policy household_read on public.household for select to authenticated
  using (id in (select private.my_households()) or owner_id = (select auth.uid()));
create policy household_insert on public.household for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy household_update on public.household for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy household_delete on public.household for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Only the owner decides who is in a household; anyone may leave.
create policy member_read on public.household_member for select to authenticated
  using (household_id in (select private.my_households()));
create policy member_insert on public.household_member for insert to authenticated
  with check (household_id in (select private.owned_households()));
create policy member_update on public.household_member for update to authenticated
  using (household_id in (select private.owned_households()))
  with check (household_id in (select private.owned_households()));
create policy member_delete on public.household_member for delete to authenticated
  using (household_id in (select private.owned_households()) or user_id = (select auth.uid()));

-- Children of private parents: reachable exactly when the parent is.
create policy milestone_mine on public.milestone for all to authenticated
  using (goal_id in (select id from public.goal)) with check (goal_id in (select id from public.goal));
create policy series_exception_mine on public.series_exception for all to authenticated
  using (series_id in (select id from public.series)) with check (series_id in (select id from public.series));
create policy task_event_mine on public.task_event for all to authenticated
  using (task_id in (select id from public.task)) with check (task_id in (select id from public.task));
create policy extension_log_mine on public.extension_log for all to authenticated
  using (task_id in (select id from public.task) or goal_id in (select id from public.goal))
  with check (task_id in (select id from public.task) or goal_id in (select id from public.goal));
create policy note_page_mine on public.note_page for all to authenticated
  using (section_id in (select id from public.note_section))
  with check (section_id in (select id from public.note_section));
create policy habit_log_mine on public.habit_log for all to authenticated
  using (habit_id in (select id from public.habit)) with check (habit_id in (select id from public.habit));
create policy supplement_log_mine on public.supplement_log for all to authenticated
  using (supplement_id in (select id from public.supplement))
  with check (supplement_id in (select id from public.supplement));
create policy shopping_item_household on public.shopping_item for all to authenticated
  using (trip_id in (select id from public.shopping_trip))
  with check (trip_id in (select id from public.shopping_trip));

-- 3: children of shared catalogue rows are readable, but only writable when you
-- own the parent. Visible is not the same as yours.
create policy recipe_line_read on public.recipe_line for select to authenticated
  using (recipe_id in (select id from public.recipe));
create policy recipe_line_write on public.recipe_line for all to authenticated
  using (recipe_id in (select id from public.recipe where owner_id = (select auth.uid())))
  with check (recipe_id in (select id from public.recipe where owner_id = (select auth.uid())));
create policy workout_line_read on public.workout_line for select to authenticated
  using (workout_id in (select id from public.workout));
create policy workout_line_write on public.workout_line for all to authenticated
  using (workout_id in (select id from public.workout where owner_id = (select auth.uid())))
  with check (workout_id in (select id from public.workout where owner_id = (select auth.uid())));
create policy store_product_read on public.store_product for select to authenticated
  using (store_id in (select id from public.store));
create policy store_product_write on public.store_product for all to authenticated
  using (store_id in (select id from public.store where owner_id = (select auth.uid())))
  with check (store_id in (select id from public.store where owner_id = (select auth.uid())));

-- 4: modules. Anyone may build one; nobody may call their own "built-in".
create policy module_read on public.module for select to authenticated
  using (builtin or created_by = (select auth.uid()));
create policy module_insert on public.module for insert to authenticated
  with check (created_by = (select auth.uid()) and not builtin);
create policy module_update on public.module for update to authenticated
  using (created_by = (select auth.uid()) and not builtin)
  with check (created_by = (select auth.uid()) and not builtin);
create policy module_delete on public.module for delete to authenticated
  using (created_by = (select auth.uid()) and not builtin);

do $$
declare t text;
begin
  foreach t in array array['field_definition','view_definition','rule_definition'] loop
    execute format($f$create policy %1$I_read on public.%1$I for select to authenticated
      using (profile_id is null or profile_id in (select private.my_profiles()))$f$, t);
    execute format($f$create policy %1$I_write on public.%1$I for all to authenticated
      using (profile_id in (select private.my_profiles()))
      with check (profile_id in (select private.my_profiles()))$f$, t);
  end loop;
end $$;

create policy template_read on public.template for select to authenticated
  using (owner_id = (select auth.uid()) or shared);
create policy template_write on public.template for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Trigger functions: fixed search path, not callable over the API ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

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
  select p, m.key,
         m.key in ('core','nutrition','shopping','training','habits','supplements','health','learning','agenda'),
         row_number() over (order by m.key)
  from public.module m where m.builtin;
  insert into public.note_section (profile_id, name, sort_order) values (p, 'Notes', 0);
  return new;
end $$;

revoke execute on function public.touch_updated_at(), public.handle_new_user() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- The trigram extension belongs in the extensions schema, not the API's.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;

-- 7: sign-ups by invitation -------------------------------------------------
-- The publishable key ships inside every build, so anyone can call sign-up.
-- Until GetIt opens to the public, only listed addresses may create accounts.
-- Open it later with:  update private.settings set value = 'open' where key = 'signups';
create table if not exists private.settings (key text primary key, value text not null);
insert into private.settings (key, value) values ('signups', 'invite') on conflict (key) do nothing;
create table if not exists private.signup_allowlist (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
revoke all on private.settings, private.signup_allowlist from public, anon, authenticated;

create or replace function private.enforce_signup_allowlist()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select value from private.settings where key = 'signups') = 'open' then
    return new;
  end if;
  if new.email is not null
     and exists (select 1 from private.signup_allowlist where email = lower(new.email)) then
    return new;
  end if;
  raise exception 'GetIt is invite-only for now' using errcode = 'P0001';
end $$;
revoke all on function private.enforce_signup_allowlist() from public, anon, authenticated;

drop trigger if exists enforce_signup_allowlist on auth.users;
create trigger enforce_signup_allowlist
  before insert on auth.users
  for each row execute function private.enforce_signup_allowlist();

-- 8: delete my account -----------------------------------------------------
-- Removes everything the caller owns. A household they share with someone else
-- is handed to that person rather than deleted from under them; the caller's
-- own profile and any profiles they manage go with them.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  h record;
  heir uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  for h in select id from public.household where owner_id = uid loop
    select user_id into heir from public.household_member
    where household_id = h.id and user_id <> uid order by user_id limit 1;

    if heir is null then
      delete from public.household where id = h.id;            -- cascades everything under it
    else
      delete from public.profile where household_id = h.id and (user_id = uid or user_id is null);
      update public.household set owner_id = heir where id = h.id;
      update public.household_member set role = 'owner' where household_id = h.id and user_id = heir;
    end if;
  end loop;

  delete from public.profile where user_id = uid;             -- own profiles in other households
  delete from auth.users where id = uid;                       -- memberships and own catalogue rows cascade
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
