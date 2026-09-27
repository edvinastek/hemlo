-- Stats is a module like any other: switched on per profile, with its own
-- page. Module switches point at this table, so the key has to exist here.
insert into public.module (key, name, builtin, version, default_settings)
values ('stats', 'Stats', true, 1, '{}'::jsonb)
on conflict (key) do nothing;
