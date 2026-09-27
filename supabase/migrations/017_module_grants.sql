-- People can now write the modules they build; row-level security (012)
-- already limits that to their own, non-built-in rows.
grant insert, update, delete on public.module to authenticated;

-- Defence in depth: TRUNCATE is not covered by row-level security, and nothing
-- in the app needs it, TRIGGER or REFERENCES. The API does not expose them
-- today; this makes sure no future function or client ever can.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
