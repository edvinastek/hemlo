-- GetIt 001: tenancy, profiles, module engine
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------- tenancy -------------------------------------------------------
create table if not exists household (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists household_member (
  household_id uuid not null references household(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  primary key (household_id, user_id)
);

create table if not exists profile (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  sex text check (sex in ('male','female')),
  birth_date date,
  height_cm numeric(5,1),
  activity_level numeric(3,2) default 1.5,
  goal text default 'recomp' check (goal in ('cut','recomp','bulk')),
  timezone text default 'Europe/Amsterdam',
  day_start time default '06:00',
  day_end time default '22:00',
  ai_persona_name text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists profile_household_idx on profile(household_id);

-- ---------- membership helpers (security definer, no RLS recursion) -------
create or replace function app_households()
returns setof uuid language sql stable security definer set search_path = public as $$
  select household_id from household_member where user_id = auth.uid()
$$;

create or replace function app_profiles()
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from profile p
  where p.household_id in (select household_id from household_member where user_id = auth.uid())
$$;

-- ---------- module engine -------------------------------------------------
create table if not exists module (
  key text primary key,
  name text not null,
  version int not null default 1,
  depends_on text[] not null default '{}',
  default_settings jsonb not null default '{}',
  builtin boolean not null default true,
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists module_instance (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  module_key text not null references module(key) on delete cascade,
  enabled boolean not null default true,
  sort_order int not null default 0,
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique (profile_id, module_key)
);

create table if not exists field_definition (
  id uuid primary key default gen_random_uuid(),
  module_key text not null references module(key) on delete cascade,
  profile_id uuid references profile(id) on delete cascade, -- null = built-in
  entity text not null,
  name text not null,
  label text not null,
  type text not null check (type in ('text','number','integer','boolean','date','time','datetime','select','lookup','formula','duration')),
  formula text,
  lookup_source text,
  options jsonb,
  required boolean not null default false,
  sort_order int not null default 0
);

create table if not exists view_definition (
  id uuid primary key default gen_random_uuid(),
  module_key text not null references module(key) on delete cascade,
  profile_id uuid references profile(id) on delete cascade,
  key text not null,
  name text not null,
  type text not null check (type in ('list','table','calendar','board','grid','chart','form')),
  entity text not null,
  filters jsonb not null default '{}',
  columns jsonb not null default '[]',
  sort_order int not null default 0
);

create table if not exists rule_definition (
  id uuid primary key default gen_random_uuid(),
  module_key text not null references module(key) on delete cascade,
  profile_id uuid references profile(id) on delete cascade,
  name text not null,
  condition jsonb not null default '{}',
  action jsonb not null default '{}',
  locked boolean not null default false,
  enabled boolean not null default true
);

create table if not exists template (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid references auth.users(id) on delete cascade,
  modules jsonb not null default '[]',
  settings jsonb not null default '{}',
  shared boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- generic record store for custom module data -------------------
create table if not exists module_record (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  module_key text not null references module(key) on delete cascade,
  entity text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists module_record_lookup on module_record(profile_id, module_key, entity);
