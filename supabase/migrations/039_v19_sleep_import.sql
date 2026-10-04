-- 039: where an imported night came from (version 19: SLP-05).
--
-- Sleep can import nights from Health Connect on Android. Each imported night
-- keeps the Health Connect ids of the sessions it was made from, as
-- 'hc:<id>[,<id>…]', so importing the same days again skips them, even after
-- the night was deleted (the person deleted it on purpose). A night typed in
-- the app has none. A row is synced whole when it is new, so this has to be
-- a column of its own rather than something kept only on the phone.
--
-- Nothing else changes: the row stays the person's (sleep_log_mine), and the
-- length check keeps a broken client from storing anything large here.
-- Safe to run more than once.

alter table public.sleep_log add column if not exists import_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sleep_log_import_id_check') then
    alter table public.sleep_log add constraint sleep_log_import_id_check
      check (import_id is null or (length(import_id) <= 400 and import_id ~ '^[a-z]+:'));
  end if;
end $$;

comment on column public.sleep_log.import_id is
  'Where an imported night came from: hc:<Health Connect record ids>. Null for a night typed in the app.';
