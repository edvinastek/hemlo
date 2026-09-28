-- GetIt 019: a recipe can be kept to yourself or proposed to everyone.
--
-- A proposal reaches no one until the app's owner (a row in app_admin) has
-- looked at it and approved it. The rules, all enforced here rather than in
-- the app, because the app's key ships in every build:
--
--  * sharing is 'private' (the default), 'proposed' (waiting for review),
--    'public' (approved, everyone signed in can read it) or 'rejected' (seen
--    and declined, with an optional note; only the owner sees it).
--  * An owner can only ever choose 'private' or 'proposed'. 'public' and
--    'rejected' are set by review_recipe(), which only a reviewer may call.
--    The review date and note are the reviewer's: an owner cannot write them.
--  * Changing an approved recipe (its name, amounts, steps, any ingredient)
--    sends it back for review, so an approved recipe cannot be swapped for
--    something else afterwards. Chosen over "approved recipes are read-only"
--    because a typo should not need a copy of the recipe to fix.
--  * Deleting a shared recipe (deleted_at) withdraws it: it becomes private.
--  * A shared recipe uses foods from the shared list only. Other people cannot
--    read your own foods, so they would see the recipe with holes in it, and a
--    food could be edited after the recipe was approved.
--  * Deleting an account deletes its shared recipes too (the existing cascade
--    on owner_id). The privacy policy promises nothing is left behind; other
--    people's plans that used such a recipe keep the day but lose the recipe.

-- Recipe columns --------------------------------------------------------------
alter table public.recipe
  add column if not exists sharing text not null default 'private',
  add column if not exists proposed_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table public.recipe drop constraint if exists recipe_sharing_check;
alter table public.recipe add constraint recipe_sharing_check
  check (sharing in ('private', 'proposed', 'public', 'rejected'));
alter table public.recipe drop constraint if exists recipe_review_note_check;
alter table public.recipe add constraint recipe_review_note_check
  check (review_note is null or length(review_note) <= 280);

-- The shared catalogue was always readable by everyone: it is public.
update public.recipe set sharing = 'public' where owner_id is null and sharing <> 'public';

-- The review queue is read by date proposed.
create index if not exists recipe_proposed_idx on public.recipe (proposed_at) where sharing = 'proposed';

-- Reviewers ---------------------------------------------------------------------
-- Rows are added by hand, in SQL:
--   insert into public.app_admin (user_id) select id from auth.users where email = '…';
-- The app may read its own row, and nothing else, to know whether to show the
-- review queue. No one can add, change or remove a row through the API.
create table if not exists public.app_admin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.app_admin enable row level security;
-- New tables inherit full grants for signed-in users (010); take them back.
revoke all on public.app_admin from public, anon, authenticated;
grant select on public.app_admin to authenticated;
drop policy if exists app_admin_self on public.app_admin;
create policy app_admin_self on public.app_admin for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.is_app_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admin where user_id = (select auth.uid()))
$$;

-- Whether a recipe, or one food, is outside the shared list. Security definer
-- so the answer is the same whoever asks: a line could point at a food the
-- caller cannot read.
create or replace function private.recipe_has_personal_food(rid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.recipe_line l join public.food f on f.id = l.food_id
    where l.recipe_id = rid and f.owner_id is not null)
$$;

create or replace function private.is_personal_food(fid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.food where id = fid and owner_id is not null)
$$;

revoke all on function private.is_app_admin(), private.recipe_has_personal_food(uuid), private.is_personal_food(uuid)
  from public, anon;
grant execute on function private.is_app_admin(), private.recipe_has_personal_food(uuid), private.is_personal_food(uuid)
  to authenticated;

-- Who can read what -------------------------------------------------------------
-- Everyone signed in: the catalogue, approved recipes, and their own.
-- Reviewers: also what is waiting for review.
drop policy if exists recipe_read on public.recipe;
create policy recipe_read on public.recipe for select to authenticated
  using (owner_id is null
         or owner_id = (select auth.uid())
         or sharing = 'public'
         or (sharing = 'proposed' and (select private.is_app_admin())));

-- Ingredient lines follow their recipe: readable exactly when the recipe is.
-- Same definition as 012, restated so the rule sits next to the one it follows.
drop policy if exists recipe_line_read on public.recipe_line;
create policy recipe_line_read on public.recipe_line for select to authenticated
  using (recipe_id in (select id from public.recipe));
-- Writing lines stays the owner's alone (recipe_line_write, 012).

-- The guard on recipe rows ---------------------------------------------------------
-- Applies to changes made through the app (the authenticated role). Changes
-- made in SQL by the project owner, and by review_recipe() below, which runs
-- as its owner, are not limited by it.
create or replace function private.recipe_sharing_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  from_app boolean := current_user in ('authenticated', 'anon');
  -- Columns that are not the recipe itself: changing them never needs a review.
  not_content text[] := array['sharing', 'proposed_at', 'reviewed_at', 'review_note',
                              'updated_at', 'created_at', 'deleted_at', 'shared_with_partner'];
begin
  if new.owner_id is null then
    return new;                                    -- the catalogue: only SQL writes it
  end if;

  if from_app then
    if tg_op = 'INSERT' then
      -- A new row starts private or proposed, never reviewed. A backup read
      -- back in may carry 'public'; it arrives private instead of refused.
      if new.sharing not in ('private', 'proposed') then
        new.sharing := 'private';
      end if;
      new.reviewed_at := null;
      new.review_note := null;
      new.proposed_at := case when new.sharing = 'proposed' then now() end;
    else
      if new.sharing is distinct from old.sharing and new.sharing not in ('private', 'proposed') then
        raise exception 'Only a reviewer can share a recipe with everyone' using errcode = '42501';
      end if;
      new.reviewed_at := old.reviewed_at;          -- the reviewer's, never the owner's
      new.review_note := old.review_note;
      new.proposed_at := old.proposed_at;

      -- Deleted: withdrawn from everyone.
      if new.deleted_at is not null and old.deleted_at is null and new.sharing in ('proposed', 'public') then
        new.sharing := 'private';
      end if;
      -- An approved recipe that changes goes back for review.
      if new.sharing = 'public'
         and (to_jsonb(new) - not_content) is distinct from (to_jsonb(old) - not_content) then
        new.sharing := 'proposed';
      end if;
      if new.sharing = 'proposed' and old.sharing is distinct from 'proposed' then
        new.proposed_at := now();
      end if;
    end if;
  end if;

  if new.sharing in ('proposed', 'public') and private.recipe_has_personal_food(new.id) then
    raise exception 'A shared recipe can only use foods from the shared list' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists recipe_sharing_guard on public.recipe;
create trigger recipe_sharing_guard before insert or update on public.recipe
  for each row execute function private.recipe_sharing_guard();

-- The guard on ingredient lines ------------------------------------------------------
-- A line added to a shared recipe must use a shared food; any change to the
-- lines of an approved recipe sends it back for review (a new order alone
-- does not).
create or replace function private.recipe_line_sharing_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  from_app boolean := current_user in ('authenticated', 'anon');
  changed boolean := true;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if new.food_id is not null
       and exists (select 1 from public.recipe r
                   where r.id = new.recipe_id and r.owner_id is not null and r.sharing in ('proposed', 'public'))
       and private.is_personal_food(new.food_id) then
      raise exception 'A shared recipe can only use foods from the shared list' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    changed := (to_jsonb(new) - 'sort_order') is distinct from (to_jsonb(old) - 'sort_order');
  end if;

  if from_app and changed then
    -- Runs as the owner, through their own update rights; the recipe guard
    -- above allows public -> proposed and stamps proposed_at.
    if tg_op in ('UPDATE', 'DELETE') then
      update public.recipe set sharing = 'proposed'
      where id = old.recipe_id and sharing = 'public' and owner_id is not null;
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      update public.recipe set sharing = 'proposed'
      where id = new.recipe_id and sharing = 'public' and owner_id is not null;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists recipe_line_sharing_guard on public.recipe_line;
create trigger recipe_line_sharing_guard before insert or update or delete on public.recipe_line
  for each row execute function private.recipe_line_sharing_guard();

-- Trigger functions are never called directly.
revoke all on function private.recipe_sharing_guard(), private.recipe_line_sharing_guard()
  from public, anon, authenticated;

-- Reviewing -------------------------------------------------------------------------
-- Approve or decline one recipe that is waiting. Declining can also take down
-- one already approved. The note, if any, is shown to the recipe's owner.
create or replace function public.review_recipe(recipe_id uuid, approve boolean, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  rid uuid := review_recipe.recipe_id;
  clean text := nullif(btrim(coalesce(review_recipe.note, '')), '');
  r record;
begin
  if not private.is_app_admin() then
    raise exception 'Only a reviewer can do this' using errcode = '42501';
  end if;
  if clean is not null and length(clean) > 280 then
    raise exception 'A review note is at most 280 characters' using errcode = '23514';
  end if;

  select x.id, x.owner_id, x.sharing, x.deleted_at into r
  from public.recipe x where x.id = rid for update;
  if not found or r.owner_id is null then
    raise exception 'No such recipe' using errcode = 'P0002';
  end if;
  if r.deleted_at is not null
     or r.sharing not in ('proposed', 'public')
     or (review_recipe.approve and r.sharing <> 'proposed') then
    raise exception 'This recipe is not waiting for review' using errcode = '55000';
  end if;
  if review_recipe.approve and private.recipe_has_personal_food(rid) then
    raise exception 'A shared recipe can only use foods from the shared list' using errcode = '23514';
  end if;

  update public.recipe x
  set sharing = case when review_recipe.approve then 'public' else 'rejected' end,
      reviewed_at = now(),
      review_note = clean
  where x.id = rid;
end $$;

-- What is waiting, oldest first, with the author's name as they set it in the
-- app. A name that is just the start of their email address (the default a
-- new account gets) is left out, and so is anything with an @ in it: the
-- queue never shows an email address.
create or replace function public.recipe_review_queue()
returns table (id uuid, author text, proposed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_app_admin() then
    raise exception 'Only a reviewer can do this' using errcode = '42501';
  end if;
  return query
  select r.id,
         (select case when p.name is null or btrim(p.name) = '' or p.name like '%@%'
                        or lower(btrim(p.name)) = lower(split_part(u.email, '@', 1)) then null
                      else btrim(p.name) end
          from public.profile p join auth.users u on u.id = p.user_id
          where p.user_id = r.owner_id
          order by p.is_default desc
          limit 1),
         r.proposed_at
  from public.recipe r
  where r.sharing = 'proposed' and r.owner_id is not null and r.deleted_at is null
  order by r.proposed_at nulls last, r.id;
end $$;

revoke all on function public.review_recipe(uuid, boolean, text), public.recipe_review_queue() from public, anon;
grant execute on function public.review_recipe(uuid, boolean, text), public.recipe_review_queue() to authenticated;

-- delete_my_account() needs no change: recipes and their lines cascade from
-- auth.users through owner_id, and so does the app_admin row.
