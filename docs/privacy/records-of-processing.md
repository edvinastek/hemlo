Not legal advice: drafted from public sources, and to be checked by someone qualified before Visuma launches publicly.

# Records of processing (GDPR article 30)

Register of processing activities for Visuma, as the app and its services are
on 24 September 2026 (app version 0.2.0, database migrations 001 to 013; calendar links, migration 020, added 28 September 2026, narrowed by migration 024 the same day), brought up to version 18 on 4 October 2026 (migrations up to 035: households sharing chores and prices, Finance, built modules with photos, stats widgets, and the optional sharing of prices with Open Prices).
Update it in the same commit as any change to what is collected, who receives
it, or how long it is kept. `src/legal/policy.ts` is the public version of the
same facts, and the two must agree.

## Is this register required?

Yes. Article 30(5) exempts organisations with fewer than 250 people, but the
exemption does not apply when "the processing is not occasional, or the
processing includes special categories of data as referred to in Article 9(1)"
([GDPR art. 30](https://gdpr-info.eu/art-30-gdpr/)). Visuma does both: it
processes health data (weight, food eaten, training, sleep), and it does so
every day for every user. A one-person controller is not exempt. The AP may ask
to see this register (art. 30(4)).

## Controller

| | |
| --- | --- |
| Controller | The developer of Visuma, a natural person in the Netherlands, trading without a registered company. The legal name is the value of `VITE_CONTROLLER_NAME` in the build. |
| Contact | The address in `VITE_CONTACT_EMAIL`, which is also the Play listing's contact address. |
| Representative | Not needed: the controller is established in the EU (art. 27). |
| Data protection officer | None appointed. Not required: Visuma is not a public authority, and its core activity is not large-scale processing of health data or large-scale monitoring (art. 37(1)). Revisit if the user base becomes large. |
| Supervisory authority | Autoriteit Persoonsgegevens (AP), Den Haag. |

## Activity 1: the planner (accounts and app data)

| Article 30(1) item | Entry |
| --- | --- |
| (b) Purposes | Provide the planner the user signed up for: keep their account, calculate calorie and protein targets, plan days, meals and shopping, keep logs, and sync them between the user's devices. |
| Legal basis | Account, profile and plan: art. 6(1)(b), performance of a contract. Health data: art. 9(2)(a), explicit consent, given at sign-up by a checkbox that cannot be pre-ticked; the time and the policy version are stored with the account (`health_consent_at`, `privacy_version` in the user's metadata, set in `src/screens/Auth.tsx`). |
| (c) Data subjects | Users aged 16 or over who create an account. Later, people a user plans for in a "managed profile" (the database allows it; the app does not offer it yet; see the DPIA screening). |
| (c) Personal data | Email address; password (stored only as a one-way hash by Supabase Auth); name; sex; date of birth; height; activity level; goal; time zone; day start and end; country and town if given; tasks, notes and note templates, goals, projects and milestones, routines, calendar events, reviews, reminders, books (Learning), saved stats views; recipes the user writes; own foods and exercises; stock, shopping lists and the prices typed per shop (`shop_price`); household membership and the name shown to the household (`household_member.display_name`); household chores and who did them (`chore`, `chore_log.done_by`); Finance records (amounts spent and received, categories, notes, budgets, planned payments; module records, migration 029); records of modules the user builds, and photos added to them (Supabase Storage, private bucket, migration 033); whether the user has read a newer policy (`policy_read` in the user's metadata). On the device only: whether price sharing is on, the Open Food Facts user name and token (Android secure storage, or the browser tab's session storage), which own prices were shared and the Open Prices ids, and the shop place last picked per shop. |
| (c) Special category data | Health: weigh-ins, waist measurements, calorie and protein targets, meal plans and food logs, training sessions and sets, sleep logs, habits, and supplements with their stock counts. Financial data in Finance is not special category data, but is sensitive in practice; it is private to the user (not shared with the household) and kept off the calendar feed. |
| (d) Recipients | Supabase (processor: database, authentication, file storage, logs, and the two calendar functions below). The email delivery service that sends confirmation and reset emails (processor, not chosen yet; see `processors.md`). No one else. Household members see and change what the household shares: the stock list, the shopping list (`shopping_entry`, with who added an item), the prices typed (`shop_price`), the chores and their logs (names, rooms, notes, schedules, assignees as user ids, who did each and when; `026_v16_planner.sql`), and each other's display names; and they can read the foods that stock list points at while they are in it (the whole food row: name, brand, barcode, figures, shops and who owns it; read-only; `supabase/migrations/025_household_foods.sql`). Never another member's profile, health data, plan, Finance, habits, supplements or modules (enforced by row-level security, `supabase/migrations/012_security.sql`, `028_v16_shopping.sql`). A recipe the user proposes to everyone is read by the app's owner for review (with the user's profile name, never the email address) and, once approved, by every signed-in user without the author's name; it stops being shared when set back to private or deleted, and is deleted with the account (`supabase/migrations/019_recipe_sharing.sql`). Product searches, barcodes and price lookups go from the user's device straight to Open Food Facts and Open Prices (openfoodfacts.org), which act as independent controllers of their own public services, not as Visuma's processors: they receive the search words or barcode and, as any website does, the IP address and device type, and never an account, name or health data (`src/lib/products.ts`; their policy: world.openfoodfacts.org/privacy). On Android the barcode is read by Google's code scanner in Google Play services, which returns only the number to Visuma; Google may collect usage metrics about the scanner under its own terms (check Play's Data safety answers). In the iPhone app (version 20) the barcode is read by Google's ML Kit built into the app, on the phone; the picture never leaves it, and ML Kit sends Google usage and diagnostic figures not linked to the user (its own privacy manifest; `store/app-store-answers.md`). A product the user adds is stored as one of their own foods (`supabase/migrations/021_food_products.sql`). |
| Sharing prices with Open Prices (v18, PRICE-05, optional, the user's choice per price) | Off by default, per device. Turning it on, the user signs in with an Open Food Facts account: the user name and password go once from the device to `prices.openfoodfacts.org/api/v1/auth` (never stored); the token returned is kept in Android's secure storage (`@aparajita/capacitor-secure-storage`) or the browser tab's session storage, tied to the Visuma account, and forgotten on sign-out, when sharing is turned off, and when the device's local copy is reset. Each share is one tap on one own price of a product with a barcode: the device uploads the photo of the price tag or receipt (`/api/v1/proofs/upload`; resized to at most 1600 px and re-encoded as JPEG on the device, which drops EXIF data such as GPS position) and then the price (`/api/v1/prices`: barcode, price, currency, date, offer flag and normal price, the shop's OpenStreetMap id and type, the proof id; `app_name=Visuma` in the query). Open Prices publishes it under the ODbL with the user's Open Food Facts user name: Open Food Facts is an independent controller of that publication, and the user removes it there. To find the shop the device asks Open Prices' location list (name and town typed) and, only when the user taps for it, OpenStreetMap's Nominatim (one request per tap, at most one a second, cached, identifying User-Agent or Referer, per its usage policy). Nothing about the share reaches Visuma's server. Code: `src/lib/open-prices-rules.ts` (checked by `src/test/openprices.check.mjs`), `open-prices-account.ts`, `open-prices-share.ts`, `src/sections/SharePrice.tsx`. |
| Other lookups from the device | A recipe read from a web address: the device fetches the page itself (the site sees the IP address). Food figures (NEVO, RIVM; USDA FoodData Central for a few foods and units) are built in; no request. |
| Calendar links (migration 020, optional, the user's choice) | *Feed link (Visuma → Google Calendar):* `calendar_feed` stores only the SHA-256 hash of a random 32-byte token per profile; the token is shown once. The `calendar-feed` Edge Function serves, to anyone holding the link, the titles, times, sections and places of the profile's non-health tasks and own agenda events from 3 months back to 12 ahead; a repeating task goes out as one repeating event cut to the same window. Task notes go out only if `calendar.feed_notes` is on. Left out: every task and repeating series from a module the user built (the app cannot tell if it is about health); every task and repeating series that is health data under (c) above, meaning source `meal`, `workout` or `habit`, module `nutrition`, `health`, `training`, `sleep`, `habits` or `supplements`, or section Meal, Training or Body (filtered twice: in the function's queries and in `feedEvents`, `src/lib/calendar-links-rules.ts`); events from followed calendars; and the profile's name (the calendar is called just "Visuma"). The function logs only the kind of an error, never its message. The user hands the link to Google Calendar, which fetches it every few hours and is then a recipient under its own terms (an independent controller, chosen by the user). *Followed calendar (Google → Visuma):* `calendar_subscription` stores the calendar's name, colour and secret iCal address (encrypted at rest by Supabase; row-level security, owner only); the `calendar-fetch` Edge Function fetches the address on the user's request and returns the file to the app without keeping it, and logs only the kind of an error and the server's name, never the address's path or query; the reason a fetch failed (`last_error`) is stored with any address taken out. The events are kept only in the local copy on the user's devices (never sent to the server, `src/lib/sync.ts`), from 3 months back to 12 ahead, and removed with the calendar. Removing a followed calendar erases its address on the server at once (a trigger in `supabase/migrations/024_calendar_privacy.sql`); the row stays, marked deleted, with its name, colour, profile and when it was last fetched (and why a fetch last failed, addresses removed), so other devices learn of the removal. |
| Reminders through Telegram (v19, REM-05, migration 038, optional, the user's choice) | Off until the user links it (Settings → Reminders → Telegram). Linking: `telegram_link_start()` makes a one-time code (16 random bytes; only its SHA-256 hash is stored in `telegram_link_code`, for 10 minutes); the user opens `t.me/<bot>?start=<code>` and taps Start; the `telegram-webhook` Edge Function (checks Telegram's secret header) calls `telegram_link_finish()`, which uses the code up and stores the chat id in `channel_setting.telegram_chat_id`. While linked, the device hands the next three days' reminders to `telegram_set_reminders()` (`telegram_reminder`: key, due time, the line), worked out by the same rules as the phone's notifications (`src/lib/notify.ts`); left out on the device are the tasks Visuma writes from meal plans and training routines, tasks written by the Nutrition, Health, Training and Sleep rules, refill counts and payment amounts (`telegramBody`, `src/lib/telegram-rules.ts`). The `telegram-send` Edge Function, run every minute by pg_cron, claims what fell due (`telegram_sent`, kept two days, so nothing is sent twice) and sends it to Telegram's Bot API. Telegram (Telegram Messenger Inc. / Telegram FZ-LLC, outside the EEA) is an independent controller of the delivered messages (see `processors.md`). Unlinking in the app, `/stop`, blocking the bot, or deleting the account clears the chat id and the waiting reminders at once. Nothing is readable through the API, not even by the owner (`supabase/tests/security.sql`). Legal basis: art. 6(1)(b), at the user's request; a health detail goes only if the user wrote it in a title. |
| Sleep from Health Connect (v19, optional, Android) | Read on the phone, only the sleep sessions the user allows in Health Connect, only after turning it on; stored as the user's own sleep records (`sleep_log`, health data under (c), consent art. 9(2)(a) as for typed sleep) and synced like them. Nothing is written to Health Connect, and nothing read from it goes anywhere but the user's own records. |
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
| Personal data | IP address and request details, seen by Netlify while serving the static files. On the deletion page, the email and password typed in go straight from the visitor's browser to Supabase (`site/delete.ts`); the static host never receives them. |
| Recipients | Netlify (processor for the hosting, [Netlify DPA](https://www.netlify.com/pdf/netlify-dpa.pdf)); Supabase for the deletion itself. |
| Transfers | Netlify, Inc. is a US company; its DPA relies on the EU-US Data Privacy Framework, with the Standard Contractual Clauses if that falls away ([Netlify DPA](https://www.netlify.com/pdf/netlify-dpa.pdf), section 14). |
| Retention | Netlify's own log retention (not published for the free plan; see `retention.md`). The site sets no cookies and loads no analytics. |
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
- Android: app data is excluded from cloud backup and device transfer (`allowBackup="false"` and data extraction rules); reminders are local notifications on a private channel, so a locked phone shows no text and no server sends them; the local copy is cleared on sign-out. The home-screen widgets, if the user adds them, draw from a copy in the app's private storage (same backup exclusion); sign-out clears them and any ticks waiting in them. The Today widget shows today's tasks and habits; a stats widget shows the figures of one saved stats view the user picks, which can be health figures, on the home screen (the policy says so and how to avoid it). The widget's tick receiver is not exported, so no other app can change data through it.
- Android permissions (merged manifest, version 18): internet, network state, post notifications, receive boot completed, wake lock, use biometric and use fingerprint (only to confirm switching between accounts kept on the phone), and the internal `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` that AndroidX adds. CAMERA and the exact-alarm permissions are removed in `android/app/src/main/AndroidManifest.xml`. Photos come through the camera app or Android's photo picker (no permission).
- iPhone (version 20): the web view's local copy (Library/WebKit) is excluded from iCloud and computer backups (`ios/App/App/AppDelegate.swift`); reminders are local notifications, whose lock-screen text follows the iPhone's Show Previews setting (default: only when unlocked); the Open Food Facts token and kept accounts are in the iOS keychain, on this phone only (`whenUnlockedThisDeviceOnly`: never in a backup, never in iCloud Keychain; `src/lib/secure-storage.ts`). iOS keeps keychain items after the app is deleted, so they are there again if Visuma is reinstalled on the same phone; permissions are notifications, the camera (barcode scanning and photos, asked for on first use) and Face ID (switching kept accounts). No widgets, no Health Connect, nothing read from Apple Health. Privacy manifest: `ios/App/App/PrivacyInfo.xcprivacy` (no tracking).
- Optional Open Prices sharing: nothing is sent without the user's tap; the Open Food Facts token is kept in Android's secure storage (Keystore-backed) and never synced; photos are re-encoded on the device without EXIF.
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
