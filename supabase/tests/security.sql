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
-- A supermarket product A scanned (021).
insert into food (owner_id, name, kcal, barcode, brand, source, source_ref)
select a, 'A''s scanned hagelslag', 428, '8710496979125', 'De Ruijter', 'off', '8710496979125' from _ids;
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

  -- Scanned products (021): A's stays A's; B may scan the same one for
  -- themselves; nonsense in the barcode is refused.
  insert into _r (check_name, expected, actual) values
    ('B cannot read A''s scanned food', '0', (select count(*) from food where barcode = '8710496979125')::text);
  update food set name = 'renamed by B' where barcode = '8710496979125';
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('B cannot change A''s scanned food', '0', n::text);
  begin
    insert into food (owner_id, name, barcode, source) values ((select b from _ids), 'B''s own hagelslag', '8710496979125', 'off');
    insert into _r (check_name, expected, actual) values ('B can keep the same product as their own food', 'allowed', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B can keep the same product as their own food', 'allowed', 'denied');
  end;
  begin
    insert into food (owner_id, name, barcode, source) values ((select b from _ids), 'B''s second hagelslag', '8710496979125', 'off');
    insert into _r (check_name, expected, actual) values ('One live food per barcode per person', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('One live food per barcode per person', 'denied', 'denied');
  end;
  begin
    insert into food (owner_id, name, barcode) values ((select b from _ids), 'Bad code', '87104969791a5');
    insert into _r (check_name, expected, actual) values ('A barcode that is not 8 to 14 digits is refused', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A barcode that is not 8 to 14 digits is refused', 'denied', 'denied');
  end;
  begin
    insert into food (owner_id, name, image_url) values ((select b from _ids), 'Bad picture', 'http://example.com/x.jpg');
    insert into _r (check_name, expected, actual) values ('A picture link that is not https is refused', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A picture link that is not https is refused', 'denied', 'denied');
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

-- Household foods (025): a food A scanned into the shared cupboard is
-- readable by M, only that one, only while it is there, never changeable;
-- B, outside the household, reads nothing; and a stranger's food cannot be
-- pulled into view by putting it in one's own cupboard.
alter table _ids add column bfood uuid, add column hm uuid, add column astock uuid;
update _ids set bfood = (select id from food where name = 'B''s own hagelslag'),
                hm = (select id from household where owner_id = m);
with s as (
  insert into stock (household_id, food_id, grams_on_hand)
  select ha, (select id from food where owner_id = a and barcode = '8710496979125'), 400 from _ids returning id)
update _ids set astock = (select id from s);

do $$
declare n int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select m from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('M can read the food A scanned into the shared cupboard', '1',
       (select count(*) from food where barcode = '8710496979125' and owner_id = (select a from _ids))::text),
    ('M still cannot read A''s other own foods', '0', (select count(*) from food where name = 'A''s own oats')::text);
  update food set name = 'renamed by M' where barcode = '8710496979125' and owner_id = (select a from _ids);
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('M cannot change the food A put in the cupboard', '0', n::text);

  -- M's own household's cupboard, pointed at B's food.
  begin
    insert into stock (household_id, food_id, grams_on_hand) select hm, bfood, 1 from _ids;
  exception when others then null;
  end;
  insert into _r (check_name, expected, actual) values
    ('A stranger''s food in one''s own cupboard stays unreadable', '0',
       (select count(*) from food where name = 'B''s own hagelslag')::text);
  execute 'reset role';

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('B cannot read the food in A''s household cupboard', '0',
       (select count(*) from food where barcode = '8710496979125' and owner_id = (select a from _ids))::text);
  execute 'reset role';

  -- Taken out of the cupboard, it is A's alone again.
  update stock set deleted_at = now() where id = (select astock from _ids);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select m from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('M no longer reads it once it leaves the cupboard', '0',
       (select count(*) from food where barcode = '8710496979125' and owner_id = (select a from _ids))::text);
  execute 'reset role';
end $$;

-- The checks below count the household's one stock row: these go.
delete from stock where id = (select astock from _ids) or (household_id = (select hm from _ids) and food_id = (select bfood from _ids));

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

-- Calendar links (020): a feed link only its owner can make, whose secret
-- part no one can read back, and calendars followed privately ---------------
create temp table _feed (token text, token2 text, sub uuid);
grant all on _feed to authenticated, anon;
insert into _feed default values;

do $$
declare n int;
begin
  -- A makes a feed link and follows a calendar.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select a from _ids), 'role', 'authenticated')::text, true);
  update _feed set token = public.rotate_calendar_feed((select pa from _ids));
  insert into _r (check_name, expected, actual) values
    ('A gets a 43-character link token', 'yes',
       case when (select token from _feed) ~ '^[A-Za-z0-9_-]{43}$' then 'yes' else 'no' end),
    ('A can see that their feed exists', '1',
       (select count(*) from (select profile_id, created_at, rotated_at from calendar_feed) f)::text);
  begin
    perform token_hash from calendar_feed;
    insert into _r (check_name, expected, actual) values ('A cannot read their feed''s hash back', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A cannot read their feed''s hash back', 'denied', 'denied');
  end;
  begin
    update calendar_feed set token_hash = repeat('0', 64) where profile_id = (select pa from _ids);
    insert into _r (check_name, expected, actual) values ('A cannot set their feed''s hash directly', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A cannot set their feed''s hash directly', 'denied', 'denied');
  end;
  with s as (insert into calendar_subscription (profile_id, name, url)
             select pa, 'Work', 'https://calendar.google.com/calendar/ical/x/private-y/basic.ics' from _ids returning id)
  update _feed set sub = (select id from s);
  insert into calendar_event (profile_id, title, starts_at, subscription_id, external_uid)
  select pa, 'From Google', now(), (select sub from _feed), 'uid-1@google.com' from _ids;
  begin
    insert into calendar_subscription (profile_id, name, url) select pa, 'Plain', 'http://example.com/cal.ics' from _ids;
    insert into _r (check_name, expected, actual) values ('A followed calendar must be an https address', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A followed calendar must be an https address', 'denied', 'denied');
  end;
  update _feed set token2 = public.rotate_calendar_feed((select pa from _ids));
  execute 'reset role';

  insert into _r (check_name, expected, actual) values
    ('Only the hash of the link is stored', 'hash',
       (select case when token_hash = encode(sha256(convert_to((select token2 from _feed), 'UTF8')), 'hex') then 'hash' else 'other' end
        from calendar_feed where profile_id = (select pa from _ids))),
    ('A new link replaces the old one', 'replaced',
       case when (select token from _feed) <> (select token2 from _feed)
             and (select count(*) from calendar_feed where profile_id = (select pa from _ids)) = 1 then 'replaced' else 'kept' end);

  -- B, a stranger.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);
  begin
    perform public.rotate_calendar_feed((select pa from _ids));
    insert into _r (check_name, expected, actual) values ('B cannot make a feed link for A''s profile', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot make a feed link for A''s profile', 'denied', 'denied');
  end;
  insert into _r (check_name, expected, actual) values
    ('B cannot see A''s feed', '0', (select count(*) from (select profile_id from calendar_feed) f)::text),
    ('B cannot see the calendars A follows', '0', (select count(*) from calendar_subscription)::text),
    ('B cannot see A''s followed events', '0', (select count(*) from calendar_event where title = 'From Google')::text);
  delete from calendar_feed where profile_id = (select pa from _ids);
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('B cannot turn off A''s feed', '0', n::text);
  update calendar_subscription set url = 'https://evil.example/x.ics' where id = (select sub from _feed);
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('B cannot change the address A follows', '0', n::text);
  begin
    insert into calendar_event (profile_id, title, starts_at, subscription_id, external_uid)
    values ((select pb from _ids), 'Hung off A''s calendar', now(), (select sub from _feed), 'x');
    insert into _r (check_name, expected, actual) values ('B cannot hang an event off A''s followed calendar', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot hang an event off A''s followed calendar', 'denied', 'denied');
  end;
  execute 'reset role';

  -- 024: a removed calendar keeps no address; one still followed must have one.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select a from _ids), 'role', 'authenticated')::text, true);
  begin
    insert into calendar_subscription (profile_id, name, url) select pa, 'No address', null from _ids;
    insert into _r (check_name, expected, actual) values ('A followed calendar must have an address', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A followed calendar must have an address', 'denied', 'denied');
  end;
  -- The app sends only deleted_at; the server wipes the address.
  update calendar_subscription set deleted_at = now() where id = (select sub from _feed);
  insert into _r (check_name, expected, actual) values
    ('Removing a followed calendar wipes its address', 'empty',
       (select case when url is null then 'empty' else 'kept' end from calendar_subscription where id = (select sub from _feed)));
  begin
    update calendar_subscription set deleted_at = null where id = (select sub from _feed);
    insert into _r (check_name, expected, actual) values ('A removed calendar cannot come back without an address', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A removed calendar cannot come back without an address', 'denied', 'denied');
  end;
  -- Added and removed on a device that was offline all along: arrives removed, with no address.
  begin
    insert into calendar_subscription (profile_id, name, url, deleted_at) select pa, 'Gone at once', null, now() from _ids;
    insert into _r (check_name, expected, actual) values ('A calendar that arrives removed may have no address', 'allowed', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A calendar that arrives removed may have no address', 'allowed', 'denied');
  end;
  execute 'reset role';

  perform set_config('role', 'anon', true);
  begin
    perform public.rotate_calendar_feed((select pa from _ids));
    insert into _r (check_name, expected, actual) values ('Signed-out callers cannot make a feed link', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('Signed-out callers cannot make a feed link', 'denied', 'denied');
  end;
  execute 'reset role';
end $$;

-- Units (022): a food's own units only its owner changes, nonsense refused,
-- and an entry's unit comes with how many --------------------------------------
do $$
declare
  n int;
  label text;
  bad jsonb;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select a from _ids), 'role', 'authenticated')::text, true);

  update food set units = '[{"name":"scoop","plural":"scoops","g":40}]' where name = 'A''s own oats';
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('A can give their own food units', '1', n::text);

  for label, bad in select * from (values
      ('Units that are not a list are refused', '{"name":"egg","g":50}'::jsonb),
      ('More than eight units are refused', (select jsonb_agg(jsonb_build_object('name', 'u' || i, 'g', 1)) from generate_series(1, 9) i)),
      ('A unit weighing nothing is refused', '[{"name":"egg","g":0}]'::jsonb),
      ('A unit past 5 kg is refused', '[{"name":"sack","g":25000}]'::jsonb),
      ('A weight written as text is refused', '[{"name":"egg","g":"50"}]'::jsonb),
      ('A unit without a name is refused', '[{"name":"  ","g":50}]'::jsonb),
      ('A name past 24 characters is refused', '[{"name":"an-extremely-long-unit-name","g":50}]'::jsonb),
      ('Grams as a unit are refused', '[{"name":"G","g":1}]'::jsonb),
      ('A unit with other keys is refused', '[{"name":"egg","g":50,"kcal":70}]'::jsonb),
      ('The same unit twice is refused', '[{"name":"egg","g":50},{"name":"Egg","g":60}]'::jsonb),
      ('A unit that is not an object is refused', '["egg"]'::jsonb),
      ('No units at all (null) are refused', null::jsonb)) v(l, u) loop
    begin
      update food set units = bad where name = 'A''s own oats';
      insert into _r (check_name, expected, actual) values (label, 'denied', 'allowed');
    exception when others then
      insert into _r (check_name, expected, actual) values (label, 'denied', 'denied');
    end;
  end loop;

  begin
    update recipe_line set unit = 'egg' where recipe_id = (select recipe from _ids);
    insert into _r (check_name, expected, actual) values ('An ingredient''s unit needs how many', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('An ingredient''s unit needs how many', 'denied', 'denied');
  end;
  begin
    update recipe_line set unit = 'egg', unit_qty = 0 where recipe_id = (select recipe from _ids);
    insert into _r (check_name, expected, actual) values ('An ingredient of no eggs is refused', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('An ingredient of no eggs is refused', 'denied', 'denied');
  end;
  update recipe_line set unit = 'egg', unit_qty = 2, grams_per_portion = 100 where recipe_id = (select recipe from _ids);
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('A can write an ingredient as 2 eggs', '1', n::text);

  begin
    update stock set unit = 'egg', unit_qty = -1 where household_id = (select ha from _ids);
    insert into _r (check_name, expected, actual) values ('Stock of fewer than no eggs is refused', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('Stock of fewer than no eggs is refused', 'denied', 'denied');
  end;
  update stock set unit = 'egg', unit_qty = 12, grams_on_hand = 600 where household_id = (select ha from _ids);
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('A can keep stock as 12 eggs', '1', n::text);
  execute 'reset role';

  -- B, a stranger, tries A's food and the shared catalogue.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);
  update food set units = '[{"name":"egg","g":1}]' where name = 'A''s own oats';
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('B cannot change the units of A''s food', '0', n::text);
  update food set units = '[{"name":"egg","g":1}]' where owner_id is null and name = 'Egg Chicken';
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('B cannot change the catalogue''s units', '0', n::text);
  execute 'reset role';

  insert into _r (check_name, expected, actual) values
    ('A''s food kept the units A gave it', 'scoop',
       (select units -> 0 ->> 'name' from food where name = 'A''s own oats')),
    ('The catalogue''s eggs are counted in eggs of 50 g', 'egg 50',
       (select (units -> 0 ->> 'name') || ' ' || (units -> 0 ->> 'g') from food where owner_id is null and name = 'Egg Chicken'));
end $$;

-- Version 16 (026): the household's shopping list and chores, habits' new
-- fields, and a new account's starting modules.
do $$
declare n int; c uuid;
begin
  insert into _r (check_name, expected, actual) values
    ('A new account starts with only the core switched on', 'core',
       (select string_agg(module_key, ',') from module_instance where profile_id = (select pb from _ids) and enabled));

  -- A writes a shopping item and a chore into the household.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select a from _ids), 'role', 'authenticated')::text, true);
  insert into shopping_entry (household_id, name) select ha, 'Toilet paper' from _ids;
  insert into chore (household_id, name, rule) select ha, 'Hoover the stairs', 'weekly' from _ids returning id into c;
  insert into chore_log (chore_id, done_on, done_by) select c, current_date, a from _ids;
  update habit set rule = 'weekends', note = '- [ ] Hips' where profile_id = (select pa from _ids);
  begin
    insert into chore (household_id, name, rule) select ha, 'Bad rule', 'fortnightly-ish' from _ids;
    insert into _r (check_name, expected, actual) values ('A chore''s rule must be one the app knows', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A chore''s rule must be one the app knows', 'denied', 'denied');
  end;
  begin
    insert into shopping_entry (household_id) select ha from _ids;
    insert into _r (check_name, expected, actual) values ('A shopping item must say what it is', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A shopping item must say what it is', 'denied', 'denied');
  end;
  execute 'reset role';

  -- M, a member, shares the list and the chores.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select m from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('A household member sees the shared shopping list', '1', (select count(*) from shopping_entry where name = 'Toilet paper')::text),
    ('A household member sees the household''s chores', '1', (select count(*) from chore where name = 'Hoover the stairs')::text),
    ('A household member sees who did a chore', '1', (select count(*) from chore_log where chore_id = c)::text);
  update shopping_entry set checked = true where name = 'Toilet paper';
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('A household member can tick a shopping item', '1', n::text);
  perform public.set_my_member_name((select ha from _ids), 'Mo');
  execute 'reset role';
  insert into _r (check_name, expected, actual) values
    ('A member can name themselves in the household', 'Mo',
       (select display_name from household_member where user_id = (select m from _ids) and household_id = (select ha from _ids)));

  -- B, a stranger, sees and changes none of it.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('B cannot read A''s household shopping list', '0', (select count(*) from shopping_entry where name = 'Toilet paper')::text),
    ('B cannot read A''s household chores', '0', (select count(*) from chore where name = 'Hoover the stairs')::text),
    ('B cannot read A''s chore log', '0', (select count(*) from chore_log where chore_id = c)::text),
    ('B cannot read A''s habit note', '0', (select count(*) from habit where note = '- [ ] Hips')::text);
  update chore set name = 'renamed by B' where id = c;
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('B cannot change A''s chores', '0', n::text);
  begin
    insert into shopping_entry (household_id, name) select ha, 'planted by B' from _ids;
    insert into _r (check_name, expected, actual) values ('B cannot write into A''s shopping list', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot write into A''s shopping list', 'denied', 'denied');
  end;
  begin
    insert into chore_log (chore_id, done_on) values (c, current_date - 1);
    insert into _r (check_name, expected, actual) values ('B cannot log A''s chore as done', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot log A''s chore as done', 'denied', 'denied');
  end;
  perform public.set_my_member_name((select ha from _ids), 'Intruder');
  execute 'reset role';
  insert into _r (check_name, expected, actual) values
    ('B cannot name themselves into A''s household', '0',
       (select count(*) from household_member where display_name = 'Intruder')::text);

  insert into _r (check_name, expected, actual) values
    ('The catalogue''s carbohydrate leaves fibre out (EU)', 'eu',
       (select string_agg(distinct carb_basis, ',') from food where owner_id is null));
end $$;

-- Habits, supplements and chores (030, engineer B): a habit's colour, mark and
-- part of the day; a supplement's own schedule and slot; a chore's holiday.
do $$
declare n int; h uuid; s uuid; c uuid;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select a from _ids), 'role', 'authenticated')::text, true);
  insert into habit (profile_id, name, colour, mark, day_part) select pa, 'Mobility 030', '#4777d2', 'M', 'morning' from _ids returning id into h;
  insert into supplement (profile_id, name, time_slot, rule, rule_config, start_date, end_date)
    select pa, 'Vitamin D 030', 'on-waking', 'weekly', '{"weekdays":[1,4]}'::jsonb, date '2026-10-01', date '2027-03-31' from _ids returning id into s;
  select id into c from chore where name = 'Hoover the stairs';
  update chore set paused_from = date '2026-10-10', paused_until = date '2026-10-20' where id = c;
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('A can pause a household chore between two dates', '1', n::text);
  begin
    update habit set colour = 'red' where id = h;
    insert into _r (check_name, expected, actual) values ('A habit''s colour must be a #rrggbb colour', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A habit''s colour must be a #rrggbb colour', 'denied', 'denied');
  end;
  begin
    update habit set day_part = 'night' where id = h;
    insert into _r (check_name, expected, actual) values ('A habit''s part of the day must be one the app knows', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A habit''s part of the day must be one the app knows', 'denied', 'denied');
  end;
  begin
    update supplement set rule = 'times_per_week' where id = s;
    insert into _r (check_name, expected, actual) values ('A supplement''s rule must be one with fixed days', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A supplement''s rule must be one with fixed days', 'denied', 'denied');
  end;
  begin
    update supplement set end_date = date '2026-09-01' where id = s;
    insert into _r (check_name, expected, actual) values ('A supplement cannot end before it starts', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A supplement cannot end before it starts', 'denied', 'denied');
  end;
  begin
    update supplement set time_slot = 'Not A Key!' where id = s;
    insert into _r (check_name, expected, actual) values ('A supplement''s slot is a short key', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A supplement''s slot is a short key', 'denied', 'denied');
  end;
  begin
    update chore set paused_until = date '2026-10-01' where id = c;
    insert into _r (check_name, expected, actual) values ('A chore''s pause cannot end before it starts', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A chore''s pause cannot end before it starts', 'denied', 'denied');
  end;
  execute 'reset role';
  insert into _r (check_name, expected, actual) values
    ('A habit keeps its colour, mark and part of the day', '#4777d2 M morning',
       (select colour || ' ' || mark || ' ' || day_part from habit where id = h)),
    ('A supplement keeps its schedule and slot', 'weekly on-waking 2026-10-01',
       (select rule || ' ' || time_slot || ' ' || start_date::text from supplement where id = s));

  -- M, a member, sees the household chore's holiday and can end it.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select m from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('A household member sees a chore''s pause', '2026-10-20', (select paused_until::text from chore where id = c));
  update chore set paused_from = null, paused_until = null where id = c;
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('A household member can end a chore''s pause', '1', n::text);
  execute 'reset role';

  -- B, a stranger, sees none of it and changes none of it.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('B cannot read A''s habit colour', '0', (select count(*) from habit where id = h)::text),
    ('B cannot read A''s supplement schedule', '0', (select count(*) from supplement where id = s)::text);
  update supplement set rule = null where id = s;
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('B cannot change A''s supplement schedule', '0', n::text);
  update chore set paused = true where id = c;
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('B cannot pause A''s household chore', '0', n::text);
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
  ('Deleting removes the products they scanned', '0', (select count(*) from food where name = 'A''s scanned hagelslag')::text),
  ('Deleting removes the recipes they shared too', '0', (select count(*) from recipe where id = (select shared from _ids))::text),
  ('Deleting removes the modules they built', '0', (select count(*) from module where key = 'u_secrettest1')::text),
  ('Deleting removes them from the invite list', '0', (select count(*) from private.signup_allowlist where email = 'sec-a@test.local')::text),
  ('Deleting removes their feed link', '0', (select count(*) from calendar_feed where profile_id = (select pa from _ids))::text),
  ('Deleting removes the calendars they follow', '0', (select count(*) from calendar_subscription where profile_id = (select pa from _ids))::text),
  ('A shared household passes to the remaining member', 'M',
     case when (select owner_id from household where id = (select ha from _ids)) = (select m from _ids) then 'M' else 'lost' end),
  ('The household''s chores stay with the remaining member', '1', (select count(*) from chore where name = 'Hoover the stairs')::text),
  ('The remaining member keeps their own profile', '1',
     (select count(*) from profile where user_id = (select m from _ids))::text);

-- 029 (engineer H): own exercises, training routines, milestones, goal links ---
-- M (still here) keeps an exercise of their own, a goal, a routine with a line
-- under it, a project with a milestone, and a set logged in that routine's
-- session. B, the stranger, tries to read, change and borrow each of them.
create temp table _h (pm uuid, ex uuid, g uuid, r uuid, proj uuid, rb uuid);
grant all on _h to authenticated;
insert into _h (pm) select id from profile where user_id = (select m from _ids) limit 1;

do $$
declare n int; v_ex uuid; v_g uuid; v_r uuid; v_proj uuid;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select m from _ids), 'role', 'authenticated')::text, true);
  insert into exercise (owner_id, name, muscle) values ((select m from _ids), 'M''s cable fly', 'chest') returning id into v_ex;
  insert into goal (profile_id, title, measure_source) values ((select pm from _h), 'M''s private goal', 'linked') returning id into v_g;
  insert into routine (profile_id, name, goal_id, rule, rule_config) values ((select pm from _h), 'M''s push day', v_g, 'weekly', '{"weekdays":[1,4]}') returning id into v_r;
  insert into routine_line (routine_id, exercise_id, sets, reps, reps_max, rest_s) values (v_r, v_ex, 3, 8, 12, 90);
  insert into module_record (profile_id, module_key, entity, data) values ((select pm from _h), 'projects', 'project', '{"name":"M''s project"}') returning id into v_proj;
  insert into milestone (profile_id, project_id, goal_id, title, due_date) values ((select pm from _h), v_proj, v_g, 'M''s milestone', current_date);
  insert into workout_log (profile_id, log_date, exercise_id, routine_id, set_number, reps_achieved) values ((select pm from _h), current_date, v_ex, v_r, 1, 10);
  insert into habit (profile_id, name, goal_id) values ((select pm from _h), 'M''s goal habit', v_g);
  update _h set ex = v_ex, g = v_g, r = v_r, proj = v_proj;

  insert into _r (check_name, expected, actual) values
    ('M sees their own exercise, routine, line and milestone', '1,1,1,1',
       (select count(*) from exercise where name = 'M''s cable fly')::text || ',' || (select count(*) from routine)::text || ','
       || (select count(*) from routine_line)::text || ',' || (select count(*) from milestone)::text);
  begin
    insert into exercise (owner_id, name) values (null, 'Planted in the catalogue');
    insert into _r (check_name, expected, actual) values ('M cannot add to the shared exercise catalogue', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('M cannot add to the shared exercise catalogue', 'denied', 'denied');
  end;
  update exercise set name = 'Renamed by M' where owner_id is null and name = 'Air Squat';
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('M cannot rename a catalogue exercise', '0', n::text);
  begin
    insert into milestone (profile_id, title) values ((select pm from _h), 'Belongs to nothing');
    insert into _r (check_name, expected, actual) values ('A milestone needs a goal or a project', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A milestone needs a goal or a project', 'denied', 'denied');
  end;
  begin
    insert into routine_line (routine_id, sets) values ((select r from _h), 25);
    insert into _r (check_name, expected, actual) values ('A routine line has at most 20 sets', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A routine line has at most 20 sets', 'denied', 'denied');
  end;
  execute 'reset role';
end $$;

do $$
declare n int; v_rb uuid;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('B cannot see M''s own exercise', '0', (select count(*) from exercise where name = 'M''s cable fly')::text),
    ('B cannot see M''s routines or their lines', '0,0', (select count(*) from routine where name = 'M''s push day')::text || ','
       || (select count(*) from routine_line where routine_id = (select r from _h))::text),
    ('B cannot see M''s milestones or goals', '0,0', (select count(*) from milestone where title = 'M''s milestone')::text || ','
       || (select count(*) from goal where title = 'M''s private goal')::text),
    ('B still sees the shared exercise catalogue', 'yes',
       case when (select count(*) from exercise where owner_id is null) > 200 then 'yes' else 'no' end);

  update exercise set name = 'Renamed by B' where id = (select ex from _h);
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('B cannot rename M''s exercise', '0', n::text);
  update routine set name = 'Renamed by B' where id = (select r from _h);
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('B cannot rename M''s routine', '0', n::text);

  begin
    insert into routine (profile_id, name) values ((select pm from _h), 'Planted by B');
    insert into _r (check_name, expected, actual) values ('B cannot put a routine in M''s profile', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot put a routine in M''s profile', 'denied', 'denied');
  end;
  begin
    insert into routine_line (routine_id, sets) values ((select r from _h), 3);
    insert into _r (check_name, expected, actual) values ('B cannot add a line to M''s routine', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot add a line to M''s routine', 'denied', 'denied');
  end;
  begin
    insert into routine (profile_id, name, goal_id) values ((select pb from _ids), 'B''s routine on M''s goal', (select g from _h));
    insert into _r (check_name, expected, actual) values ('B cannot link a routine to M''s goal', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot link a routine to M''s goal', 'denied', 'denied');
  end;
  begin
    insert into habit (profile_id, name, goal_id) values ((select pb from _ids), 'B''s habit on M''s goal', (select g from _h));
    insert into _r (check_name, expected, actual) values ('B cannot link a habit to M''s goal', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot link a habit to M''s goal', 'denied', 'denied');
  end;
  begin
    insert into milestone (profile_id, project_id, title) values ((select pb from _ids), (select proj from _h), 'B on M''s project');
    insert into _r (check_name, expected, actual) values ('B cannot hang a milestone on M''s project', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot hang a milestone on M''s project', 'denied', 'denied');
  end;
  begin
    insert into workout_log (profile_id, log_date, routine_id, set_number) values ((select pb from _ids), current_date, (select r from _h), 1);
    insert into _r (check_name, expected, actual) values ('B cannot log a set under M''s routine', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot log a set under M''s routine', 'denied', 'denied');
  end;

  -- A parent made offline may arrive after its child: that must be the
  -- foreign key's error, which the app retries, not a policy refusal, which
  -- it would drop.
  begin
    insert into routine_line (routine_id, sets) values (gen_random_uuid(), 3);
    insert into _r (check_name, expected, actual) values ('A line whose routine has not arrived yet waits for it', '23503', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A line whose routine has not arrived yet waits for it', '23503', sqlstate);
  end;
  begin
    insert into milestone (profile_id, project_id, title) values ((select pb from _ids), gen_random_uuid(), 'Waiting for its project');
    insert into _r (check_name, expected, actual) values ('A milestone whose project has not arrived yet waits for it', '23503', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A milestone whose project has not arrived yet waits for it', '23503', sqlstate);
  end;
  insert into routine (profile_id, name) values ((select pb from _ids), 'B''s own routine') returning id into v_rb;
  update _h set rb = v_rb;
  begin
    insert into routine_line (routine_id, exercise_id, sets) values (v_rb, (select ex from _h), 3);
    insert into _r (check_name, expected, actual) values ('B cannot use M''s own exercise in a routine', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot use M''s own exercise in a routine', 'denied', 'denied');
  end;
  begin
    insert into routine_line (routine_id, exercise_id, sets, reps) values (v_rb, (select id from exercise where owner_id is null and name = 'Air Squat'), 3, 15);
    insert into _r (check_name, expected, actual) values ('B can build a routine from the shared catalogue', 'allowed', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B can build a routine from the shared catalogue', 'allowed', 'denied');
  end;
  execute 'reset role';
end $$;

delete from routine where id = (select r from _h);
insert into _r (check_name, expected, actual) values
  ('Deleting a routine takes its lines and keeps the logged sets', '0,1',
     (select count(*) from routine_line where routine_id = (select r from _h))::text || ','
     || (select count(*) from workout_log where profile_id = (select pm from _h) and exercise_id = (select ex from _h))::text),
  ('A logged set outlives its routine with no link to it', '0',
     (select count(*) from workout_log where routine_id = (select r from _h))::text);
-- C2 (v16): the NEVO catalogue, replaced foods, units and ready meals (027) ---
declare
  n int;
  old_food uuid := (select id from food where replaced_by is not null and owner_id is null limit 1);
  new_food uuid := (select replaced_by from food where id = (select id from food where replaced_by is not null and owner_id is null limit 1));
  nevo_food uuid := (select id from food where nevo_code is not null limit 1);
  rb uuid;
  got uuid;
  -- A ready meal is a recipe role (one scanned product as one portion).
  insert into recipe (owner_id, name, role) values ((select b from _ids), 'B''s ready lasagne', 'ready') returning id into rb;
    ('A recipe can be a ready meal', 'ready', (select role from recipe where id = rb));
    insert into recipe (owner_id, name, role) values ((select b from _ids), 'B''s odd role', 'elevenses');
    insert into _r (check_name, expected, actual) values ('A recipe role off the list is refused', 'denied', 'allowed');
    insert into _r (check_name, expected, actual) values ('A recipe role off the list is refused', 'denied', 'denied');
  -- The shared catalogue is NEVO's: nobody changes it or adds to it.
  update food set kcal = 1 where id = nevo_food;
  insert into _r (check_name, expected, actual) values ('B cannot change a NEVO food', '0', n::text);
  update food set replaced_by = null, deleted_at = null where id = old_food;
  insert into _r (check_name, expected, actual) values ('B cannot bring back a replaced food', '0', n::text);
    insert into food (owner_id, name, nevo_code) values (null, 'A fake NEVO food', 99999);
    insert into _r (check_name, expected, actual) values ('B cannot add to the shared catalogue', 'denied', 'allowed');
    insert into _r (check_name, expected, actual) values ('B cannot add to the shared catalogue', 'denied', 'denied');
  -- A person's own food never carries a NEVO code or a replacement.
    insert into food (owner_id, name, nevo_code) values ((select b from _ids), 'B''s food passing as NEVO', 99998);
    insert into _r (check_name, expected, actual) values ('An own food cannot carry a NEVO code', 'denied', 'allowed');
    insert into _r (check_name, expected, actual) values ('An own food cannot carry a NEVO code', 'denied', 'denied');
    insert into food (owner_id, name, replaced_by) values ((select b from _ids), 'B''s food pointing away', nevo_food);
    insert into _r (check_name, expected, actual) values ('An own food cannot say it is replaced', 'denied', 'allowed');
    insert into _r (check_name, expected, actual) values ('An own food cannot say it is replaced', 'denied', 'denied');
  -- A copy of a NEVO food is the person's own, saying where it came from.
  insert into food (owner_id, name, kcal, source, source_ref)
    values ((select b from _ids), 'B''s own yoghurt', 60, 'own', 'nevo:' || (select nevo_code from food where id = nevo_food));
    ('An own copy of a NEVO food can be saved', '1', (select count(*) from food where name = 'B''s own yoghurt')::text);
  -- Units with sizes and as-bought weights.
  insert into food (owner_id, name, units) values ((select b from _ids), 'B''s mango',
    '[{"name":"mango","g":200,"bought_g":300,"size":"M","source":"mine"}]'::jsonb);
    ('A unit can carry a size and an as-bought weight', '300', (select units -> 0 ->> 'bought_g' from food where name = 'B''s mango'));
    insert into food (owner_id, name, units) values ((select b from _ids), 'B''s odd mango', '[{"name":"mango","g":200,"bought_g":150}]'::jsonb);
    insert into _r (check_name, expected, actual) values ('As bought cannot weigh less than what is eaten', 'denied', 'allowed');
    insert into _r (check_name, expected, actual) values ('As bought cannot weigh less than what is eaten', 'denied', 'denied');
    insert into food (owner_id, name, units) values ((select b from _ids), 'B''s huge mango', '[{"name":"mango","g":200,"size":"XXL"}]'::jsonb);
    insert into _r (check_name, expected, actual) values ('A unit size off the list is refused', 'denied', 'allowed');
    insert into _r (check_name, expected, actual) values ('A unit size off the list is refused', 'denied', 'denied');
  -- A phone that missed the change still sends the old food: it lands on the replacement.
  insert into food_log (profile_id, log_date, food_id, grams) values ((select pb from _ids), current_date, old_food, 100) returning food_id into got;
    ('A meal logged against a replaced food lands on its replacement', 'new', case when got = new_food then 'new' else coalesce(got::text, 'null') end);
  insert into recipe_line (recipe_id, food_id, grams_per_portion) values (rb, old_food, 50) returning food_id into got;
    ('An ingredient for a replaced food lands on its replacement', 'new', case when got = new_food then 'new' else coalesce(got::text, 'null') end);
  insert into recipe_line (recipe_id, food_id, raw_text) values (rb, null, 'a pinch of saffron');
    ('An ingredient can be kept as text', '1', (select count(*) from recipe_line where recipe_id = rb and raw_text = 'a pinch of saffron')::text);
    insert into recipe_line (recipe_id, raw_text) values (rb, repeat('x', 201));
    insert into _r (check_name, expected, actual) values ('An ingredient''s text keeps to 200 characters', 'denied', 'allowed');
    insert into _r (check_name, expected, actual) values ('An ingredient''s text keeps to 200 characters', 'denied', 'denied');
  -- An activity factor keeps to what can be typed.
    update profile set activity_level = 3 where id = (select pb from _ids);
    insert into _r (check_name, expected, actual) values ('An activity factor of 3 is refused', 'denied', 'allowed');
    insert into _r (check_name, expected, actual) values ('An activity factor of 3 is refused', 'denied', 'denied');
  update profile set activity_level = 1.65 where id = (select pb from _ids);
  insert into _r (check_name, expected, actual) values ('A preset activity factor is kept', '1', n::text);
  ('The catalogue holds NEVO''s 2,328 foods', '2328', (select count(*) from food where nevo_code is not null and deleted_at is null)::text),
  ('Every NEVO food says which NEVO it is', '0', (select count(*) from food where nevo_code is not null and source_version is distinct from 'NEVO-online 2025/9.0')::text),
  ('A replaced food is hidden, not deleted', '0', (select count(*) from food where replaced_by is not null and deleted_at is null)::text),
  ('No ingredient points at a replaced food', '0', (select count(*) from recipe_line l join food f on f.id = l.food_id where f.replaced_by is not null)::text),
  ('The nutrition module has no default meal slots', '{}', (select default_settings::text from module where key = 'nutrition'));

-- The reviewer row made for this run goes (the rollback would take it anyway).
delete from app_admin where user_id = (select m from _ids);

-- Shopping and stock (028): lists, places, prices, and joining a household
-- with a code. Runs after A has left: M now owns A's household, B is still a
-- stranger, and C is a new person who joins with a code and leaves again.
insert into private.signup_allowlist (email) values ('sec-c@test.local');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new, raw_app_meta_data, raw_user_meta_data)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-c@test.local', '', now(), now(), now(),
        '', '', '', '', '{"provider":"email"}', '{}');
create temp table _d (c uuid, hc uuid, code text, code2 text, mfood uuid, bfood uuid);
grant all on _d to authenticated, anon;
insert into _d (c, hc) select u.id, h.id from auth.users u join household h on h.owner_id = u.id where u.email = 'sec-c@test.local';

do $$
declare n int; got text; ok boolean;
begin
  -- M, now the owner, uses the new fields.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select m from _ids), 'role', 'authenticated')::text, true);
  insert into shopping_entry (household_id, name, list, done_until) select ha, 'Washing powder', 'Drugstore', current_date + 3 from _ids;
  insert into shop_price (household_id, shop, item_key, name, price, amount_g) select ha, 'Lidl', 'name:washing powder', 'Washing powder', 7.49, 1500 from _ids;
  insert into food (owner_id, name, kcal) select m, 'M''s scanned stroopwafels', 460 from _ids;
  update _d set mfood = (select id from food where name = 'M''s scanned stroopwafels');
  insert into shopping_entry (household_id, food_id, name) select ha, (select mfood from _d), 'Stroopwafels' from _ids;
  update stock set place = 'Fridge', best_before = current_date + 2, min_grams = 250 where household_id = (select ha from _ids);
  get diagnostics n = row_count;
  insert into _r (check_name, expected, actual) values ('A member can give stock a place, a date and a minimum', '1', n::text);
  begin
    update stock set min_grams = -5 where household_id = (select ha from _ids);
    insert into _r (check_name, expected, actual) values ('A minimum below nothing is refused', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A minimum below nothing is refused', 'denied', 'denied');
  end;
  begin
    insert into shopping_entry (household_id, name, list) select ha, 'Nameless list', '  ' from _ids;
    insert into _r (check_name, expected, actual) values ('A list needs a name', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A list needs a name', 'denied', 'denied');
  end;
  begin
    insert into shop_price (household_id, shop, item_key, price) select ha, 'Lidl', 'name:negative', -1 from _ids;
    insert into _r (check_name, expected, actual) values ('A price below nothing is refused', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A price below nothing is refused', 'denied', 'denied');
  end;
  begin
    insert into shop_price (household_id, shop, item_key, name, price) select ha, 'Lidl', 'name:washing powder', 'Twice', 1 from _ids;
    insert into _r (check_name, expected, actual) values ('One live price per item per shop', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('One live price per item per shop', 'denied', 'denied');
  end;
  select x.code into got from public.create_household_invite((select ha from _ids)) x;
  update _d set code = got;
  insert into _r (check_name, expected, actual) values
    ('The owner gets a code of ten letters and digits', 'yes',
       case when got ~ '^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$' then 'yes' else coalesce(got, 'none') end);
  execute 'reset role';

  insert into _r (check_name, expected, actual) values
    ('A code is kept only as its hash', '0', (select count(*) from private.household_invite where code_hash = (select code from _d))::text),
    ('One live code per household', '1',
       (select count(*) from private.household_invite where household_id = (select ha from _ids) and used_at is null)::text);

  -- B, the stranger, gets nothing and cannot invite themselves in.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('B cannot read A''s household prices', '0', (select count(*) from shop_price where name = 'Washing powder')::text),
    ('B cannot read the list''s other lists', '0', (select count(*) from shopping_entry where list = 'Drugstore')::text),
    ('B cannot read a food on another household''s list', '0', (select count(*) from food where name = 'M''s scanned stroopwafels')::text);
  begin
    insert into shop_price (household_id, shop, item_key, price) select ha, 'Lidl', 'name:planted', 1 from _ids;
    insert into _r (check_name, expected, actual) values ('B cannot write a price into A''s household', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot write a price into A''s household', 'denied', 'denied');
  end;
  begin
    perform public.create_household_invite((select ha from _ids));
    insert into _r (check_name, expected, actual) values ('B cannot make a code for someone else''s household', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot make a code for someone else''s household', 'denied', 'denied');
  end;
  begin
    perform count(*) from private.household_invite;
    insert into _r (check_name, expected, actual) values ('B cannot read the codes', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('B cannot read the codes', 'denied', 'denied');
  end;
  insert into _r (check_name, expected, actual) values ('A made-up code lets nobody in', 'denied',
    (select case when j.household_id is null and j.problem is not null then 'denied' else 'allowed' end from public.join_household('ABCDE-FGHJK') j));
  -- B puts B's own food on B's own list: that must not open it to M.
  insert into food (owner_id, name, kcal) select b, 'B''s secret snack', 500 from _ids;
  update _d set bfood = (select id from food where name = 'B''s secret snack');
  execute 'reset role';
  insert into shopping_entry (household_id, food_id, name)
    select (select household_id from profile where id = (select pb from _ids)), (select bfood from _d), 'Snack';

  -- C joins with the code.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select c from _d), 'role', 'authenticated')::text, true);
  -- Typed in lower case, with the dash: still the code.
  insert into _r (check_name, expected, actual) values
    ('C, joining with the code, lands in M''s household', 'yes',
       (select case when j.household_id = (select ha from _ids) then 'yes' else coalesce(j.problem, 'no') end
          from public.join_household(lower((select code from _d))) j));
  insert into _r (check_name, expected, actual) values
    ('C now sees the household''s list', '1', (select count(*) from shopping_entry where name = 'Washing powder')::text),
    ('C now sees the household''s prices', '1', (select count(*) from shop_price where name = 'Washing powder')::text),
    ('C reads a housemate''s food that is on the list', '1', (select count(*) from food where name = 'M''s scanned stroopwafels')::text),
    ('C sees only their own profile, not M''s', '1', (select count(*) from profile)::text);
  execute 'reset role';
  insert into _r (check_name, expected, actual) values
    ('C is a member, not an owner', 'member',
       (select role from household_member where household_id = (select ha from _ids) and user_id = (select c from _d))),
    ('C''s profile moved to the household', 'yes',
       case when (select household_id from profile where user_id = (select c from _d)) = (select ha from _ids) then 'yes' else 'no' end),
    ('C''s own household is kept', '1', (select count(*) from household where id = (select hc from _d))::text);

  -- M cannot read B's snack through B's list either.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select m from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('M cannot read a food on a stranger''s list', '0', (select count(*) from food where name = 'B''s secret snack')::text);
  begin
    perform public.leave_household((select ha from _ids));
    insert into _r (check_name, expected, actual) values ('The owner cannot leave their own household', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('The owner cannot leave their own household', 'denied', 'denied');
  end;
  execute 'reset role';

  -- The used code works once.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values ('A code works once', 'denied',
    (select case when j.household_id is null then 'denied' else 'allowed' end from public.join_household((select code from _d)) j));
  execute 'reset role';

  -- An old code no longer works.
  insert into private.household_invite (code_hash, household_id, created_by, expires_at)
    select encode(sha256(convert_to('OLDCODE234', 'UTF8')), 'hex'), ha, m, now() - interval '1 minute' from _ids;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values ('A code older than two days lets nobody in', 'denied',
    (select case when j.household_id is null then 'denied' else 'allowed' end from public.join_household('OLDCO-DE234') j));
  -- Guessing is cut off after ten tries an hour: B has tried three times.
  for n in 1..7 loop perform public.join_household('ZZZZZ-ZZZZ' || n); end loop;
  select case when j.problem like 'Too many tries%' then 'stopped' else coalesce(j.problem, 'allowed') end into got
    from public.join_household('ZZZZZ-ZZZZZ') j;
  insert into _r (check_name, expected, actual) values ('The eleventh guess in an hour is stopped', 'stopped', got);
  execute 'reset role';
  insert into _r (check_name, expected, actual) values ('Each guess is counted, even one that failed', '10',
    (select count(*) from private.invite_attempt where user_id = (select b from _ids))::text);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select b from _ids), 'role', 'authenticated')::text, true);
  execute 'reset role';
  insert into _r (check_name, expected, actual) values
    ('B is in no other household after all that', '1',
       (select count(*) from household_member where user_id = (select b from _ids))::text);

  -- C leaves: back home, and the household's list is out of sight.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select c from _d), 'role', 'authenticated')::text, true);
  insert into _r (check_name, expected, actual) values
    ('Leaving brings C back to their own household', 'yes',
       case when public.leave_household((select ha from _ids)) = (select hc from _d) then 'yes' else 'no' end);
  insert into _r (check_name, expected, actual) values
    ('After leaving, C sees the list no more', '0', (select count(*) from shopping_entry where name = 'Washing powder')::text),
    ('After leaving, C sees the prices no more', '0', (select count(*) from shop_price where name = 'Washing powder')::text),
    ('After leaving, C reads the housemate''s food no more', '0', (select count(*) from food where name = 'M''s scanned stroopwafels')::text);
  execute 'reset role';
  insert into _r (check_name, expected, actual) values
    ('C''s profile is back home', 'yes',
       case when (select household_id from profile where user_id = (select c from _d)) = (select hc from _d) then 'yes' else 'no' end);

  -- M invites C again, then takes C out.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select m from _ids), 'role', 'authenticated')::text, true);
  select x.code into got from public.create_household_invite((select ha from _ids)) x;
  update _d set code2 = got;
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select c from _d), 'role', 'authenticated')::text, true);
  perform * from public.join_household((select code2 from _d));
  begin
    perform public.remove_household_member((select ha from _ids), (select m from _ids));
    insert into _r (check_name, expected, actual) values ('A member cannot take the owner out', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('A member cannot take the owner out', 'denied', 'denied');
  end;
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select m from _ids), 'role', 'authenticated')::text, true);
  perform public.remove_household_member((select ha from _ids), (select c from _d));
  execute 'reset role';
  insert into _r (check_name, expected, actual) values
    ('The owner can take a member out', '0',
       (select count(*) from household_member where household_id = (select ha from _ids) and user_id = (select c from _d))::text),
    ('Taken out, their profile goes back home', 'yes',
       case when (select household_id from profile where user_id = (select c from _d)) = (select hc from _d) then 'yes' else 'no' end);

  -- Nobody signed out can try a code at all.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform * from public.join_household('ABCDE-FGHJK');
    insert into _r (check_name, expected, actual) values ('Signed out, no code can be tried', 'denied', 'allowed');
  exception when others then
    insert into _r (check_name, expected, actual) values ('Signed out, no code can be tried', 'denied', 'denied');
  end;
  execute 'reset role';
end $$;

select n, check_name, expected, actual, case when expected = actual then 'ok' else 'FAIL' end as result
from _r order by n;

rollback;
