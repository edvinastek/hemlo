-- 030: version 16, habits, supplements and chores (engineer B).
--
--  1. A habit can have a colour and a mark of its own (HAB-06), and be kept
--     in a part of the day (morning, afternoon, evening) when it has no
--     clock time (HAB-03).
--  2. A supplement gets a schedule of its own, the same rule shapes a habit
--     has (SUP-03: vitamin D in winter, creatine on training days), with a
--     first and a last day. Its slot is one of the person's own slots
--     (SUP-02), kept in the supplements module's settings, so time_slot is a
--     short key rather than one of three words.
--  3. A chore can be paused between two dates, for a holiday (HSE-08); the
--     days in between are not counted against it.
--
-- Every column is on a table that already has row-level security (habit and
-- supplement: the profile's own; chore: the household's), so no policy
-- changes. Safe to run more than once.

-- 1: habits ------------------------------------------------------------------
alter table public.habit
  add column if not exists colour text,
  add column if not exists mark text,
  add column if not exists day_part text;

do $$ begin
  alter table public.habit add constraint habit_colour_check check (colour is null or colour ~ '^#[0-9a-f]{6}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.habit add constraint habit_mark_check check (mark is null or char_length(mark) between 1 and 2);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.habit add constraint habit_day_part_check check (day_part is null or day_part in ('morning','afternoon','evening'));
exception when duplicate_object then null; end $$;

-- 2: supplements -------------------------------------------------------------
alter table public.supplement
  add column if not exists rule text,
  add column if not exists rule_config jsonb not null default '{}'::jsonb,
  add column if not exists start_date date,
  add column if not exists end_date date;

do $$ begin
  alter table public.supplement add constraint supplement_rule_check
    check (rule is null or rule in ('daily','weekdays','weekends','weekly','every_n_weeks','monthly','monthly_nth','yearly','dates'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.supplement add constraint supplement_rule_config_check
    check (jsonb_typeof(rule_config) = 'object' and pg_column_size(rule_config) <= 16384);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.supplement add constraint supplement_dates_check check (end_date is null or start_date is null or end_date >= start_date);
exception when duplicate_object then null; end $$;
do $$ begin
  -- not valid: rows written before 030 are left as they are; new writes are checked.
  alter table public.supplement add constraint supplement_slot_check check (time_slot is null or time_slot ~ '^[a-z0-9_-]{1,40}$') not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.supplement add constraint supplement_text_check
    check (length(name) between 1 and 120 and (dose_text is null or length(dose_text) <= 60)) not valid;
exception when duplicate_object then null; end $$;

-- 3: chores ------------------------------------------------------------------
alter table public.chore
  add column if not exists paused_from date,
  add column if not exists paused_until date;

do $$ begin
  alter table public.chore add constraint chore_pause_dates_check
    check (paused_until is null or paused_from is null or paused_until >= paused_from);
exception when duplicate_object then null; end $$;
