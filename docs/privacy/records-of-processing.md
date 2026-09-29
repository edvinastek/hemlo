Not legal advice: drafted from public sources, and to be checked by someone qualified before GetIt launches publicly.

# Records of processing (GDPR article 30)

Register of processing activities for GetIt, as the app and its services are
on 24 September 2026 (app version 0.2.0, database migrations 001 to 013; calendar links, migration 020, added 28 September 2026, narrowed by migration 024 the same day).
Update it in the same commit as any change to what is collected, who receives
it, or how long it is kept. `src/legal/policy.ts` is the public version of the
same facts, and the two must agree.

## Is this register required?

Yes. Article 30(5) exempts organisations with fewer than 250 people, but the
exemption does not apply when "the processing is not occasional, or the
processing includes special categories of data as referred to in Article 9(1)"
([GDPR art. 30](https://gdpr-info.eu/art-30-gdpr/)). GetIt does both: it
processes health data (weight, food eaten, training, sleep), and it does so
every day for every user. A one-person controller is not exempt. The AP may ask
to see this register (art. 30(4)).

## Controller

| | |
| --- | --- |
| Controller | The developer of GetIt, a natural person in the Netherlands, trading without a registered company. The legal name is the value of `VITE_CONTROLLER_NAME` in the build. |
| Contact | The address in `VITE_CONTACT_EMAIL`, which is also the Play listing's contact address. |
| Representative | Not needed: the controller is established in the EU (art. 27). |
| Data protection officer | None appointed. Not required: GetIt is not a public authority, and its core activity is not large-scale processing of health data or large-scale monitoring (art. 37(1)). Revisit if the user base becomes large. |
| Supervisory authority | Autoriteit Persoonsgegevens (AP), Den Haag. |

## Activity 1: the planner (accounts and app data)

| Article 30(1) item | Entry |
| --- | --- |
| (b) Purposes | Provide the planner the user signed up for: keep their account, calculate calorie and protein targets, plan days, meals and shopping, keep logs, and sync them between the user's devices. |
| Legal basis | Account, profile and plan: art. 6(1)(b), performance of a contract. Health data: art. 9(2)(a), explicit consent, given at sign-up by a checkbox that cannot be pre-ticked; the time and the policy version are stored with the account (`health_consent_at`, `privacy_version` in the user's metadata, set in `src/screens/Auth.tsx`). |
| (c) Data subjects | Users aged 16 or over who create an account. Later, people a user plans for in a "managed profile" (the database allows it; the app does not offer it yet; see the DPIA screening). |
| (c) Personal data | Email address; password (stored only as a one-way hash by Supabase Auth); name; sex; date of birth; height; activity level; goal; time zone; day start and end; tasks, notes, goals, calendar events, reviews, reminders; recipes the user writes; stock and shopping lists; household membership. |
| (c) Special category data | Health: weigh-ins, waist measurements, calorie and protein targets, meal plans and food logs, training sessions and sets, sleep logs, habits and supplements. |
| (d) Recipients | Supabase (processor: database, authentication, logs, and the two calendar functions below). The email delivery service that sends confirmation and reset emails (processor, not chosen yet; see `processors.md`). No one else. Household members see only the shared stock list and shopping trips, and the foods that stock list points at while they are in it (the whole food row: name, brand, barcode, figures, shops and who owns it; read-only; `supabase/migrations/025_household_foods.sql`), never another member's profile, health data or plan (enforced by row-level security, `supabase/migrations/012_security.sql`). A recipe the user proposes to everyone is read by the app's owner for review (with the user's profile name, never the email address) and, once approved, by every signed-in user without the author's name; it stops being shared when set back to private or deleted, and is deleted with the account (`supabase/migrations/019_recipe_sharing.sql`). Product searches, barcodes and price lookups go from the user's device straight to Open Food Facts and Open Prices (openfoodfacts.org), which act as independent controllers of their own public services, not as GetIt's processors: they receive the search words or barcode and, as any website does, the IP address and device type, and never an account, name or health data (`src/lib/products.ts`; their policy: world.openfoodfacts.org/privacy). On Android the barcode is read by Google's code scanner in Google Play services, which returns only the number to GetIt; Google may collect usage metrics about the scanner under its own terms (check Play's Data safety answers). A product the user adds is stored as one of their own foods (`supabase/migrations/021_food_products.sql`). |
| Calendar links (migration 020, optional, the user's choice) | *Feed link (GetIt → Google Calendar):* `calendar_feed` stores only the SHA-256 hash of a random 32-byte token per profile; the token is shown once. The `calendar-feed` Edge Function serves, to anyone holding the link, the titles, times, sections and places of the profile's non-health tasks and own agenda events from 3 months back to 12 ahead; a repeating task goes out as one repeating event cut to the same window. Task notes go out only if `calendar.feed_notes` is on. Left out: every task and repeating series from a module the user built (the app cannot tell if it is about health); every task and repeating series that is health data under (c) above, meaning source `meal`, `workout` or `habit`, module `nutrition`, `health`, `training`, `sleep`, `habits` or `supplements`, or section Meal, Training or Body (filtered twice: in the function's queries and in `feedEvents`, `src/lib/calendar-links-rules.ts`); events from followed calendars; and the profile's name (the calendar is called just "GetIt"). The function logs only the kind of an error, never its message. The user hands the link to Google Calendar, which fetches it every few hours and is then a recipient under its own terms (an independent controller, chosen by the user). *Followed calendar (Google → GetIt):* `calendar_subscription` stores the calendar's name, colour and secret iCal address (encrypted at rest by Supabase; row-level security, owner only); the `calendar-fetch` Edge Function fetches the address on the user's request and returns the file to the app without keeping it, and logs only the kind of an error and the server's name, never the address's path or query; the reason a fetch failed (`last_error`) is stored with any address taken out. The events are kept only in the local copy on the user's devices (never sent to the server, `src/lib/sync.ts`), from 3 months back to 12 ahead, and removed with the calendar. Removing a followed calendar erases its address on the server at once (a trigger in `supabase/migrations/024_calendar_privacy.sql`); the row stays, marked deleted, with its name, colour, profile and when it was last fetched (and why a fetch last failed, addresses removed), so other devices learn of the removal. |
| (e) Transfers outside the EEA | Data is stored in Supabase's `eu-central-1` region (Frankfurt). Supabase's contracting entity is Supabase Pte. Ltd. (Singapore) and its sub-processors include US companies (for example Supabase, Inc. for support, and Cloudflare, Inc., whose network carries API traffic). Any access from outside the EEA is covered by the Standard Contractual Clauses built into Supabase's DPA ([Supabase DPA](https://supabase.com/legal/dpa)). |
| (f) Retention | Until the user deletes their account; then removed from the database at once. Details and the exceptions (logs, soft-deleted items, backups) are in `retention.md`. |
| (g) Security | See "Security measures" below. |

## Activity 2: requests, questions and complaints by email

| Item | Entry |
| --- | --- |
| Purposes | Answer questions and handle data-protection requests (access, correction, deletion, objection), and keep proof that they were handled. |
| Legal basis | Art. 6(1)(c), legal obligation (articles 12 to 22 and 5(2) GDPR). |
| Data subjects | Users and anyone else who writes to the contact address. |
| Personal data | Email address, name if given, the content of the message, and a short log entry per request (date received, type, date closed). Health data only if the sender includes it. |
| Recipients | The mailbox provider behind the contact address (processor if it is a business mailbox with a DPA; see `processors.md`). |
| Transfers | Depends on the mailbox provider; to be filled in once chosen. |
| Retention | Messages and the request log: two years after the request is closed, then deleted. |
| Security | Mailbox protected by a unique password and two-factor sign-in; no forwarding to other addresses. |

## Activity 3: closed testing on Google Play

| Item | Entry |
| --- | --- |
| Purposes | Run the closed test Google Play requires before a personal developer account can publish (12 testers, 14 days), and let those testers sign up while sign-ups are invite-only. |
| Legal basis | Art. 6(1)(a), consent: each tester asks to join and gives their own address. |
| Data subjects | Friends and acquaintances who agree to test; the Google Play review team's test account. |
| Personal data | Email address (the Google account address on their phone), and whether they joined. |
| Recipients | Google (the Google Group or email list in Play Console; Google acts under its own terms for Play and Groups). Supabase (the address is stored in `private.signup_allowlist`). |
| Transfers | Google may process the addresses outside the EEA under its own terms. |
| Retention | Allowlist row: removed when the tester deletes their account, or when sign-ups open to the public. Google Group and Play tester list: emptied when the closed test ends. Local lists (`store/testers/*.txt`, `*.csv`) are never committed and are deleted once the SQL has been run. |
| Security | `private.signup_allowlist` is not reachable through the API (`revoke all ... from public, anon, authenticated`). The Google Group is set to "Only invited users" with the member list visible to managers only (see `store/testers/google-group-setup.md`). |

## Activity 4: the public privacy and account-deletion pages

| Item | Entry |
| --- | --- |
| Purposes | Publish the privacy policy, and let people delete their account without the app, as Google Play requires. |
| Legal basis | Art. 6(1)(c) for publishing the policy and handling deletion; art. 6(1)(f), legitimate interest, for the hosting provider's technical logs needed to serve and protect the site. |
| Data subjects | Visitors of the site. |
| Personal data | IP address and request details, seen by Cloudflare while serving the static files. On the deletion page, the email and password typed in go straight from the visitor's browser to Supabase (`site/delete.ts`); the static host never receives them. |
| Recipients | Cloudflare (processor for the hosting, [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)); Supabase for the deletion itself. |
| Transfers | Cloudflare, Inc. is a US company; its DPA includes the SCCs and it is certified under the EU-US Data Privacy Framework ([Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)). |
| Retention | Cloudflare's own log retention (not configurable on the free plan; not confirmed, see `retention.md`). The site sets no cookies and loads no analytics. |
| Security | HTTPS only; no third-party scripts; the page uses only the public (publishable) Supabase key. |

## Activity 5: breach register

| Item | Entry |
| --- | --- |
| Purposes | Record every personal data breach, reported or not, as article 33(5) requires. |
| Legal basis | Art. 6(1)(c), legal obligation. |
| Personal data | Only what is needed to describe the breach; no copies of the leaked data. |
| Retention | Five years after the breach is closed. |
| Where | `incident-response.md` describes the register. Keep it outside the repository. |

## Security measures (article 32)

Technical:

- Encryption in transit (TLS) between every client and Supabase, and at rest (AES-256) in Supabase ([Supabase security](https://supabase.com/security)).
- Row-level security on every table; each policy checks the signed-in user. Helper functions live in a `private` schema the API cannot reach; the anonymous role has no table access (`012_security.sql`).
- Sign-ups are invite-only until launch (`private.signup_allowlist`).
- Passwords: at least 10 characters in the app, stored by Supabase Auth only as a hash. Sign-in links use PKCE, so a forwarded link cannot sign anyone in (`src/lib/supabase.ts`).
- Only the publishable key ships in the app; the secret key is never in any build.
- Android: app data is excluded from cloud backup and device transfer (`allowBackup="false"` and data extraction rules); reminders use a private notification channel so a locked phone shows no text; the local copy is cleared on sign-out. The home-screen widget, if the user adds one, draws today's tasks and habits from a copy in the app's private storage (same backup exclusion); sign-out clears it and any ticks waiting in it. The widget's tick receiver is not exported, so no other app can change data through it.
- Account deletion in the app and on the web, through one database function (`delete_my_account`).
- No analytics, advertising, crash-reporting or other third-party SDKs.

Organisational:

- One person has access to the Supabase project, the Play Console and the contact mailbox, each with a unique password and two-factor sign-in.
- The Android upload key and its passwords are kept out of the repository (`.gitignore`) and stored in a password manager.
- Data requests follow `data-requests.md`; breaches follow `incident-response.md`.
- Tester lists are never committed (`.gitignore`).

Known gaps, tracked in `processors.md` under "What the developer must still do":

- No automatic backups on the Supabase free plan ([Supabase backups](https://supabase.com/docs/guides/platform/backups)). Losing the database would be an availability breach.
- Items deleted inside the app are soft-deleted (marked with `deleted_at` and hidden) and stay in the database until the account is deleted.
- If "Write audit logs to the database" is on in Supabase, sign-in events with IP addresses collect in `auth.audit_log_entries` and are not removed by account deletion.
