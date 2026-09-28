-- GetIt 025: housemates can read the foods in their shared cupboard.
--
-- The cupboard (stock) is shared by the household, but a food someone scanned
-- is their own (owner_id is them), and 012 lets only the owner read it. So a
-- pack of hagelslag one person scanned into the cupboard showed on everyone
-- else's phone as "Unknown food", and their −/+ could not tell it was
-- counted in slices.
--
-- Now a member of a household may read (only read) a food that a live stock
-- row of that household points at, when the food's owner is a member of that
-- same household. Nothing else changes:
--  * The owner's other foods stay theirs alone: only foods in the shared
--    cupboard are opened, one by one.
--  * Nobody but the owner can change or delete it (the update and delete
--    policies from 012 still say owner only).
--  * A stranger's food cannot be pulled in by putting it in your own
--    cupboard: the owner must be in the household whose stock points at it.
--  * Taken out of the cupboard (the stock row removed), or the owner leaving
--    the household, and it is no longer readable; the app drops its copy on
--    the next sync.
--
-- The rows are found by a security definer function in the private schema,
-- like the helpers in 012: it reads stock, food and household_member without
-- their own row-level security (so the food policy does not call itself), and
-- only ever for households the caller is in.
--
-- Order: apply any time; the app works without it (other members' foods show
-- as "Unknown food" and keep the unit their rows have). Not applied yet.

create or replace function private.household_foods()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select s.food_id
  from public.stock s
  join public.food f on f.id = s.food_id
  join public.household_member hm on hm.household_id = s.household_id and hm.user_id = f.owner_id
  where s.household_id in (select private.my_households())
    and s.deleted_at is null
    and f.owner_id is not null
$$;

revoke all on function private.household_foods() from public, anon;
grant execute on function private.household_foods() to authenticated;

-- Select only. Permissive policies combine with OR, so the catalogue and
-- one's own foods (food_read, 012) are read exactly as before.
drop policy if exists food_household_read on public.food;
create policy food_household_read on public.food for select to authenticated
  using (id in (select private.household_foods()));
