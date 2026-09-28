-- GetIt 020: calendar links, both ways, without Google's API.
--
-- 1. GetIt → Google Calendar: a private feed link. Google Calendar ("From
--    URL") reads it every few hours, with no sign-in, so the link itself is
--    the key. Only a SHA-256 hash of it is kept here; the link is shown to
--    the person once, when it is made, and a new one can be made at any
--    time, which stops the old one. The feed is served by the calendar-feed
--    function (supabase/functions/calendar-feed), which looks the hash up.
--
-- 2. Google Calendar → GetIt: a calendar the person follows, by its secret
--    iCal address. The address is kept here so it follows the person to
--    every device; the calendar-fetch function reads it for them (a browser
--    may not), and the events are kept on the device only (see
--    src/lib/calendar-links.ts). calendar_event gains the columns such an
--    event carries, so the local rows and the table have the same shape.

create extension if not exists pgcrypto with schema extensions;

-- 1. The feed ------------------------------------------------------------------
create table if not exists public.calendar_feed (
  profile_id uuid primary key references public.profile(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);
alter table public.calendar_feed enable row level security;

-- The owner may see that a feed exists and when it was made, and turn it off.
-- The hash is never readable through the API, not even by the owner, and no
-- one writes a row directly: rotate_calendar_feed() does that.
revoke all on public.calendar_feed from public, anon, authenticated;
grant select (profile_id, created_at, rotated_at) on public.calendar_feed to authenticated;
grant delete on public.calendar_feed to authenticated;
-- The calendar-feed function looks the hash up with the service role.
grant select on public.calendar_feed to service_role;

drop policy if exists calendar_feed_read on public.calendar_feed;
create policy calendar_feed_read on public.calendar_feed for select to authenticated
  using (profile_id in (select private.my_profiles()));
drop policy if exists calendar_feed_delete on public.calendar_feed;
create policy calendar_feed_delete on public.calendar_feed for delete to authenticated
  using (profile_id in (select private.my_profiles()));

-- Make a feed link for a profile, or a new one in place of the old. Returns
-- the link's token once; only its hash stays. 32 random bytes, base64url.
create or replace function public.rotate_calendar_feed(p uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  token text;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p is null or p not in (select private.my_profiles()) then
    raise exception 'No such profile' using errcode = '42501';
  end if;
  token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.calendar_feed (profile_id, token_hash)
  values (p, encode(sha256(convert_to(token, 'UTF8')), 'hex'))
  on conflict (profile_id) do update
    set token_hash = excluded.token_hash, rotated_at = now();
  return token;
end $$;
revoke all on function public.rotate_calendar_feed(uuid) from public, anon;
grant execute on function public.rotate_calendar_feed(uuid) to authenticated;

-- 2. Calendars a person follows ---------------------------------------------------
create table if not exists public.calendar_subscription (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profile(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  -- A secure web address, nothing else: the server fetches it.
  url text not null check (length(url) <= 2048 and url ~ '^https://[^[:space:]]+$'),
  colour text not null default '#6d7198' check (colour ~ '^#[0-9a-f]{6}$'),
  last_synced_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists calendar_subscription_profile_idx on public.calendar_subscription (profile_id);
create index if not exists calendar_subscription_updated_idx on public.calendar_subscription (updated_at);
drop trigger if exists calendar_subscription_touch on public.calendar_subscription;
create trigger calendar_subscription_touch before update on public.calendar_subscription
  for each row execute function public.touch_updated_at();

alter table public.calendar_subscription enable row level security;
-- New tables inherit full grants (010); state them instead.
revoke all on public.calendar_subscription from public, anon, authenticated;
grant select, insert, update, delete on public.calendar_subscription to authenticated;
drop policy if exists calendar_subscription_mine on public.calendar_subscription;
create policy calendar_subscription_mine on public.calendar_subscription for all to authenticated
  using (profile_id in (select private.my_profiles()))
  with check (profile_id in (select private.my_profiles()));

-- Events from a followed calendar: which calendar, and the event's own UID.
-- The app keeps these on the device and does not send them, but the table
-- has the same shape, and the rules below hold if one ever arrives.
alter table public.calendar_event
  add column if not exists subscription_id uuid references public.calendar_subscription(id) on delete cascade,
  add column if not exists external_uid text;
alter table public.calendar_event drop constraint if exists calendar_event_external_uid_check;
alter table public.calendar_event add constraint calendar_event_external_uid_check
  check (external_uid is null or length(external_uid) <= 1024);
create unique index if not exists calendar_event_subscription_uid_idx
  on public.calendar_event (subscription_id, external_uid, starts_at) where subscription_id is not null;

-- An event can only point at a calendar its own profile follows. A foreign
-- key alone is checked without row-level security, so without this anyone
-- who learnt another person's subscription id could hang rows off it.
create or replace function private.calendar_event_subscription_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.subscription_id is not null and not exists (
    select 1 from public.calendar_subscription s
    where s.id = new.subscription_id and s.profile_id = new.profile_id) then
    raise exception 'That calendar is not followed by this profile' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.calendar_event_subscription_guard() from public, anon, authenticated;
drop trigger if exists calendar_event_subscription_guard on public.calendar_event;
create trigger calendar_event_subscription_guard before insert or update of subscription_id, profile_id on public.calendar_event
  for each row execute function private.calendar_event_subscription_guard();

-- Defence in depth, as in 017: no TRUNCATE, TRIGGER or REFERENCES through the API.
revoke truncate, trigger, references on public.calendar_feed, public.calendar_subscription from anon, authenticated;

-- delete_my_account() needs no change: both tables cascade from profile.
