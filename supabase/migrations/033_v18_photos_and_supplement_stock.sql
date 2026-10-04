-- 033: version 18, photos on built modules' records and supplement stock (engineer W3).
--
--  1. A supplement can keep a stock count (SUP-05): how many doses were in
--     the pack at the start of a day, from which day, and how many days
--     before it runs out a refill reminder comes. The doses left are worked
--     out on the device from the ticks since that day, so two phones ticking
--     offline never lose a dose: no count is ever written by a tick.
--     Columns rather than the module's settings: a settings value is one
--     JSON object rewritten whole, so a count changed on one phone would
--     undo a refill typed on another; a row's columns merge field by field.
--  2. A photo field for built modules (MOD-12): photos go in a private
--     Storage bucket, 'record-photos', under '<profile id>/<record id>/<file>'.
--     Only the people who can see the record can see its photo: the profile's
--     own user, and the owner of the household for a profile they manage,
--     exactly as module_record's own policy (private.my_profiles()).
--     JPEG only, at most 2 MB (the app makes them about 1600 px, 80 %).
--
-- Safe to run more than once. The Storage part runs only where Supabase
-- Storage is present (a plain Postgres stand-in skips it with a notice).

-- 1: supplement stock ----------------------------------------------------------
alter table public.supplement
  add column if not exists stock_count numeric,
  add column if not exists stock_from date,
  add column if not exists refill_days integer;

do $$ begin
  alter table public.supplement add constraint supplement_stock_check
    check ((stock_count is null or (stock_count >= 0 and stock_count < 100000))
       and (refill_days is null or refill_days between 0 and 365)
       and (stock_count is null or stock_from is not null));
exception when duplicate_object then null; end $$;

-- 2: photos ------------------------------------------------------------------------
-- The profile a photo belongs to: the first folder of its name, when that is
-- a profile id. Anything else belongs to nobody, so no policy can match it.
create or replace function private.photo_profile(object_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              and split_part(object_name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              and split_part(object_name, '/', 3) ~ '^[0-9a-f-]{36}\.jpg$'
              and split_part(object_name, '/', 4) = ''
         then split_part(object_name, '/', 1)::uuid end
$$;
revoke all on function private.photo_profile(text) from public, anon;
grant execute on function private.photo_profile(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice '033: no Storage here; the record-photos bucket and its policies are left for the live project';
    return;
  end if;

  execute $q$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('record-photos', 'record-photos', false, 2097152, array['image/jpeg'])
    on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg']
  $q$;

  execute 'drop policy if exists record_photos_read on storage.objects';
  execute 'drop policy if exists record_photos_insert on storage.objects';
  execute 'drop policy if exists record_photos_update on storage.objects';
  execute 'drop policy if exists record_photos_delete on storage.objects';

  execute $q$
    create policy record_photos_read on storage.objects for select to authenticated
      using (bucket_id = 'record-photos' and private.photo_profile(name) in (select private.my_profiles()))
  $q$;
  execute $q$
    create policy record_photos_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'record-photos' and private.photo_profile(name) in (select private.my_profiles()))
  $q$;
  -- A photo is never changed in place: a new one gets a new name. An upsert
  -- of the same file (a retried upload) needs update on one's own.
  execute $q$
    create policy record_photos_update on storage.objects for update to authenticated
      using (bucket_id = 'record-photos' and private.photo_profile(name) in (select private.my_profiles()))
      with check (bucket_id = 'record-photos' and private.photo_profile(name) in (select private.my_profiles()))
  $q$;
  execute $q$
    create policy record_photos_delete on storage.objects for delete to authenticated
      using (bucket_id = 'record-photos' and private.photo_profile(name) in (select private.my_profiles()))
  $q$;
end $$;
