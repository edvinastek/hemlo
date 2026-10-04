-- Proof for migration 039 (sleep_log.import_id), run against the local database:
--   psql -h /home/pgtest/<name> -p <port> -U postgres postgres -f supabase/tests/039_sleep_import.sql
-- Expect: own import saved; typed night null; two check-constraint errors (no prefix, too long);
-- the stranger sees 0 rows and updates 0. Rolls back.
\set ON_ERROR_STOP 0
begin;
insert into private.signup_allowlist (email) values ('x5-a@test.local'), ('x5-b@test.local');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, raw_app_meta_data, raw_user_meta_data)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now(),
  '', '', '', '', '{"provider":"email"}', '{}' from unnest(array['x5-a@test.local','x5-b@test.local']) e;
create temp table ids as select (select p.id from profile p join auth.users u on u.id = p.user_id where u.email='x5-a@test.local') pa,
  (select u.id from auth.users u where u.email='x5-a@test.local') a, (select u.id from auth.users u where u.email='x5-b@test.local') b;
grant select on ids to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select a from ids), 'role', 'authenticated')::text, true);
-- A inserts an imported night with its Health Connect ids, as the app's sync does (whole row).
insert into sleep_log (profile_id, log_date, went_to_bed, woke_at, hours, import_id)
  select pa, '2026-10-02', '23:10', '06:40', 7.25, 'hc:abc-1,def-2' from ids;
select 'own import saved: ' || (select import_id from sleep_log where log_date = '2026-10-02') as result;
-- A night typed in the app needs none.
insert into sleep_log (profile_id, log_date, went_to_bed, woke_at, hours) select pa, '2026-10-03', '23:00', '07:00', 8 from ids;
select 'typed night: ' || coalesce((select import_id from sleep_log where log_date = '2026-10-03'), 'null') as result;
savepoint s1;
update sleep_log set import_id = 'no prefix' where log_date = '2026-10-03';
rollback to s1;
savepoint s2;
update sleep_log set import_id = 'hc:' || repeat('x', 500) where log_date = '2026-10-03';
rollback to s2;
-- B cannot read or change A's import.
select set_config('request.jwt.claims', json_build_object('sub', (select b from ids), 'role', 'authenticated')::text, true);
select 'stranger sees ' || count(*) || ' rows' as result from sleep_log where import_id is not null;
update sleep_log set import_id = 'hc:taken' where import_id is not null;
reset role;
select 'after stranger update: ' || (select import_id from sleep_log where log_date = '2026-10-02') as result;
rollback;
