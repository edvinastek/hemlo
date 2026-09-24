-- GetIt security checks. Every attack from the 012 review, tried for real.
-- Runs inside a transaction and rolls back, so it leaves nothing behind and can
-- run against the live project. Each row: what was tried, what must happen,
-- what did happen. Any row where the last two differ is a hole.
begin;

create temp table _r (n serial, check_name text, expected text, actual text);
create temp table _ids (a uuid, b uuid, m uuid, ha uuid, pa uuid, pb uuid, recipe uuid, store uuid, workout uuid);
grant all on _r, _ids to authenticated, anon;
grant usage on sequence _r_n_seq to authenticated, anon;

-- Three people: A owns a household, M is a member of it, B is a stranger.
insert into private.signup_allowlist (email) values ('sec-a@test.local'), ('sec-b@test.local'), ('sec-m@test.local');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new, raw_app_meta_data, raw_user_meta_data)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now(),
       '', '', '', '', '{"provider":"email"}', '{}'
from unnest(array['sec-a@test.local','sec-b@test.local','sec-m@test.local']) e;

insert into _ids (a, b, m)
select (select id from auth.users where email = 'sec-a@test.local'),
       (select id from auth.users where email = 'sec-b@test.local'),
       (select id from auth.users where email = 'sec-m@test.local');
update _ids set ha = (select id from household where owner_id = a),
                pa = (select id from profile where user_id = a),
                pb = (select id from profile where user_id = b);

insert into household_member (household_id, user_id, role) select ha, m, 'member' from _ids;
insert into task (profile_id, title) select pa, 'A private task' from _ids;
insert into body_log (profile_id, log_date, weight_kg) select pa, current_date, 86 from _ids;
insert into stock (household_id, food_id, grams_on_hand) select ha, (select id from food where owner_id is null limit 1), 500 from _ids;

with r as (insert into recipe (owner_id, name) select a, 'A secret recipe' from _ids returning id)
update _ids set recipe = (select id from r);
insert into recipe_line (recipe_id, food_id, grams_per_portion)
select recipe, (select id from food where owner_id is null limit 1), 100 from _ids;

with s as (insert into store (owner_id, name) values (null, 'Shared store') returning id)
update _ids set store = (select id from s);
insert into store_product (store_id, product_name, price) select store, 'Rice 1 kg', 1.99 from _ids;

with w as (insert into workout (owner_id, name) values (null, 'Shared workout') returning id)
update _ids set workout = (select id from w);
insert into workout_line (workout_id, sets, reps) select workout, 3, 10 from _ids;

-- As B, the stranger ---------------------------------------------------------
do $$
declare n int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);

  insert into _r (check_name, expected, actual) values
    ('B sees none of A''s tasks', '0', (select count(*) from task where title = 'A private task')::text),
    ('B sees only their own profile', '1', (select count(*) from profile)::text),
    ('B cannot read A''s private recipe', '0', (select count(*) from recipe where name = 'A secret recipe')::text),
    ('B cannot read A''s recipe through the resolved view', '0',
       (select count(*) from recipe_line_resolved where recipe_id = (select recipe from _ids))::text),
    ('B cannot read A''s recipe through the macros view', '0',
       (select count(*) from recipe_macros where name = 'A secret recipe')::text),
    ('B can still read the shared catalogue', 'yes',
       case when (select count(*) from food where owner_id is null) > 800 then 'yes' else 'no' end);

  update store_product set price = 0 where store_id = (select store from _ids);
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('B cannot reprice a shared store', '0', n::text);

  update workout_line set reps = 999 where workout_id = (select workout from _ids);
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('B cannot rewrite a shared workout', '0', n::text);

  begin
    insert into task (profile_id, title) values ((select pa from _ids), 'planted by B');
    insert into _r (check_name, expected, actual) values ('B cannot write a task into A''s profile', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot write a task into A''s profile', 'denied', 'denied');
  end;

  begin
    insert into module (key, name, builtin, created_by) values ('fake', 'Looks official', true, (select b from _ids));
    insert into _r (check_name, expected, actual) values ('B cannot publish a "built-in" module', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot publish a "built-in" module', 'denied', 'denied');
  end;

  begin
    insert into household_member (household_id, user_id) values ((select ha from _ids), (select b from _ids));
    insert into _r (check_name, expected, actual) values ('B cannot join A''s household', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot join A''s household', 'denied', 'denied');
  end;

  execute 'reset role';
end $$;

-- As M, a member of A's household ------------------------------------------
do $$
declare n int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select m from _ids), 'role', 'authenticated')::text, true);

  insert into _r (check_name, expected, actual) values
    ('M sees the shared household stock', '1',
       (select count(*) from stock where household_id = (select ha from _ids))::text),
    ('M cannot see A''s weight log', '0', (select count(*) from body_log)::text),
    ('M cannot see A''s profile', '0', (select count(*) from profile where id = (select pa from _ids))::text);

  update household set owner_id = (select m from _ids) where id = (select ha from _ids);
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('M cannot take ownership of the household', '0', n::text);

  -- Scoped to A's household: M legitimately owns their own household too, and an
  -- unscoped update would count that row and report a hole that is not there.
  update household_member set role = 'owner'
  where user_id = (select m from _ids) and household_id = (select ha from _ids);
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('M cannot promote themselves in A''s household', '0', n::text);

  execute 'reset role';
  insert into _r (check_name, expected, actual) values ('M is still only a member afterwards', 'member',
    (select role from household_member where user_id = (select m from _ids) and household_id = (select ha from _ids)));
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select m from _ids), 'role', 'authenticated')::text, true);

  delete from household_member where user_id = (select a from _ids);
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('M cannot remove the owner', '0', n::text);

  begin
    insert into household_member (household_id, user_id) values ((select ha from _ids), (select b from _ids));
    insert into _r (check_name, expected, actual) values ('M cannot invite someone in', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('M cannot invite someone in', 'denied', 'denied');
  end;

  execute 'reset role';
end $$;

-- As nobody --------------------------------------------------------------------
do $$
begin
  perform set_config('role', 'anon', true);
  begin
    perform count(*) from food;
    insert into _r (check_name, expected, actual) values ('Signed-out callers cannot read the database', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('Signed-out callers cannot read the database', 'denied', 'denied');
  end;
  begin
    perform public.delete_my_account();
    insert into _r (check_name, expected, actual) values ('Signed-out callers cannot call account deletion', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('Signed-out callers cannot call account deletion', 'denied', 'denied');
  end;
  execute 'reset role';
end $$;

-- A stranger tries to sign up -------------------------------------------------
do $$
begin
  begin
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'stranger@example.com', now(), now());
    insert into _r (check_name, expected, actual) values ('An unlisted address cannot sign up', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('An unlisted address cannot sign up', 'denied', 'denied');
  end;
end $$;

-- A deletes their account while M is still in the household ------------------
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select a from _ids), 'role', 'authenticated')::text, true);
  perform public.delete_my_account();
  execute 'reset role';
end $$;

insert into _r (check_name, expected, actual) values
  ('Deleting removes the user', '0', (select count(*) from auth.users where id = (select a from _ids))::text),
  ('Deleting removes their profile', '0', (select count(*) from profile where id = (select pa from _ids))::text),
  ('Deleting removes their tasks', '0', (select count(*) from task where title = 'A private task')::text),
  ('Deleting removes their weight log', '0', (select count(*) from body_log where profile_id = (select pa from _ids))::text),
  ('Deleting removes their own recipes', '0', (select count(*) from recipe where name = 'A secret recipe')::text),
  ('Deleting removes them from the invite list', '0', (select count(*) from private.signup_allowlist where email = 'sec-a@test.local')::text),
  ('A shared household passes to the remaining member', 'M',
     case when (select owner_id from household where id = (select ha from _ids)) = (select m from _ids) then 'M' else 'lost' end),
  ('The remaining member keeps their own profile', '1',
     (select count(*) from profile where user_id = (select m from _ids))::text);

select n, check_name, expected, actual, case when expected = actual then 'ok' else 'FAIL' end as result
from _r order by n;

rollback;
