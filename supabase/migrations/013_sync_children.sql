-- GetIt 013: every table a device keeps a copy of carries updated_at, so it
-- can ask for what changed. series_exception was the last one without it.
alter table public.series_exception add column if not exists updated_at timestamptz not null default now();
alter table public.series_exception add column if not exists deleted_at timestamptz;
alter table public.habit add column if not exists deleted_at timestamptz;
alter table public.supplement add column if not exists deleted_at timestamptz;
alter table public.body_log add column if not exists deleted_at timestamptz;
alter table public.target add column if not exists deleted_at timestamptz;

drop trigger if exists series_exception_touch on public.series_exception;
create trigger series_exception_touch before update on public.series_exception
  for each row execute function public.touch_updated_at();
