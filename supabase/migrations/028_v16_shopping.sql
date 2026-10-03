-- 028: version 16, shopping and stock.
--
--  1. The household's shopping list (026) learns three more things: which of
--     several lists an item is on, when it was bought (for the "recently
--     bought" tiles), and, for an item the meal plan put there, up to which
--     day it counts as dealt with (bought, or "not needed this time").
--  2. Stock gets a storage place (fridge, freezer, cupboard or the person's
--     own), a best-before date and a minimum amount that puts the food on the
--     shopping list when the cupboard runs below it.
--  3. Prices the household notes per shop: the latest one per item per shop.
--  4. Joining a household from the app: the owner makes a short code, the
--     other person types it in. Codes are kept only as a hash, last two days,
--     work once, and wrong guesses are limited.
--  5. Housemates can read a food a list item or a price points at, on the
--     same terms 025 gave foods in the shared cupboard.
--
-- Safe to run more than once.

-- 1: the shopping list --------------------------------------------------------
alter table public.shopping_entry
  add column if not exists list text,
  add column if not exists bought_at timestamptz,
  add column if not exists done_until date;
do $$ begin
  alter table public.shopping_entry add constraint shopping_entry_list_check
    check (list is null or length(btrim(list)) between 1 and 40);
exception when duplicate_object then null; end $$;
create index if not exists shopping_entry_bought_idx on public.shopping_entry (household_id, bought_at) where bought_at is not null;

-- 2: stock ----------------------------------------------------------------------
alter table public.stock
  add column if not exists place text,
  add column if not exists best_before date,
  add column if not exists min_grams numeric(9,2);
do $$ begin
  alter table public.stock add constraint stock_place_check
    check (place is null or length(btrim(place)) between 1 and 40);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.stock add constraint stock_min_check
    check (min_grams is null or (min_grams > 0 and min_grams <= 1000000));
exception when duplicate_object then null; end $$;

-- 3: prices per shop ------------------------------------------------------------
-- item_key is the food's id, or 'name:' and the item's name in lower case for
-- an item with no food. One live price per item per shop: noting a new one
-- replaces it, so the list always shows the latest.
create table if not exists public.shop_price (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  shop text not null,
  item_key text not null,
  food_id uuid references public.food(id) on delete set null,
  name text,
  price numeric(8,2) not null,
  -- What the price is for, in grams (or millilitres); empty means one of it.
  amount_g numeric(10,2),
  noted_on date not null default current_date,
  added_by uuid references public.profile(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint shop_price_lengths check (
    length(btrim(shop)) between 1 and 60 and length(item_key) between 1 and 140 and
    (name is null or length(name) <= 120)),
  constraint shop_price_amounts check (
    price >= 0 and price <= 99999 and (amount_g is null or (amount_g > 0 and amount_g <= 1000000)))
);
create unique index if not exists shop_price_item_idx
  on public.shop_price (household_id, shop, item_key) where deleted_at is null;
create index if not exists shop_price_household_idx on public.shop_price (household_id, updated_at);

alter table public.shop_price enable row level security;
drop policy if exists shop_price_household on public.shop_price;
create policy shop_price_household on public.shop_price for all to authenticated
  using (household_id in (select private.my_households()))
  with check (household_id in (select private.my_households()));
revoke all on public.shop_price from anon;
grant select, insert, update, delete on public.shop_price to authenticated;
drop trigger if exists shop_price_touch on public.shop_price;
create trigger shop_price_touch before update on public.shop_price for each row execute function public.touch_updated_at();

-- 4: joining a household with a code ----------------------------------------------
-- Neither table is reachable from the app: only the functions below read or
-- write them. A code is stored as its SHA-256, so a copy of the table gives
-- nobody a way in.
create table if not exists private.household_invite (
  code_hash text primary key,
  household_id uuid not null references public.household(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);
create index if not exists household_invite_household_idx on private.household_invite (household_id);
create table if not exists private.invite_attempt (
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists invite_attempt_user_idx on private.invite_attempt (user_id, at);
revoke all on private.household_invite, private.invite_attempt from public, anon, authenticated;

-- The household a person falls back to: the oldest one they own, made (with
-- them as its owner) if they own none.
create or replace function private.home_of(uid uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare h uuid;
begin
  select id into h from public.household where owner_id = uid order by created_at, id limit 1;
  if h is null then
    insert into public.household (name, owner_id) values ('Home', uid) returning id into h;
  end if;
  insert into public.household_member (household_id, user_id, role) values (h, uid, 'owner')
  on conflict (household_id, user_id) do nothing;
  return h;
end $$;
revoke all on function private.home_of(uuid) from public, anon, authenticated;

-- A new code for the caller's household. Only its owner may let people in
-- (as 012 decided); a new code replaces any unused one, so at most one works.
-- Ten letters and digits from 32 that cannot be mistaken for each other
-- (no I, O, 0 or 1): about 50 bits, out of reach with the guesses allowed.
create or replace function public.create_household_invite(h uuid)
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  more bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  plain text := '';
  i int;
  ends timestamptz := now() + interval '2 days';
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if h is null or h not in (select private.owned_households()) then
    raise exception 'Only the owner of the household can invite people to it.' using errcode = '42501';
  end if;
  -- Bytes 0-5 of one random UUID and 0-3 of another: none of them carries
  -- the version or variant bits. 256 is a multiple of 32, so every letter is
  -- as likely as every other.
  for i in 0..5 loop plain := plain || substr(alphabet, get_byte(raw, i) % 32 + 1, 1); end loop;
  for i in 0..3 loop plain := plain || substr(alphabet, get_byte(more, i) % 32 + 1, 1); end loop;
  delete from private.household_invite hi where hi.household_id = h and (hi.used_at is null or hi.expires_at < now());
  insert into private.household_invite (code_hash, household_id, created_by, expires_at)
  values (encode(sha256(convert_to(plain, 'UTF8')), 'hex'), h, uid, ends);
  return query select substr(plain, 1, 5) || '-' || substr(plain, 6, 5), ends;
end $$;
revoke all on function public.create_household_invite(uuid) from public, anon;
grant execute on function public.create_household_invite(uuid) to authenticated;

-- Take back an unused code.
create or replace function public.cancel_household_invites(h uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or h not in (select private.owned_households()) then
    raise exception 'Only the owner of the household can do that.' using errcode = '42501';
  end if;
  delete from private.household_invite where household_id = h and used_at is null;
end $$;
revoke all on function public.cancel_household_invites(uuid) from public, anon;
grant execute on function public.cancel_household_invites(uuid) to authenticated;

-- Join with a code. The caller becomes a member, and their own profiles move
-- to that household, so its cupboard, list and chores are theirs to share.
-- Their old household stays theirs, with everything in it; leaving moves them
-- back. Ten tries an hour, counted before the code is looked at.
--
-- A code that does not work is answered, not raised: an error would undo the
-- record of the try along with everything else, and guesses would never be
-- counted. So the answer is the household joined, or the reason it was not.
drop function if exists public.join_household(text);
create function public.join_household(code text)
returns table (household_id uuid, problem text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  plain text := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  inv private.household_invite;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  delete from private.invite_attempt a where a.user_id = uid and a.at < now() - interval '1 day';
  if (select count(*) from private.invite_attempt a where a.user_id = uid and a.at > now() - interval '1 hour') >= 10 then
    return query select null::uuid, 'Too many tries. Wait an hour, then try again.'::text;
    return;
  end if;
  insert into private.invite_attempt (user_id) values (uid);
  if length(plain) <> 10 then
    return query select null::uuid, 'An invite code is ten letters and digits.'::text;
    return;
  end if;
  select * into inv from private.household_invite hi
   where hi.code_hash = encode(sha256(convert_to(plain, 'UTF8')), 'hex')
     and hi.used_at is null and hi.expires_at > now()
   for update;
  if not found then
    return query select null::uuid, 'That code does not work: it may be mistyped, used already, or more than two days old.'::text;
    return;
  end if;
  insert into public.household_member as hm (household_id, user_id, role) values (inv.household_id, uid, 'member')
  on conflict on constraint household_member_pkey do nothing;
  update private.household_invite hi set used_by = uid, used_at = now() where hi.code_hash = inv.code_hash;
  update public.profile p set household_id = inv.household_id
   where p.user_id = uid and p.household_id <> inv.household_id;
  return query select inv.household_id, null::text;
end $$;
revoke all on function public.join_household(text) from public, anon;
grant execute on function public.join_household(text) to authenticated;

-- Leave a household one does not own: the membership goes, and one's own
-- profiles go back to one's own household (made afresh if there is none).
create or replace function public.leave_household(h uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  home uuid;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if h in (select private.owned_households()) then
    raise exception 'This household is yours, so it cannot be left. Remove the others from it instead.' using errcode = '42501';
  end if;
  if h not in (select private.my_households()) then
    raise exception 'You are not in that household.' using errcode = '42501';
  end if;
  delete from public.household_member where household_id = h and user_id = uid;
  home := private.home_of(uid);
  update public.profile set household_id = home where user_id = uid and household_id = h;
  return home;
end $$;
revoke all on function public.leave_household(uuid) from public, anon;
grant execute on function public.leave_household(uuid) to authenticated;

-- The owner takes someone out: the same as them leaving.
create or replace function public.remove_household_member(h uuid, member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  home uuid;
begin
  if uid is null or h not in (select private.owned_households()) then
    raise exception 'Only the owner of the household can do that.' using errcode = '42501';
  end if;
  if member = uid then
    raise exception 'The owner stays in their own household.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.household_member where household_id = h and user_id = member) then return; end if;
  delete from public.household_member where household_id = h and user_id = member;
  home := private.home_of(member);
  update public.profile set household_id = home where user_id = member and household_id = h;
end $$;
revoke all on function public.remove_household_member(uuid, uuid) from public, anon;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;

-- 5: housemates read the foods on the list and in the prices --------------------
-- As 025, for the list and the prices as well as the cupboard: a food is
-- opened to the household only while a live row of that household points at
-- it, and only when its owner is in that household.
create or replace function private.household_foods()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select s.food_id
  from public.stock s
  join public.food f on f.id = s.food_id
  join public.household_member hm on hm.household_id = s.household_id and hm.user_id = f.owner_id
  where s.household_id in (select private.my_households())
    and s.deleted_at is null
    and f.owner_id is not null
  union
  select e.food_id
  from public.shopping_entry e
  join public.food f on f.id = e.food_id
  join public.household_member hm on hm.household_id = e.household_id and hm.user_id = f.owner_id
  where e.household_id in (select private.my_households())
    and e.deleted_at is null
    and f.owner_id is not null
  union
  select p.food_id
  from public.shop_price p
  join public.food f on f.id = p.food_id
  join public.household_member hm on hm.household_id = p.household_id and hm.user_id = f.owner_id
  where p.household_id in (select private.my_households())
    and p.deleted_at is null
    and f.owner_id is not null
$$;
revoke all on function private.household_foods() from public, anon;
grant execute on function private.household_foods() to authenticated;
