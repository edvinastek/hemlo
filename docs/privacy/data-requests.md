Not legal advice: drafted from public sources, and to be checked by someone qualified before Hemlo launches publicly.

# Handling data requests

People can ask to see, correct, delete or take their data, or object to or
restrict its use (GDPR articles 15 to 22). Requests arrive by email at the
contact address. The rules that matter ([GDPR art. 12](https://gdpr-info.eu/art-12-gdpr/)):

- **Reply within one month** of receiving the request. It can be extended by two further months for complex or numerous requests, but you must say so, with the reason, within the first month.
- **Free of charge.**
- If you have reasonable doubt about who is asking, you may ask for what you need to confirm it, and nothing more.

## Every request, in order

1. Log it: date received, address, what is asked, due date (received + one month). Keep the log with the emails (two years after closing, see `retention.md`).
2. Check identity. A request sent from the email address of the account is enough. From any other address, ask them to write from the account's address, or to sign in to the app and use More → Data themselves. Never send data to an address that is not the account's.
3. Find the account (SQL below). If there is none, say so.
4. Do what is asked, using the steps below.
5. Reply with the matching template, note the date closed in the log.

Most requests the app already handles by itself. Say so in the reply, but still
do the request if they ask you to: they are entitled to.

## Find the account

In the Supabase dashboard → SQL editor:

```sql
select id, email, created_at, last_sign_in_at,
       raw_user_meta_data->>'health_consent_at' as consent_at,
       raw_user_meta_data->>'privacy_version'  as policy_version
from auth.users where email = lower('person@example.com');
```

Keep the `id` (a uuid) for the steps below.

## Access and portability (articles 15 and 20)

The app's Settings → Data and account → Export → "Whole account (backup file)" gives a JSON
file of the profile and plan (tasks, series and their exceptions, goals, milestones, calendar events),
targets, weigh-ins, food log, meal plan, habits, supplements and their logs, sleep, training logs and
routines, module settings and every module record (Finance included), followed calendars, the foods,
exercises and recipes the person added, and the household's stock, shopping list and prices
(`src/lib/bundle.ts`). It leaves out the household's chores and their logs, notes kept as note pages,
reviews and reminders, and anything kept only on the server (the consent record, calendar link hashes,
photos in module records), so for a formal access request still run this and send the result as a
`.json` file, with the photos attached:

```sql
with u as (select id from auth.users where email = lower('person@example.com')),
p as (
  select id from public.profile
  where user_id = (select id from u)
     or (user_id is null and household_id in (select id from public.household where owner_id = (select id from u)))
),
h as (select household_id as id from public.household_member where user_id = (select id from u))
select jsonb_pretty(jsonb_build_object(
  'account', (select jsonb_build_object('email', email, 'created_at', created_at, 'last_sign_in_at', last_sign_in_at,
                                        'consent', raw_user_meta_data) from auth.users where id = (select id from u)),
  'profile',          (select jsonb_agg(to_jsonb(t)) from public.profile t          where t.id in (select id from p)),
  'goal',             (select jsonb_agg(to_jsonb(t)) from public.goal t             where t.profile_id in (select id from p)),
  'milestone',        (select jsonb_agg(to_jsonb(t)) from public.milestone t        where t.goal_id in (select id from public.goal where profile_id in (select id from p))),
  'phase',            (select jsonb_agg(to_jsonb(t)) from public.phase t            where t.profile_id in (select id from p)),
  'series',           (select jsonb_agg(to_jsonb(t)) from public.series t           where t.profile_id in (select id from p)),
  'series_exception', (select jsonb_agg(to_jsonb(t)) from public.series_exception t where t.series_id in (select id from public.series where profile_id in (select id from p))),
  'away_period',      (select jsonb_agg(to_jsonb(t)) from public.away_period t      where t.profile_id in (select id from p)),
  'task',             (select jsonb_agg(to_jsonb(t)) from public.task t             where t.profile_id in (select id from p)),
  'task_event',       (select jsonb_agg(to_jsonb(t)) from public.task_event t       where t.task_id in (select id from public.task where profile_id in (select id from p))),
  'calendar_event',   (select jsonb_agg(to_jsonb(t)) from public.calendar_event t   where t.profile_id in (select id from p)),
  'note_section',     (select jsonb_agg(to_jsonb(t)) from public.note_section t     where t.profile_id in (select id from p)),
  'note_page',        (select jsonb_agg(to_jsonb(t)) from public.note_page t        where t.section_id in (select id from public.note_section where profile_id in (select id from p))),
  'review',           (select jsonb_agg(to_jsonb(t)) from public.review t           where t.profile_id in (select id from p)),
  'reminder',         (select jsonb_agg(to_jsonb(t)) from public.reminder t         where t.profile_id in (select id from p)),
  'channel_setting',  (select jsonb_agg(to_jsonb(t)) from public.channel_setting t  where t.profile_id in (select id from p)),
  'target',           (select jsonb_agg(to_jsonb(t)) from public.target t           where t.profile_id in (select id from p)),
  'body_log',         (select jsonb_agg(to_jsonb(t)) from public.body_log t         where t.profile_id in (select id from p)),
  'meal_plan_slot',   (select jsonb_agg(to_jsonb(t)) from public.meal_plan_slot t   where t.profile_id in (select id from p)),
  'food_log',         (select jsonb_agg(to_jsonb(t)) from public.food_log t         where t.profile_id in (select id from p)),
  'workout_log',      (select jsonb_agg(to_jsonb(t)) from public.workout_log t      where t.profile_id in (select id from p)),
  'sleep_log',        (select jsonb_agg(to_jsonb(t)) from public.sleep_log t        where t.profile_id in (select id from p)),
  'habit',            (select jsonb_agg(to_jsonb(t)) from public.habit t            where t.profile_id in (select id from p)),
  'habit_log',        (select jsonb_agg(to_jsonb(t)) from public.habit_log t        where t.habit_id in (select id from public.habit where profile_id in (select id from p))),
  'supplement',       (select jsonb_agg(to_jsonb(t)) from public.supplement t       where t.profile_id in (select id from p)),
  'supplement_log',   (select jsonb_agg(to_jsonb(t)) from public.supplement_log t   where t.supplement_id in (select id from public.supplement where profile_id in (select id from p))),
  'module_instance',  (select jsonb_agg(to_jsonb(t)) from public.module_instance t  where t.profile_id in (select id from p)),
  'module_record',    (select jsonb_agg(to_jsonb(t)) from public.module_record t    where t.profile_id in (select id from p)),
  'own_foods',        (select jsonb_agg(to_jsonb(t)) from public.food t             where t.owner_id = (select id from u)),
  'own_recipes',      (select jsonb_agg(to_jsonb(t)) from public.recipe t           where t.owner_id = (select id from u)),
  'own_recipe_lines', (select jsonb_agg(to_jsonb(t)) from public.recipe_line t      where t.recipe_id in (select id from public.recipe where owner_id = (select id from u))),
  'own_workouts',     (select jsonb_agg(to_jsonb(t)) from public.workout t          where t.owner_id = (select id from u)),
  'own_exercises',    (select jsonb_agg(to_jsonb(t)) from public.exercise t         where t.owner_id = (select id from u)),
  'own_stores',       (select jsonb_agg(to_jsonb(t)) from public.store t            where t.owner_id = (select id from u)),
  'own_templates',    (select jsonb_agg(to_jsonb(t)) from public.template t         where t.owner_id = (select id from u)),
  'households',       (select jsonb_agg(to_jsonb(t)) from public.household t        where t.id in (select id from h)),
  'stock',            (select jsonb_agg(to_jsonb(t)) from public.stock t            where t.household_id in (select id from h)),
  'shopping_trip',    (select jsonb_agg(to_jsonb(t)) from public.shopping_trip t    where t.household_id in (select id from h)),
  'shopping_item',    (select jsonb_agg(to_jsonb(t)) from public.shopping_item t    where t.trip_id in (select id from public.shopping_trip where household_id in (select id from h))),
  -- Version 16 to 18: the household's list, prices and chores, the member names, routines and followed calendars.
  'household_member', (select jsonb_agg(to_jsonb(t)) from public.household_member t where t.household_id in (select id from h)),
  'shopping_entry',   (select jsonb_agg(to_jsonb(t)) from public.shopping_entry t   where t.household_id in (select id from h)),
  'shop_price',       (select jsonb_agg(to_jsonb(t)) from public.shop_price t       where t.household_id in (select id from h)),
  'chore',            (select jsonb_agg(to_jsonb(t)) from public.chore t            where t.household_id in (select id from h)),
  'chore_log',        (select jsonb_agg(to_jsonb(t)) from public.chore_log t        where t.chore_id in (select id from public.chore where household_id in (select id from h))),
  'routine',          (select jsonb_agg(to_jsonb(t)) from public.routine t          where t.profile_id in (select id from p)),
  'routine_line',     (select jsonb_agg(to_jsonb(t)) from public.routine_line t     where t.routine_id in (select id from public.routine where profile_id in (select id from p))),
  'calendar_subscription', (select jsonb_agg(to_jsonb(t)) from public.calendar_subscription t where t.profile_id in (select id from p))
)) as data;
```

Photos in module records (version 18, migration 033) are files in Supabase Storage, not rows: list them in the
dashboard (Storage → the module photos bucket → the folder named after the user's id) and attach them.

Prices the person shared with Open Prices are not Hemlo's: they are public on prices.openfoodfacts.org under the
person's Open Food Facts user name, and Open Food Facts answers for them. Hemlo's server holds nothing about them.

This includes items the person deleted in the app (rows with `deleted_at` set):
they are still held, so they are part of an access request. If the household is
shared, `stock` and shopping belong to both members; that is fine to include,
as they can already see it in the app.

Along with the data, article 15 asks you to tell them: why it is processed, the
categories, who receives it (Supabase; the email delivery service), how long
it is kept, their other rights, the right to complain to the AP, and that there
is no automated decision-making with legal or similar effect. The template
below covers it by pointing at the policy and adding the specifics.

## Correction (article 16)

Everything can be edited in the app. If they cannot, or ask you to, change it by
hand, for example:

```sql
update public.profile set birth_date = '1990-04-01'
where user_id = (select id from auth.users where email = lower('person@example.com'));
```

Changing a row on the server is picked up by their devices at the next sync,
because `updated_at` changes (`011_updated_at.sql`).

## Deletion (article 17) and withdrawing consent

The app (More → Data → Delete account) and the web page (`delete.html`) do this
themselves. When asked by email, run the same function as that user:

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '<user uuid>', 'role', 'authenticated')::text, true);
select public.delete_my_account();
commit;
```

`delete_my_account()` finds the user through `auth.uid()`, which reads the `sub`
claim set above. Try this once on a test account before you need it for real.

Then remove what the function does not:

```sql
delete from private.signup_allowlist where email = lower('person@example.com');
-- only if database audit logs are on (see retention.md)
delete from auth.audit_log_entries where payload->>'actor_id' = '<user uuid>';
```

Check it is gone: `select count(*) from auth.users where id = '<user uuid>';` and
`select count(*) from public.profile where user_id = '<user uuid>';` both 0.

**Do not delete the user from Authentication → Users in the dashboard.**
`profile.user_id` is `on delete set null` (`001_core.sql`), so that deletes only
the login and leaves the profile, and every weigh-in and food log under it,
behind without an owner.

For **one item** rather than the whole account (for example "erase my weigh-ins
from March"), delete the rows by hand; the app only soft-deletes:

```sql
delete from public.body_log
where profile_id in (select id from public.profile where user_id = '<user uuid>')
  and log_date between '2026-03-01' and '2026-03-31';
```

Tell them to sign out and in on their devices afterwards, so no device holds the
old copy and uploads it again.

## Restriction (article 18) and objection (article 21)

- Hemlo's processing rests on the contract and on consent, not on legitimate interest, so the right to object (art. 21) mostly does not apply to app data. What someone who objects usually wants is to stop: that is withdrawing consent, which is account deletion. Explain that, and offer it.
- The public site's hosting logs rest on legitimate interest. An objection there can be answered: the logs are Netlify's, kept only as long as needed for security, and Hemlo does not use them.
- Restriction while accuracy is disputed: ask them to stop using the app while you check; the data is not used for anything but their own planning, so nothing else needs pausing. Record it.

## Reply templates

Plain sentences, no legal jargon beyond what is needed. Replace the brackets.

### Received

> Subject: Your request about your Hemlo data
>
> Thank you, I have your request of [date] to [see / correct / delete] your Hemlo data. I will reply by [date, one month later] at the latest.
>
> [Name], Hemlo

### Identity check

> I received a request about the Hemlo account for [address], but it came from a different address. To protect the account, please send the request again from [address], the one the account uses. If you no longer have access to it, tell me and we will find another way to confirm it is you.

### Access

> Attached is a copy of everything Hemlo holds about you, as a JSON file. It includes items you deleted in the app, which are kept, hidden, until the account is deleted.
>
> Why and how it is used, and how long it is kept, is in the privacy policy: [policy URL]. In short: it is used only to plan your days, meals and shopping; it is stored by Supabase in Frankfurt, Germany, on my behalf; nothing is shared or sold, and no decisions are made about you automatically.
>
> The app can also export most of this itself: More → Data → Export.
>
> If you are unhappy with how your data is handled, you can complain to the Autoriteit Persoonsgegevens.

### Correction done

> I have changed [field] to [new value]. Your devices will pick up the change the next time they sync.

### Deletion done

> Your Hemlo account and everything in it were deleted on [date]: your profile, plan, weigh-ins, food and training logs, recipes and settings. [Hemlo has no backups at the moment, so nothing remains.] / [Backups that still contain it are overwritten by [date].] If Hemlo is still installed on a phone, sign out or uninstall it to remove the copy on that device.
>
> I keep this email exchange for two years as a record that the request was handled, and then delete it.

### Objection

> Hemlo uses your data only to provide the planner, on the basis of our agreement and the consent you gave for your health details. If you no longer want Hemlo to use your data, the way to stop it is to delete your account, which removes everything. Would you like me to do that? Or you can do it yourself under More → Data → Delete account.

### More time needed

> Your request needs more time because [reason]. I will reply by [date, at most three months after the request].

### No account found

> I could not find a Hemlo account for [address]. If you used a different address, send the request from that one.
