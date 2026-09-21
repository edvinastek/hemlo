-- GetIt 009: the module catalogue, and what happens when someone signs up.

insert into module (key, name, depends_on, default_settings) values
  ('core',        'Core',              '{}',        '{}'),
  ('nutrition',   'Nutrition',         '{}',        '{"meal_slots":["breakfast","lunch","snack","dinner"]}'),
  ('shopping',    'Shopping',          '{}',        '{"trip_days":[3,6]}'),
  ('training',    'Training',          '{}',        '{}'),
  ('habits',      'Habits',            '{}',        '{}'),
  ('supplements', 'Supplements',       '{}',        '{"slots":["morning","evening"]}'),
  ('health',      'Health and body',   '{}',        '{"weigh_in_day":1}'),
  ('learning',    'Learning and reading','{}',      '{}'),
  ('agenda',      'Agenda',            '{}',        '{}'),
  ('sleep',       'Sleep',             '{}',        '{"target_hours":8,"bedtime":"22:00"}'),
  ('projects',    'Projects',          '{}',        '{}'),
  ('finance',     'Finance',           '{}',        '{}'),
  ('household',   'Household',         '{}',        '{}'),
  ('custom',      'Custom',            '{}',        '{}')
on conflict (key) do nothing;

-- A new account gets a household, a default profile, the eight modules of the
-- default setup switched on and the rest available but off, and the spec's
-- defaults for review time, extension limit and horizon windows.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare h uuid; p uuid;
begin
  insert into household (name, owner_id) values ('Home', new.id) returning id into h;
  insert into household_member (household_id, user_id, role) values (h, new.id, 'owner');

  insert into profile (household_id, user_id, name, is_default, timezone)
  values (h, new.id, coalesce(split_part(new.email, '@', 1), 'Me'), true, 'Europe/Amsterdam')
  returning id into p;

  insert into channel_setting (profile_id) values (p);

  insert into module_instance (profile_id, module_key, enabled, sort_order)
  select p, m.key,
         m.key in ('core','nutrition','shopping','training','habits','supplements','health','learning','agenda'),
         row_number() over (order by m.key)
  from module m;

  insert into note_section (profile_id, name, sort_order) values (p, 'Notes', 0);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
