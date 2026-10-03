-- 029: version 16, finishing the built-in modules (engineer H).
--
--  1. Own exercises: a muscle group, and the columns the sync needs, so an
--     exercise a person adds is kept on the phone and follows them.
--  2. Training routines: a named list of exercises with target sets and reps,
--     and an optional schedule that puts the session on the planner as a
--     task (through a task series). A logged set can say which routine's
--     session it belonged to.
--  3. Milestones belong to a profile and to a goal or a project (a Projects
--     record), and sync like everything else.
--  4. Goals get a note, where their progress comes from, a current and a
--     starting value, and an order; a habit can be linked to a goal.
--
-- Finance categories, budgets and planned payments, the sleep target, the
-- reading list and study blocks live in the module's own settings and
-- records (module_instance.settings, module_record), which already sync.
--
-- Safe to run more than once.

-- 1: own exercises -------------------------------------------------------------
alter table public.exercise
  add column if not exists muscle text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;
do $$ begin
  alter table public.exercise add constraint exercise_muscle_check
    check (muscle is null or muscle in ('chest','back','shoulders','arms','legs','glutes','core','full_body','cardio','mobility'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.exercise add constraint exercise_lengths_check
    check (length(btrim(name)) between 1 and 120 and (equipment is null or length(equipment) <= 40)
           and (notes is null or length(notes) <= 1000));
exception when duplicate_object then null; end $$;
create index if not exists exercise_updated_idx on public.exercise (updated_at);
drop trigger if exists exercise_touch on public.exercise;
create trigger exercise_touch before update on public.exercise for each row execute function public.touch_updated_at();

-- 2: routines --------------------------------------------------------------------
create table if not exists public.routine (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profile(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  note text check (note is null or length(note) <= 4000),
  -- When the session is planned: the same rule shapes a repeating task has
  -- (no "N times a week": a session on the planner has a day). None: the
  -- routine is started by hand.
  rule text check (rule is null or rule in ('daily','weekdays','weekends','weekly','every_n_weeks','monthly','monthly_nth','yearly','dates')),
  rule_config jsonb not null default '{}'::jsonb check (jsonb_typeof(rule_config) = 'object' and pg_column_size(rule_config) <= 16384),
  start_date date,
  end_date date,
  time_of_day time,
  minutes int check (minutes is null or minutes between 1 and 600),
  -- The task series that puts the planned sessions on the planner.
  series_id uuid references public.series(id) on delete set null,
  goal_id uuid references public.goal(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists routine_profile_idx on public.routine (profile_id, updated_at);

create table if not exists public.routine_line (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routine(id) on delete cascade,
  exercise_id uuid references public.exercise(id) on delete set null,
  sets int not null default 3 check (sets between 1 and 20),
  -- Target reps, or a range "8 to 12" with reps_max.
  reps int check (reps is null or reps between 1 and 1000),
  reps_max int check (reps_max is null or reps_max between 1 and 1000),
  load_kg numeric(6,2) check (load_kg is null or (load_kg >= 0 and load_kg <= 1000)),
  seconds int check (seconds is null or seconds between 1 and 86400),
  -- Rest after each set, for the timer that starts on ticking a set.
  rest_s int check (rest_s is null or rest_s between 0 and 1800),
  note text check (note is null or length(note) <= 500),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists routine_line_updated_idx on public.routine_line (updated_at);
create index if not exists routine_line_routine_idx on public.routine_line (routine_id);

alter table public.workout_log add column if not exists routine_id uuid references public.routine(id) on delete set null;

alter table public.routine enable row level security;
alter table public.routine_line enable row level security;

drop policy if exists routine_mine on public.routine;
create policy routine_mine on public.routine for all to authenticated
  using (profile_id in (select private.my_profiles()))
  with check (profile_id in (select private.my_profiles())
              and (series_id is null or series_id in (select id from public.series))
              and (goal_id is null or goal_id in (select id from public.goal)));
-- A line is reachable exactly when its routine is, and may only name an
-- exercise its writer can see (the catalogue's or their own).
drop policy if exists routine_line_mine on public.routine_line;
create policy routine_line_mine on public.routine_line for all to authenticated
  using (routine_id in (select id from public.routine))
  with check (routine_id in (select id from public.routine)
              and (exercise_id is null or exercise_id in (select id from public.exercise)));
-- A logged set may only point at a routine of the same person.
drop policy if exists workout_log_routine on public.workout_log;
create policy workout_log_routine on public.workout_log as restrictive for all to authenticated
  using (true)
  with check (routine_id is null or routine_id in (select id from public.routine));

revoke all on public.routine, public.routine_line from anon;
grant select, insert, update, delete on public.routine, public.routine_line to authenticated;

drop trigger if exists routine_touch on public.routine;
create trigger routine_touch before update on public.routine for each row execute function public.touch_updated_at();
drop trigger if exists routine_line_touch on public.routine_line;
create trigger routine_line_touch before update on public.routine_line for each row execute function public.touch_updated_at();

-- 3: milestones ------------------------------------------------------------------
alter table public.milestone
  add column if not exists profile_id uuid references public.profile(id) on delete cascade,
  add column if not exists project_id uuid references public.module_record(id) on delete cascade,
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;
alter table public.milestone alter column goal_id drop not null;
update public.milestone m set profile_id = g.profile_id
  from public.goal g where m.goal_id = g.id and m.profile_id is null;
delete from public.milestone where profile_id is null;
alter table public.milestone alter column profile_id set not null;
do $$ begin
  alter table public.milestone add constraint milestone_parent_check check (goal_id is not null or project_id is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.milestone add constraint milestone_lengths_check
    check (length(btrim(title)) between 1 and 120 and (note is null or length(note) <= 1000));
exception when duplicate_object then null; end $$;
create index if not exists milestone_profile_idx on public.milestone (profile_id, updated_at);

drop policy if exists milestone_mine on public.milestone;
drop policy if exists milestone_own on public.milestone;
create policy milestone_mine on public.milestone for all to authenticated
  using (profile_id in (select private.my_profiles()))
  with check (profile_id in (select private.my_profiles())
              and (goal_id is null or goal_id in (select id from public.goal))
              and (project_id is null or project_id in (select id from public.module_record where module_key = 'projects')));
revoke all on public.milestone from anon;
grant select, insert, update, delete on public.milestone to authenticated;
drop trigger if exists milestone_touch on public.milestone;
create trigger milestone_touch before update on public.milestone for each row execute function public.touch_updated_at();

-- 4: goals and what links to them --------------------------------------------------
alter table public.goal
  add column if not exists note text,
  -- Where progress comes from: a number the person updates ('manual'), the
  -- linked tasks, projects and habits ('linked'), or the body weight ('weight').
  add column if not exists measure_source text not null default 'manual',
  add column if not exists measure_current numeric(12,2),
  add column if not exists measure_start numeric(12,2),
  add column if not exists sort_order int not null default 0;
do $$ begin
  alter table public.goal add constraint goal_measure_source_check check (measure_source in ('manual','linked','weight'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.goal add constraint goal_lengths_check
    check (length(btrim(title)) between 1 and 120 and (note is null or length(note) <= 4000)
           and (measure_unit is null or length(measure_unit) <= 16));
exception when duplicate_object then null; end $$;

alter table public.habit add column if not exists goal_id uuid references public.goal(id) on delete set null;
-- A habit may only be linked to a goal of the same person.
drop policy if exists habit_goal on public.habit;
create policy habit_goal on public.habit as restrictive for all to authenticated
  using (true)
  with check (goal_id is null or goal_id in (select id from public.goal));
