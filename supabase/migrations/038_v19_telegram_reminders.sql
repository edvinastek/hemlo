-- GetIt 038: reminders through Telegram (version 19, REM-05). Opt-in.
--
-- How it fits together:
--  1. Linking. Settings → Reminders → Telegram asks telegram_link_start() for
--     a one-time code and shows https://t.me/<bot>?start=<code>. Only the
--     code's SHA-256 hash is kept, for 10 minutes. The person taps Start in
--     Telegram; Telegram sends "/start <code>" to the telegram-webhook
--     function, which calls telegram_link_finish(): the code is used up and
--     the chat id is stored on the profile's channel_setting (002 made the
--     columns). /stop in Telegram, blocking the bot, or Unlink in the app
--     clears it again.
--  2. What to send. The app already works out every reminder for the next
--     three days (src/lib/notify.ts, the same rules as the phone's own
--     notifications). While Telegram is linked it also hands that list to
--     telegram_set_reminders(): the key, the moment and the text, nothing
--     else. So Telegram says exactly what the phone would, quiet hours and
--     module switches included, and the server needs no second copy of the
--     reminder rules.
--  3. Sending. pg_cron calls the telegram-send function every minute (through
--     pg_net). It calls telegram_claim_due(), which marks each reminder due in
--     the last few minutes as sent in telegram_sent before it is sent, inside
--     one statement: two runs at once, or a retry, can never send one twice.
--
-- Nothing here is readable through the API by anyone, the owner included:
-- the app only calls the two functions it needs, and the server functions use
-- the service role. Safe to run more than once.

-- 1. The chat id ---------------------------------------------------------------
-- Telegram's chat ids are whole numbers (negative for groups, which are ignored).
alter table public.channel_setting drop constraint if exists channel_setting_telegram_chat_check;
alter table public.channel_setting add constraint channel_setting_telegram_chat_check
  check (telegram_chat_id is null or telegram_chat_id ~ '^-?[0-9]{1,20}$') not valid;
create index if not exists channel_setting_telegram_chat_idx
  on public.channel_setting (telegram_chat_id) where telegram_chat_id is not null;

-- Only Telegram links a chat (through telegram_link_finish). Otherwise a
-- person could point their reminders at someone else's chat. The person may
-- clear it (Unlink), and "on" means nothing without a chat.
create or replace function private.channel_setting_telegram_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.telegram_chat_id is not null
       and (tg_op = 'INSERT' or new.telegram_chat_id is distinct from old.telegram_chat_id) then
      raise exception 'A Telegram chat is linked from Telegram only' using errcode = '42501';
    end if;
  end if;
  if new.telegram_chat_id is null then new.telegram_on := false; end if;
  return new;
end $$;
drop trigger if exists channel_setting_telegram_guard on public.channel_setting;
create trigger channel_setting_telegram_guard before insert or update on public.channel_setting
  for each row execute function private.channel_setting_telegram_guard();

-- Unlinked: the reminders waiting for that chat go too.
create or replace function private.channel_setting_telegram_cleared()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.telegram_chat_id is not null and new.telegram_chat_id is null then
    delete from public.telegram_reminder where profile_id = new.profile_id;
  end if;
  return null;
end $$;

-- 2. Link codes ----------------------------------------------------------------
-- One code per profile at a time; a new one replaces the old.
create table if not exists public.telegram_link_code (
  profile_id uuid primary key references public.profile(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.telegram_link_code enable row level security;
revoke all on public.telegram_link_code from public, anon, authenticated;

-- 3. Reminders waiting to go, and the ones that went ------------------------------
create table if not exists public.telegram_reminder (
  profile_id uuid not null references public.profile(id) on delete cascade,
  -- The app's own key for the item and day (e.g. task:<id>:2026-10-04).
  key text not null check (length(key) between 1 and 200),
  due_at timestamptz not null,
  body text not null check (length(body) between 1 and 500),
  primary key (profile_id, key)
);
create index if not exists telegram_reminder_due_idx on public.telegram_reminder (due_at);
alter table public.telegram_reminder enable row level security;
revoke all on public.telegram_reminder from public, anon, authenticated;

create table if not exists public.telegram_sent (
  profile_id uuid not null references public.profile(id) on delete cascade,
  key text not null,
  due_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (profile_id, key, due_at)
);
create index if not exists telegram_sent_at_idx on public.telegram_sent (sent_at);
alter table public.telegram_sent enable row level security;
revoke all on public.telegram_sent from public, anon, authenticated;
-- telegram-send gives a claim back when Telegram could not take the message,
-- so the next run tries again.
grant select, delete on public.telegram_sent to service_role;

drop trigger if exists channel_setting_telegram_cleared on public.channel_setting;
create trigger channel_setting_telegram_cleared after update on public.channel_setting
  for each row execute function private.channel_setting_telegram_cleared();

-- 4. The app's two calls -----------------------------------------------------------
-- A new link code for a profile of the caller's. Returned once; only its hash
-- stays, for 10 minutes. 16 random bytes, base64url: 22 characters, which
-- fits Telegram's start parameter (A-Z, a-z, 0-9, _ and -, at most 64).
create or replace function public.telegram_link_start(p uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  code text;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p is null or p not in (select private.my_profiles()) then
    raise exception 'No such profile' using errcode = '42501';
  end if;
  code := rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
  insert into public.telegram_link_code (profile_id, code_hash, expires_at)
  values (p, encode(sha256(convert_to(code, 'UTF8')), 'hex'), now() + interval '10 minutes')
  on conflict (profile_id) do update
    set code_hash = excluded.code_hash, expires_at = excluded.expires_at, created_at = now();
  return code;
end $$;

-- The reminders for the next days, replacing those not yet due. Items:
-- [{ "key": text, "due_at": timestamptz, "body": text }], at most 300.
-- Returns how many are waiting, or -1 when Telegram is not linked (then
-- nothing is kept, and the app stops sending them).
create or replace function public.telegram_set_reminders(p uuid, items jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p is null or p not in (select private.my_profiles()) then
    raise exception 'No such profile' using errcode = '42501';
  end if;
  if not exists (select 1 from public.channel_setting c
                 where c.profile_id = p and c.telegram_on and c.telegram_chat_id is not null) then
    delete from public.telegram_reminder where profile_id = p;
    return -1;
  end if;
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 300 then
    raise exception 'A list of at most 300 reminders' using errcode = '22023';
  end if;
  -- Those already due stay until telegram-send has had its turn.
  delete from public.telegram_reminder
  where profile_id = p and (due_at > now() or due_at < now() - interval '1 day');
  insert into public.telegram_reminder (profile_id, key, due_at, body)
  select distinct on (x.key) p, x.key, x.due_at, left(x.body, 500)
  from jsonb_to_recordset(items) as x(key text, due_at timestamptz, body text)
  where length(x.key) between 1 and 200 and length(btrim(x.body)) > 0
    and x.due_at > now() and x.due_at < now() + interval '4 days'
  order by x.key, x.due_at
  on conflict (profile_id, key) do update set due_at = excluded.due_at, body = excluded.body;
  select count(*) into n from public.telegram_reminder where profile_id = p and due_at > now();
  return n;
end $$;

revoke all on function public.telegram_link_start(uuid), public.telegram_set_reminders(uuid, jsonb) from public, anon;
grant execute on function public.telegram_link_start(uuid), public.telegram_set_reminders(uuid, jsonb) to authenticated;

-- 5. The server functions' calls (service role only) ----------------------------------
-- "/start <code>": use the code up and link the chat. False for a code that
-- is wrong, used or older than 10 minutes.
create or replace function public.telegram_link_finish(code text, chat text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  p uuid;
begin
  if code is null or code !~ '^[A-Za-z0-9_-]{16,64}$' or chat is null or chat !~ '^[0-9]{1,20}$' then
    return false;
  end if;
  delete from public.telegram_link_code
  where code_hash = encode(sha256(convert_to(code, 'UTF8')), 'hex') and expires_at > now()
  returning profile_id into p;
  if p is null then return false; end if;
  insert into public.channel_setting (profile_id, telegram_on, telegram_chat_id)
  values (p, true, chat)
  on conflict (profile_id) do update set telegram_on = true, telegram_chat_id = excluded.telegram_chat_id;
  return true;
end $$;

-- "/stop", or the person blocked the bot: every profile linked to that chat
-- is unlinked (the trigger above clears what was waiting).
create or replace function public.telegram_stop(chat text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  update public.channel_setting set telegram_on = false, telegram_chat_id = null
  where telegram_chat_id = chat;
  get diagnostics n = row_count;
  return n;
end $$;

-- The reminders due in the last few minutes for linked chats, each claimed
-- in telegram_sent in the same statement, so a reminder is handed out once
-- whatever runs at the same time. A missed minute is caught up by the next
-- run; anything older than the window is left (a reminder an hour late helps
-- no one). Also tidies what is no longer needed.
create or replace function public.telegram_claim_due(window_minutes int default 10)
returns table (profile_id uuid, key text, due_at timestamptz, body text, chat_id text)
language sql security definer set search_path = '' as $$
  delete from public.telegram_sent where sent_at < now() - interval '2 days';
  delete from public.telegram_link_code where expires_at < now() - interval '1 day';
  with due as (
    select r.profile_id, r.key, r.due_at, r.body, c.telegram_chat_id as chat_id
    from public.telegram_reminder r
    join public.channel_setting c on c.profile_id = r.profile_id
    where c.telegram_on and c.telegram_chat_id is not null
      and r.due_at <= now()
      and r.due_at > now() - make_interval(mins => least(greatest(coalesce(window_minutes, 10), 1), 60))
  ), claimed as (
    insert into public.telegram_sent (profile_id, key, due_at)
    select d.profile_id, d.key, d.due_at from due d
    on conflict do nothing
    returning telegram_sent.profile_id, telegram_sent.key, telegram_sent.due_at
  )
  select d.profile_id, d.key, d.due_at, d.body, d.chat_id
  from due d join claimed c using (profile_id, key, due_at)
  order by d.chat_id, d.due_at, d.key
$$;

revoke all on function public.telegram_link_finish(text, text), public.telegram_stop(text), public.telegram_claim_due(int)
  from public, anon, authenticated;
grant execute on function public.telegram_link_finish(text, text), public.telegram_stop(text), public.telegram_claim_due(int)
  to service_role;

-- 6. Every minute: pg_cron calls telegram-send through pg_net ----------------------------
-- Supabase offers both extensions; they are switched on here when they are
-- available. The function checks a shared secret (TELEGRAM_CRON_SECRET), which
-- the job reads from Supabase Vault at run time, so it is never in this file.
-- Where either extension is missing (a plain Postgres, as in the local tests)
-- nothing is scheduled; docs/telegram.md has the step to do it by hand.
do $do$
begin
  begin
    if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
      create extension if not exists pg_cron;
    end if;
    if exists (select 1 from pg_available_extensions where name = 'pg_net') then
      create extension if not exists pg_net with schema extensions;
    end if;
  exception when others then
    raise notice '038: pg_cron or pg_net could not be switched on (%); see docs/telegram.md', sqlerrm;
  end;
  if to_regprocedure('cron.schedule(text,text,text)') is null
     or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise notice '038: pg_cron or pg_net is not here, so telegram-send is not scheduled; see docs/telegram.md';
    return;
  end if;
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'getit-telegram-send';
  perform cron.schedule('getit-telegram-send', '* * * * *', $cmd$
    select net.http_post(
      url := 'https://lphysuemxnmcuukzsoya.supabase.co/functions/v1/telegram-send',
      body := '{}'::jsonb,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-getit-cron', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'telegram_cron_secret'), '')),
      timeout_milliseconds := 25000)
  $cmd$);
end $do$;
