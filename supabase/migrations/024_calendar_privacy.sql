-- GetIt 024: a followed calendar's secret address is wiped when it is removed.
--
-- Removing a followed calendar marks its row deleted rather than deleting it,
-- so every device learns it is gone (see docs/privacy/retention.md). Until now
-- the row kept the calendar's secret iCal address, which works like a
-- password to that calendar. From here on:
--
--   * a removed calendar (deleted_at set) has no address: the check allows an
--     empty address only then, and a calendar still followed must have a
--     secure web address, as before;
--   * the server empties the address itself whenever a row is marked
--     deleted, so it happens whatever the app sends, older copies included;
--   * addresses of calendars removed before this migration are wiped now.
--
-- The app (src/lib/calendar-links.ts, removeSubscription) empties its own
-- copy at the same time.

alter table public.calendar_subscription alter column url drop not null;

-- 020 wrote the rule on the column, which Postgres named calendar_subscription_url_check.
alter table public.calendar_subscription drop constraint if exists calendar_subscription_url_check;
alter table public.calendar_subscription add constraint calendar_subscription_url_check check (
  (url is null and deleted_at is not null)
  or (url is not null and length(url) <= 2048 and url ~ '^https://[^[:space:]]+$')
);

-- Marked deleted: the address goes, on insert (a calendar added and removed
-- on a device that was offline all along) and on update alike.
create or replace function private.calendar_subscription_forget_url()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.deleted_at is not null then
    new.url := null;
  end if;
  return new;
end $$;
revoke all on function private.calendar_subscription_forget_url() from public, anon, authenticated;
drop trigger if exists calendar_subscription_forget_url on public.calendar_subscription;
create trigger calendar_subscription_forget_url before insert or update on public.calendar_subscription
  for each row execute function private.calendar_subscription_forget_url();

-- Calendars removed before today. The touch trigger moves updated_at on, so
-- devices pick up the empty address at their next sync.
update public.calendar_subscription set url = null where deleted_at is not null and url is not null;
