-- GetIt 023: the calendar feed function may read what the feed shows.
--
-- The calendar-feed Edge Function runs as service_role (Google fetches the
-- feed without signing in, so there is no user to act as). This project
-- grants service_role nothing by default, so it is given read access to
-- exactly the tables the feed is built from, and nothing else: no writes,
-- and no health, food or weight tables.
grant usage on schema public to service_role;
grant select on public.calendar_feed, public.profile, public.task, public.series,
  public.series_exception, public.calendar_event to service_role;
