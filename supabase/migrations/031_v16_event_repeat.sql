-- 031: version 16, repeating own events (AGN-03, integration).
--
-- A person's own agenda event can repeat, with the same rule shapes a
-- repeating task has (the one repeat engine, src/lib/schedule-rules.ts):
-- every day or every N days, weekdays, weekends, chosen weekdays every week
-- or every N weeks, a day of the month, the Nth weekday of the month, once a
-- year, or chosen dates. It ends on a day (end_date) or after a number of
-- times (count), or never. "N times a week" has no days of its own, so an
-- event cannot use it.
--
-- The event row stays one row: its first time is starts_at/ends_at, and the
-- app works out the other days from the rule (Today, Plan, the widget,
-- reminders and the calendar file all read it). Events of a calendar the
-- person follows come from that calendar already laid out, and never repeat
-- here.
--
-- calendar_event already has row-level security (the profile's own) and a
-- touch trigger; no policy changes. Safe to run more than once.

alter table public.calendar_event
  add column if not exists rule text,
  add column if not exists rule_config jsonb not null default '{}'::jsonb,
  add column if not exists end_date date,
  add column if not exists count integer;

do $$ begin
  alter table public.calendar_event add constraint calendar_event_rule_check
    check (rule is null or rule in ('daily','weekdays','weekends','weekly','every_n_weeks','monthly','monthly_nth','yearly','dates'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.calendar_event add constraint calendar_event_rule_config_check
    check (jsonb_typeof(rule_config) = 'object' and pg_column_size(rule_config) <= 16384);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.calendar_event add constraint calendar_event_count_check
    check (count is null or count between 1 and 1000);
exception when duplicate_object then null; end $$;
do $$ begin
  -- A day either side of the start's UTC date: the person's own day may be
  -- the one before or after it.
  alter table public.calendar_event add constraint calendar_event_end_date_check
    check (end_date is null or end_date >= (starts_at at time zone 'UTC')::date - 1);
exception when duplicate_object then null; end $$;
do $$ begin
  -- A followed calendar's events are that calendar's: they never repeat here.
  alter table public.calendar_event add constraint calendar_event_followed_no_rule_check
    check (subscription_id is null or (rule is null and end_date is null and count is null));
exception when duplicate_object then null; end $$;
