Not legal advice: drafted from public sources, and to be checked by someone qualified before GetIt launches publicly.

# Breach plan

For one person running GetIt. A personal data breach is any security incident
that leads to personal data being lost, destroyed, changed, disclosed or
accessed without authorisation, including by accident. Losing the database with
no backup counts, as does a policy mistake that lets one account read another's
weigh-ins.

The clock: the AP must be told **within 72 hours of becoming aware** of a breach,
unless it is unlikely to result in a risk to people ([GDPR art. 33](https://gdpr-info.eu/art-33-gdpr/)).
"Aware" means reasonably certain that an incident has affected personal data,
not the moment the investigation ends. Report on time with what you know, and
add to it later: the AP allows a first notification to be supplemented,
adjusted or withdrawn ([AP: how to report](https://www.autoriteitpersoonsgegevens.nl/en/themes/security/data-breaches/this-is-how-you-report-a-data-breach)).

Write the time you became aware at the top of the register entry (step 6) as
soon as you suspect something. Everything else hangs off that time.

## 1. Detect

Signals that start this plan:

- An email from Supabase about a security incident. Its DPA promises notice "without undue delay, and where feasible, within forty-eight (48) hours" ([Supabase DPA](https://supabase.com/legal/dpa)), so that can already use most of your 72 hours: act the same day.
- A user or tester says they can see data that is not theirs, or that their account changed without them.
- GitHub secret scanning, or you notice a secret key in a commit, a screenshot, a paste or a chat.
- Sign-ups from addresses you did not allowlist, or odd traffic in Supabase's logs.
- The Supabase project is paused, deleted or unreachable and data may be gone.
- A lost or stolen laptop or phone that is signed in to Supabase, Play Console, GitHub or the contact mailbox.

**Supabase keeps logs for one day on the free plan** ([pricing](https://supabase.com/pricing)).
The first thing to do on any suspicion is open Logs in the dashboard and save
what is there (API gateway, Auth, Postgres) for the relevant hours, as CSV or
screenshots, outside the repository. Tomorrow it is gone.

## 2. Contain

Stop it getting worse. Pick what fits; most incidents need one or two of these.

**A secret key leaked** (anything starting `sb_secret_`, or a legacy `service_role` key). The secret key bypasses row-level security, so treat this as full database access.

1. Supabase → Project Settings → API Keys → create a new secret key.
2. Put it wherever it is used (GetIt's app never uses one; check scripts and CI secrets).
3. Delete the leaked key. For a legacy `service_role` key, deactivate the legacy keys in the same section ([Supabase API keys](https://supabase.com/docs/guides/api/api-keys)).

**The publishable key was abused** (for example sign-up spam). It ships in every build and is public by design; row-level security protects the data. Do not rotate it unless you must, because the installed app stops working until a new build is out. Instead close sign-ups (below).

**Someone may be signed in as a user.** Sign that user out everywhere and have them reset their password:

```sql
-- find the user
select id, email, last_sign_in_at from auth.users where email = 'person@example.com';
-- end every session they have; their refresh tokens stop working
delete from auth.sessions where user_id = '<user uuid>';
```

An access token already issued stays valid until it expires (one hour by default, [Supabase sessions](https://supabase.com/docs/guides/auth/sessions)). Then send them a password reset from Authentication → Users.

**Sign everyone out.** Delete all sessions (`delete from auth.sessions;`). To also cut access tokens that are still valid, go to Project Settings → JWT signing keys, press Rotate keys, then revoke the previous key ([Supabase signing keys](https://supabase.com/docs/guides/auth/signing-keys)). Revoking the old key signs everyone out at once.

**Close sign-ups.**

```sql
update private.settings set value = 'invite' where key = 'signups';
-- and, if the allowlist itself was the problem, empty it
delete from private.signup_allowlist;
```

**A database policy lets one account see another's data.** Write a migration that closes it (drop and rebuild the policy, as `012_security.sql` does), apply it, then check with a second test account that the data is no longer visible. Until it is fixed, you may pause the project (Project Settings → General → Pause project). That takes the app offline for everyone; the app keeps working from its local copy and syncs when it is back.

**A device was lost.** From another device, sign out of Supabase, GitHub, Google and the mailbox everywhere, and change those passwords. If it held the Android upload key, ask Google to reset the upload key (Play App Signing keeps the app key safe).

## 3. Assess

Answer, and write the answers in the register:

- What happened, when it started, when it stopped, when you became aware.
- Which data: account emails only, or health data (weight, food, training, sleep)?
- How many people, and who (users, testers).
- Was the data readable? Data encrypted at rest in Supabase is not protection if it was read through the API.
- What can happen to the people: embarrassment, discrimination, pressure from someone who knows their weight or eating, phishing using their email.

Then decide:

| Situation | Report to the AP? | Tell the people? |
| --- | --- | --- |
| No personal data was affected, or only data that was already public | No | No |
| A secret key leaked, rotated within minutes, logs show no use of it | Usually no; record why | No |
| Email addresses of testers exposed | Yes: a risk (phishing), not usually high | Usually not, but a short note is decent |
| Any health data seen by someone who should not see it | Yes | Yes: health data is a special category, so treat this as high risk |
| Database lost with no backup (health data gone) | Yes: loss of availability | Yes, they need to know their history is gone |
| Unsure within 72 hours | Yes: report, then supplement or withdraw | Decide when the facts are in |

Health data is exactly what article 34 is about: when a breach "is likely to
result in a high risk", people must be told "without undue delay"
([GDPR art. 34](https://gdpr-info.eu/art-34-gdpr/)).

## 4. Notify the AP (within 72 hours when required)

Use the AP's online form, the only way it accepts breach reports ([AP: how to report](https://www.autoriteitpersoonsgegevens.nl/en/themes/security/data-breaches/this-is-how-you-report-a-data-breach); the form is at [datalekken.autoriteitpersoonsgegevens.nl](https://datalekken.autoriteitpersoonsgegevens.nl/)).
Have ready, as article 33(3) requires:

- your name and contact address (as controller; there is no DPO);
- what happened, and when, and when you found out;
- categories and approximate number of people and records;
- which data, noting that health data is involved if it is;
- likely consequences for the people;
- what you have done and will do, and whether and how you told the people.

Save the confirmation and the report number in the register. If facts change,
send a follow-up with the same number.

## 5. Tell users (when the risk is high)

By email, from the contact address, to the affected people only, in plain
language ([art. 34(2)](https://gdpr-info.eu/art-34-gdpr/)):

> Subject: A security problem with your GetIt account
>
> On [date], [what happened, in one or two sentences]. It affected [which data, for example your weigh-ins and food log from 1 to 14 March].
>
> What this could mean for you: [plain consequence, for example someone else may have seen these entries].
>
> What I have done: [for example closed the gap on 15 March at 10:00 and signed every account out].
>
> What you can do: [for example choose a new password; be careful with emails that ask for your password]. You can export or delete your data in the app under More → Data.
>
> I have reported this to the Autoriteit Persoonsgegevens. If you have questions, reply to this email. You can also complain to the Autoriteit Persoonsgegevens.
>
> [Name], GetIt

## 6. Record

Every breach goes in the register, including the ones not reported
([art. 33(5)](https://gdpr-info.eu/art-33-gdpr/); [AP: what to do](https://www.autoriteitpersoonsgegevens.nl/en/themes/security/data-breaches/data-breach-this-is-what-you-have-to-do)).
Keep it outside the repository (a private document or spreadsheet), for five
years after closing. One entry per breach:

| Field | Example |
| --- | --- |
| Number | 2026-01 |
| Became aware | 2026-10-03 14:20 |
| What happened | Secret key pasted in a public gist |
| Started / stopped | 2026-10-03 13:55 / 2026-10-03 14:31 |
| Data and people affected | None used: logs show no requests with the key |
| Risk assessment | Unlikely to result in a risk; key deleted within 36 minutes |
| Reported to AP | No; reason recorded above |
| People told | No |
| Measures | Key rotated; secret scanning enabled; note added to this plan |
| Closed | 2026-10-03 |

## 7. Afterwards

- Fix the cause, not only the symptom, and add the lesson to this file.
- If the policy or the records no longer match reality, update `src/legal/policy.ts` and the files in `docs/privacy/`.
