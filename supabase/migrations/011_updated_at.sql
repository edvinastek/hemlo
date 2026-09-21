-- GetIt 011: every synced table needs updated_at, because that column is how
-- a device asks "what changed since I was last online".
alter table target    add column if not exists updated_at timestamptz not null default now();
alter table body_log  add column if not exists updated_at timestamptz not null default now();
alter table food_log  add column if not exists updated_at timestamptz not null default now();
alter table habit     add column if not exists updated_at timestamptz not null default now();
alter table habit_log add column if not exists updated_at timestamptz not null default now();
alter table supplement add column if not exists updated_at timestamptz not null default now();
alter table supplement_log add column if not exists updated_at timestamptz not null default now();
alter table sleep_log add column if not exists updated_at timestamptz not null default now();
alter table workout_log add column if not exists updated_at timestamptz not null default now();
alter table shopping_item add column if not exists updated_at timestamptz not null default now();
alter table food      add column if not exists deleted_at timestamptz;

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profile','task','target','body_log','food_log','module_instance','goal','series',
    'meal_plan_slot','habit','habit_log','supplement','supplement_log','sleep_log',
    'workout_log','shopping_trip','shopping_item','calendar_event','note_page','food','recipe'
  ] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;
