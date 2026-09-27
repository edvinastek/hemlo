-- Batch 2: every module gets a real page, modules can be edited, and people
-- can build their own.
--
-- A module the person builds is a row in `module` (builtin = false) owned by
-- them, carrying its whole definition (fields, views, rules, keywords, colour)
-- as JSON. Its records live in `module_record`, one JSON value each. Both sync
-- like everything else, so they need updated_at and a deletion that syncs.

alter table public.module
  add column if not exists definition jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

-- Keys the person makes are "u_" and a short random part, so they can never
-- collide with a built-in module added in a later version.
alter table public.module drop constraint if exists module_custom_key_check;
alter table public.module add constraint module_custom_key_check
  check (builtin or key ~ '^u_[a-z0-9]{6,24}$');
alter table public.module drop constraint if exists module_name_check;
alter table public.module add constraint module_name_check
  check (length(name) between 1 and 60);
-- A definition is bounded so one row can never become a storage bin.
alter table public.module drop constraint if exists module_definition_size_check;
alter table public.module add constraint module_definition_size_check
  check (pg_column_size(definition) <= 65536);

drop trigger if exists module_touch on public.module;
create trigger module_touch before update on public.module
  for each row execute function public.touch_updated_at();
create index if not exists module_updated_idx on public.module (updated_at);

-- Records: a date (for Today, the calendar views and Stats) and a size limit.
alter table public.module_record
  add column if not exists record_date date;
alter table public.module_record alter column updated_at set default now();
update public.module_record set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null;
alter table public.module_record alter column updated_at set not null;
alter table public.module_record drop constraint if exists module_record_size_check;
alter table public.module_record add constraint module_record_size_check
  check (pg_column_size(data) <= 16384 and length(entity) between 1 and 60);
drop trigger if exists module_record_touch on public.module_record;
create trigger module_record_touch before update on public.module_record
  for each row execute function public.touch_updated_at();
create index if not exists module_record_profile_idx on public.module_record (profile_id, module_key, record_date);
create index if not exists module_record_updated_idx on public.module_record (updated_at);

-- Sleep and training logs become editable from their pages, so a deletion
-- has to reach other devices too.
alter table public.sleep_log add column if not exists deleted_at timestamptz;
alter table public.workout_log add column if not exists deleted_at timestamptz;

-- Deleting an account must take the modules it made with it (records go with
-- the profile already). created_by was "set null"; a module nobody owns
-- would linger unread forever.
alter table public.module drop constraint if exists module_created_by_fkey;
alter table public.module add constraint module_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;
