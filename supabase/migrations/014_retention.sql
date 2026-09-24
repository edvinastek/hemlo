-- GetIt 014: account deletion leaves nothing that names the person.
-- Adds removal of the invite-list entry and any database audit-log rows to
-- delete_my_account(). Everything else is unchanged from 012.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  h record;
  heir uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  for h in select id from public.household where owner_id = uid loop
    select user_id into heir from public.household_member
    where household_id = h.id and user_id <> uid order by user_id limit 1;

    if heir is null then
      delete from public.household where id = h.id;            -- cascades everything under it
    else
      delete from public.profile where household_id = h.id and (user_id = uid or user_id is null);
      update public.household set owner_id = heir where id = h.id;
      update public.household_member set role = 'owner' where household_id = h.id and user_id = heir;
    end if;
  end loop;

  delete from public.profile where user_id = uid;             -- own profiles in other households

  -- Nothing that names the person stays behind: their place on the invite
  -- list, and any sign-in records with IP addresses (only written if the
  -- project's database audit log is switched on; it is off today).
  delete from private.signup_allowlist
  where email = (select lower(email) from auth.users where id = uid);
  delete from auth.audit_log_entries where payload->>'actor_id' = uid::text;

  delete from auth.users where id = uid;                       -- memberships and own catalogue rows cascade
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
