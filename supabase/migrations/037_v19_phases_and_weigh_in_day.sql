-- 037: version 19, engineer X3: training phases and Health's weigh-in day.
--
--  1. Training phases (TRN-07) use the phase table of 002, unused until now.
--     Its row-level security is already right (012: phase_mine, your
--     profiles and the ones you manage); what it lacked was what every
--     synced table has: updated_at (moved on each change by the touch
--     trigger, which is how a device asks "what changed since") and
--     deleted_at (a deletion is a soft one, so it reaches other devices).
--     A phase also gets a colour for its band (one of the app's swatches,
--     written as '#rrggbb'), and limits like the other tables': a name of
--     1 to 60 characters, an end on or after the start and at most a year
--     long, a small template object.
--  2. The weigh-in day (HLT-05) is kept in each profile's Health settings
--     (module_instance.settings.weigh_in_day, 0 = Sunday, absent = any day).
--     The module catalogue's default of 009, {"weigh_in_day":1}, was never
--     read; the app's default is any day, so the catalogue says the same.
--
-- Safe to run more than once.

-- 1: phases ------------------------------------------------------------------------------
alter table public.phase
  add column if not exists colour text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

do $$ begin
  alter table public.phase add constraint phase_v19_check check (
        length(btrim(name)) between 1 and 60
    and (end_date is null or (end_date >= start_date and end_date - start_date < 371))
    and (colour is null or colour ~ '^#[0-9a-f]{6}$')
    and jsonb_typeof(template) = 'object' and pg_column_size(template) <= 4096) not valid;
exception when duplicate_object then null; end $$;

create index if not exists phase_profile_idx on public.phase (profile_id, updated_at);

drop trigger if exists phase_touch on public.phase;
create trigger phase_touch before update on public.phase for each row execute function public.touch_updated_at();

alter table public.phase enable row level security;
revoke all on public.phase from anon;
grant select, insert, update, delete on public.phase to authenticated;

-- 2: the weigh-in day's default --------------------------------------------------------------
update public.module set default_settings = default_settings - 'weigh_in_day'
 where key = 'health' and default_settings ? 'weigh_in_day';
