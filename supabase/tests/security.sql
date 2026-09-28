-- GetIt security checks. Every attack from the 012 review, tried for real.
-- Runs inside a transaction and rolls back, so it leaves nothing behind and can
-- run against the live project. Each row: what was tried, what must happen,
-- what did happen. Any row where the last two differ is a hole.
begin;

create temp table _r (n serial, check_name text, expected text, actual text);
create temp table _ids (a uuid, b uuid, m uuid, ha uuid, pa uuid, pb uuid, recipe uuid, store uuid, workout uuid, shared uuid);
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

insert into module (key, name, builtin, created_by, definition) select 'u_secrettest1', 'A''s own module', false, a, '{"fields":[]}' from _ids;
insert into module_record (profile_id, module_key, entity, data) select pa, 'u_secrettest1', 'item', '{"note":"private"}' from _ids;

-- Recipe sharing (019): A has a second recipe, from shared foods only, that A
-- will propose. M is made a reviewer for this run; B stays a stranger.
with r as (insert into recipe (owner_id, name) select a, 'A proposed recipe' from _ids returning id)
update _ids set shared = (select id from r);
insert into recipe_line (recipe_id, food_id, grams_per_portion)
select shared, (select id from food where owner_id is null limit 1), 120 from _ids;
insert into food (owner_id, name, kcal) select a, 'A''s own oats', 380 from _ids;
insert into app_admin (user_id) select m from _ids;

-- As B, the stranger ---------------------------------------------------------
do $$
declare n int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);

  insert into _r (check_name, expected, actual) values
    ('B cannot see a module A built', '0', (select count(*) from module where key = 'u_secrettest1')::text),
    ('B cannot read the records of A''s module', '0', (select count(*) from module_record where module_key = 'u_secrettest1')::text),
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

do $$
declare n int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);
  update module set name = 'Taken over' where key = 'u_secrettest1';
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('B cannot rename A''s module', '0', n::text);
  begin
    truncate task;
    insert into _r (check_name, expected, actual) values ('B cannot empty a table with TRUNCATE', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot empty a table with TRUNCATE', 'denied', 'denied');
  end;
  begin
    insert into module (key, name, builtin, created_by) values ('nutrition2', 'Fake', false, (select b from _ids));
    insert into _r (check_name, expected, actual) values ('A module key outside u_… is refused', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A module key outside u_… is refused', 'denied', 'denied');
  end;
  execute 'reset role';
end $$;

-- Sharing a recipe: private, proposed, reviewed, approved, changed -----------
do $$
declare n int;
begin
  -- A proposes it.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select a from _ids), 'role', 'authenticated')::text, true);
  update recipe set sharing = 'proposed' where id = (select shared from _ids);
  begin
    update recipe set sharing = 'public' where id = (select shared from _ids);
    insert into _r (check_name, expected, actual) values ('A cannot share their own recipe with everyone', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A cannot share their own recipe with everyone', 'denied', 'denied');
  end;
  update recipe set reviewed_at = now(), review_note = 'looks fine' where id = (select shared from _ids);
  insert into _r (check_name, expected, actual) values ('A cannot mark their own recipe as reviewed', 'untouched',
    (select case when reviewed_at is null and review_note is null then 'untouched' else 'written' end
     from recipe where id = (select shared from _ids)));
  begin
    perform public.review_recipe((select shared from _ids), true, null);
    insert into _r (check_name, expected, actual) values ('A cannot approve their own recipe', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A cannot approve their own recipe', 'denied', 'denied');
  end;
  begin
    insert into recipe (id, owner_id, name, sharing) values (gen_random_uuid(), (select a from _ids), 'A oats bowl', 'proposed');
    insert into recipe_line (recipe_id, food_id, grams_per_portion)
    select id, (select id from food where name = 'A''s own oats'), 80 from recipe where name = 'A oats bowl';
    insert into _r (check_name, expected, actual) values ('A shared recipe cannot use a food only A can see', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A shared recipe cannot use a food only A can see', 'denied', 'denied');
  end;
  insert into _r (check_name, expected, actual) values
    ('A reads no reviewer row but their own', '0', (select count(*) from app_admin)::text);
  begin
    insert into app_admin (user_id) values ((select a from _ids));
    insert into _r (check_name, expected, actual) values ('A cannot make themselves a reviewer', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A cannot make themselves a reviewer', 'denied', 'denied');
  end;
  execute 'reset role';

  -- B, a stranger, while it waits.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('B cannot see A''s proposed recipe', '0', (select count(*) from recipe where id = (select shared from _ids))::text),
    ('B cannot see the lines of A''s proposed recipe', '0',
       (select count(*) from recipe_line where recipe_id = (select shared from _ids))::text);
  begin
    perform public.review_recipe((select shared from _ids), true, null);
    insert into _r (check_name, expected, actual) values ('B, not a reviewer, cannot approve it', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B, not a reviewer, cannot approve it', 'denied', 'denied');
  end;
  begin
    perform count(*) from public.recipe_review_queue();
    insert into _r (check_name, expected, actual) values ('B cannot read the review queue', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot read the review queue', 'denied', 'denied');
  end;
  execute 'reset role';

  -- M, the reviewer, sees it and approves it.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select m from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('The reviewer reads their own reviewer row', '1', (select count(*) from app_admin)::text),
    ('The reviewer sees the proposed recipe and its line', '1+1',
       (select count(*) from recipe where id = (select shared from _ids))::text || '+' ||
       (select count(*) from recipe_line where recipe_id = (select shared from _ids))::text),
    ('The reviewer still cannot see A''s private recipe', '0', (select count(*) from recipe where name = 'A secret recipe')::text),
    ('The queue never shows a name made from an email address', 'hidden',
       (select case when q.author is null then 'hidden' else q.author end
        from public.recipe_review_queue() q where q.id = (select shared from _ids)));
  perform public.review_recipe((select shared from _ids), true, 'Nice one');
  execute 'reset role';

  -- B, after approval.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('B sees A''s recipe once approved, with its line', '1+1',
       (select count(*) from recipe where id = (select shared from _ids))::text || '+' ||
       (select count(*) from recipe_line where recipe_id = (select shared from _ids))::text),
    ('B still cannot see A''s private recipe', '0', (select count(*) from recipe where name = 'A secret recipe')::text);
  update recipe set name = 'Taken over' where id = (select shared from _ids);
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('B cannot change A''s approved recipe', '0', n::text);
  execute 'reset role';

  -- A changes it: back to the queue, out of B's sight.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select a from _ids), 'role', 'authenticated')::text, true);
  update recipe set name = 'A proposed recipe, more rice' where id = (select shared from _ids);
  insert into _r (check_name, expected, actual) values ('Changing an approved recipe sends it back for review', 'proposed',
    (select sharing from recipe where id = (select shared from _ids)));
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('B no longer sees it while it waits again', '0', (select count(*) from recipe where id = (select shared from _ids))::text);
  execute 'reset role';

  -- Approved once more, so the deletion below has a shared recipe to remove.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select m from _ids), 'role', 'authenticated')::text, true);
  perform public.review_recipe((select shared from _ids), true, null);
  execute 'reset role';
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
  ('Deleting removes the recipes they shared too', '0', (select count(*) from recipe where id = (select shared from _ids))::text),
  ('Deleting removes the modules they built', '0', (select count(*) from module where key = 'u_secrettest1')::text),
  ('Deleting removes them from the invite list', '0', (select count(*) from private.signup_allowlist where email = 'sec-a@test.local')::text),
  ('A shared household passes to the remaining member', 'M',
     case when (select owner_id from household where id = (select ha from _ids)) = (select m from _ids) then 'M' else 'lost' end),
  ('The remaining member keeps their own profile', '1',
     (select count(*) from profile where user_id = (select m from _ids))::text);

-- The reviewer row made for this run goes (the rollback would take it anyway).
delete from app_admin where user_id = (select m from _ids);

select n, check_name, expected, actual, case when expected = actual then 'ok' else 'FAIL' end as result
from _r order by n;

rollback;
