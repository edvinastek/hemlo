-- GetIt 002: core planner — goals, phases, series, tasks, notes, reviews
create table if not exists goal (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  title text not null,
  measure_type text check (measure_type in ('count','amount','duration','boolean','weight')),
  measure_target numeric,
  measure_unit text,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active','done','dropped','paused')),
  horizon text not null default 'year' check (horizon in ('week','month','quarter','year','multi_year')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists goal_profile_idx on goal(profile_id) where deleted_at is null;

create table if not exists milestone (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goal(id) on delete cascade,
  title text not null,
  due_date date,
  done boolean not null default false,
  sort_order int not null default 0
);

create table if not exists phase (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date,
  template jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists series (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  title text not null,
  rule text not null,                       -- daily | weekdays | weekly | every_n_weeks | monthly
  rule_config jsonb not null default '{}',  -- {n:2, weekdays:[1,3,5], day_of_month:15}
  start_date date not null,
  end_date date,
  occurrence_count int,
  time_of_day time,
  task_template jsonb not null default '{}',
  module_key text references module(key) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists series_exception (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  exception_date date not null,
  action text not null check (action in ('skip','move','change')),
  moved_to date,
  changes jsonb not null default '{}',
  unique (series_id, exception_date)
);

create table if not exists away_period (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  reason text
);

create table if not exists task (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  title text not null,
  category text,
  module_key text references module(key) on delete set null,
  horizon text not null default 'day' check (horizon in ('day','week','month','quarter','year')),
  goal_id uuid references goal(id) on delete set null,
  series_id uuid references series(id) on delete set null,
  duration_min int,
  total_effort_min int,
  daily_quota_min int,
  fixed boolean not null default false,
  locked boolean not null default false,
  planned_date date,
  planned_time time,
  start_date date,
  due_date date,
  sort_order int not null default 0,
  status text not null default 'todo' check (status in ('todo','done','pushed','stuck','dropped')),
  push_count int not null default 0,
  extension_count int not null default 0,
  needs_review boolean not null default false,
  source text not null default 'manual' check (source in ('meal','workout','habit','manual','ai','module','shopping')),
  source_ref uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz
);
create index if not exists task_day_idx on task(profile_id, planned_date) where deleted_at is null;
create index if not exists task_review_idx on task(profile_id) where needs_review and deleted_at is null;

create table if not exists task_event (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references task(id) on delete cascade,
  at timestamptz not null default now(),
  type text not null check (type in ('pushed','ticked','rescheduled','dropped','extended','created','unticked')),
  from_value text,
  to_value text
);

create table if not exists extension_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references task(id) on delete cascade,
  goal_id uuid references goal(id) on delete cascade,
  at timestamptz not null default now(),
  from_date date, to_date date,
  from_effort_min int, to_effort_min int,
  reason text
);

create table if not exists calendar_event (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists note_section (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  name text not null,
  sort_order int not null default 0
);

create table if not exists note_page (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references note_section(id) on delete cascade,
  title text not null,
  blocks jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists review (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  level text not null check (level in ('day','week','month','quarter','year')),
  period_start date not null,
  period_end date not null,
  ai_draft text,
  notes text,
  completed_at timestamptz,
  unique (profile_id, level, period_start)
);

create table if not exists reminder (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references task(id) on delete cascade,
  profile_id uuid not null references profile(id) on delete cascade,
  channel text not null default 'push' check (channel in ('push','telegram','none')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  reply text,
  action_taken text
);

create table if not exists channel_setting (
  profile_id uuid primary key references profile(id) on delete cascade,
  push_on boolean not null default false,
  telegram_on boolean not null default false,
  telegram_chat_id text,
  quiet_from time default '22:00',
  quiet_to time default '07:00',
  review_time time default '21:00',
  extension_limit int not null default 3,
  detail_window_weeks int not null default 8,
  history_months int not null default 12
);
