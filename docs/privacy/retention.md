Not legal advice: drafted from public sources, and to be checked by someone qualified before GetIt launches publicly.

# Retention

How long each kind of personal data is kept, and what removes it. Article 5(1)(e)
requires data to be kept no longer than needed; article 30(1)(f) asks for these
limits in the register. Figures for Supabase are for the **free plan**, which
GetIt uses today. If the plan changes, update this file, `records-of-processing.md`
and the policy's "How long it is kept" section together.

## Summary

| Data | Where | Kept | What removes it |
| --- | --- | --- | --- |
| Account, profile, plan and health data | Supabase, Frankfurt | Until the account is deleted | `delete_my_account()` (app: Settings → Data and account → Delete account; web: `delete.html`), which removes the user's households or hands shared ones on, their profiles and everything under them, and the `auth.users` row (`012_security.sql`, `014_retention.sql`). A shared household keeps its stock, shopping list, prices and chores; the leaver's name goes (`household_member` cascades) and their id on items and chore logs becomes empty (`on delete set null`). |
| Items deleted inside the app | Supabase | Until the account is deleted | Nothing yet. Rows get a `deleted_at` time and are hidden everywhere, but stay in the table so every device learns of the deletion when it syncs. See "Soft-deleted rows" below. |
| Record of health consent | Supabase, the user's auth metadata (`health_consent_at`, `privacy_version`) | Until the account is deleted | Removed with the `auth.users` row. |
| Sessions and refresh tokens | Supabase Auth | Until sign-out, expiry, or account deletion | Signing out deletes the session ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions)); account deletion removes the user's sessions with the user. |
| Request, API, database and auth logs, with IP address and user agent | Supabase log storage | **1 day** on Free; 7 days on Pro | Expire automatically ([pricing](https://supabase.com/pricing), "Log retention"). |
| Auth audit log in the database (`auth.audit_log_entries`: time, user id, action, IP address, user agent) | Supabase Postgres, only if "Write audit logs to the database" is on | Indefinitely, and **not** removed by account deletion | Turn the setting off ([Supabase audit logs](https://supabase.com/docs/guides/auth/audit-logs)), or run the purge below. |
| Backups | Supabase | **None on Free**: free projects are not backed up automatically, and Supabase advises exporting with `supabase db dump`; Pro keeps daily backups for 7 days, Team 14, Enterprise 30 ([Supabase backups](https://supabase.com/docs/guides/platform/backups)) | Overwritten when they age out. A deleted account stays in a backup until that backup expires. |
| Everything, after leaving Supabase | Supabase | 30 days after the contract ends, to allow export | Supabase deletes all copies, including at sub-processors ([Supabase DPA](https://supabase.com/legal/dpa)). |
| Local copy on a device | The phone or browser (IndexedDB) | Until sign-out or uninstall | Sign-out clears every local table (`src/lib/db.ts`, called from `src/App.tsx`). Excluded from Android backup and device transfer. |
| Export files | Wherever the user saves them | The user decides | Not GetIt's copy. |
| Tester allowlist (`private.signup_allowlist`) | Supabase | Until the tester deletes their account, or sign-ups open to the public | Remove by hand (SQL in `data-requests.md`). Account deletion does not remove it. |
| Tester lists (`store/testers/*.txt`, `*.csv`) | The developer's computer | Until the allowlist SQL has been run | Delete the file. Git ignores these files so they never reach the repository. |
| Google Group and Play Console tester list | Google | Until the closed test ends | Remove members, or delete the group. |
| Emails with users, and the request log | Contact mailbox | Two years after the request is closed | Delete by hand at the start of each quarter. |
| Breach register | Outside the repository | Five years after the breach is closed | Delete by hand. |
| Visitor logs of the public site | Netlify | Set by Netlify; not configurable on the free plan, and the period is not published on the pages checked | Netlify. See open question below. |
| Photos in module records (v18) | Supabase Storage, Frankfurt, private bucket (migration 033) | Until the record or the account is deleted | Deleting the record deletes the file; account deletion must delete the user's folder too (check `delete_my_account` with migration 033). A copy on the device until sign-out. |
| Open Food Facts token for price sharing (v18) | The device only: Android secure storage, or the browser tab's session storage | Until sign-out from Open Food Facts, sharing turned off, sign-out from GetIt, or (browser) the tab closing | `src/lib/open-prices-account.ts` (also a reset hook on the local copy). |
| Which own prices were shared, the last shop place and photo id per shop (v18) | The device only (local `meta` table) | Until sign-out | Cleared with the local copy. |
| Prices and photos shared with Open Prices (v18) | Open Prices (Open Food Facts), public | Under Open Food Facts' own terms | The user, on prices.openfoodfacts.org. Not GetIt's copy; account deletion does not touch it. |
| Which newer policy version the user has read (v18) | Supabase, the user's auth metadata (`policy_read`), and the device | Until the account is deleted | Removed with the `auth.users` row. |

## Soft-deleted rows

GetIt syncs between devices, so a deletion must travel as a row with
`deleted_at` set, not as a missing row. The rows stay until the account is
deleted, which the policy says plainly. A purge of rows deleted more than, for
example, 90 days ago would be better, but it needs a matching change in the sync
layer: a device that has been offline longer than that must not re-upload rows
the server has purged (`queueChange` inserts rows the server does not have).
Until that is designed, a user who wants a single item erased for good can ask
by email, and it is removed by hand (`data-requests.md`).

One exception already: a calendar the user stops following keeps its row (name,
colour, `deleted_at`) but not its secret iCal address, which the server erases
the moment the row is marked deleted (`024_calendar_privacy.sql`).

## Auth audit log purge

Only needed if "Write audit logs to the database" stays on. Run in the Supabase
SQL editor, or schedule with `pg_cron`. First look at a few rows to confirm the
column and key names in your project:

```sql
select created_at, ip_address, payload from auth.audit_log_entries order by created_at desc limit 5;
```

Then keep 30 days:

```sql
delete from auth.audit_log_entries where created_at < now() - interval '30 days';
```

And after deleting an account by hand, remove that user's entries:

```sql
delete from auth.audit_log_entries where payload->>'actor_id' = '<user uuid>';
```

## Backups

On the free plan there are none, so account deletion is complete the moment it
runs, but a failure or a mistake can lose every user's data. Before a public
launch choose one:

1. Supabase Pro: daily backups kept 7 days. Deleted data then lingers for up to 7 days, which the policy already allows for.
2. A weekly `supabase db dump`, encrypted, stored in the EU, keeping the last two. Deleted data then lingers for up to 14 days; change the policy to say so.

## Open questions

- Netlify's retention for request logs of a free-plan site was not found on a primary source. Ask Netlify or check the dashboard, then fill in the table.
- Whether `auth.audit_log_entries` is written by default for this project: check the setting in the dashboard.
