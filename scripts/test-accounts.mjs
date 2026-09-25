// Throwaway accounts for the browser checks, made confirmed and on the invite
// list, so no email is needed. Deleting removes the account and everything it
// owned. Needs SB (a Supabase access token) and TEST_PASSWORD.
//   node scripts/test-accounts.mjs create a@example.invalid b@example.invalid
//   node scripts/test-accounts.mjs delete a@example.invalid b@example.invalid
const REF = 'lphysuemxnmcuukzsoya'
const sql = async (query) => {
  const r = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.SB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })).json()
  if (!Array.isArray(r)) { console.error(r); process.exit(1) }
  return r
}
const [cmd, ...emails] = process.argv.slice(2)
if (!process.env.SB || (cmd === 'create' && !process.env.TEST_PASSWORD)) { console.error('Set SB and TEST_PASSWORD.'); process.exit(2) }
if (emails.some((e) => !/^[a-z0-9._+-]+@[a-z0-9.-]+$/i.test(e))) { console.error('Plain email addresses only.'); process.exit(2) }
const pw = (process.env.TEST_PASSWORD ?? '').replace(/'/g, "''")
for (const e of emails) {
  if (cmd === 'create') {
    await sql(`insert into private.signup_allowlist(email) values ('${e}') on conflict do nothing;
      with u as (
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
          phone_change, phone_change_token, reauthentication_token)
        values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '${e}',
          extensions.crypt('${pw}', extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '')
        returning id, email)
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
        select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now() from u;`)
    console.log('created', e)
  } else if (cmd === 'delete') {
    // The same path as "Delete account" in the app, so the check leaves
    // exactly what a real deletion leaves: nothing.
    await sql(`do $$ declare u uuid; begin
        select id into u from auth.users where email = '${e}';
        if u is not null then
          perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
          perform public.delete_my_account();
        end if;
        delete from private.signup_allowlist where email = '${e}';
      end $$;`)
    console.log('deleted', e)
  } else {
    console.error('Use create or delete.'); process.exit(2)
  }
}
