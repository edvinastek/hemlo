# Play Console answers for GetIt

Every form Google Play asks for before a release, with the answer that matches
what the app does as of **version 18** (checked 4 October 2026 against the code,
the merged Android manifest and `src/legal/policy.ts`). If a feature changes
what is collected, change this file, the policy and `docs/privacy/` in the same
commit, and update the form in Play Console.

## App details

| Field | Answer |
| --- | --- |
| App name | GetIt - Day & Meal Planner |
| Package name | `app.getit.planner` (permanent) |
| Default language | English (United Kingdom) |
| App or game | App |
| Free or paid | Free. A free app can never become paid; in-app subscriptions stay possible |
| Category | Productivity |
| Listing text and graphics | `store/listing.json`, `store/icon-512.png`, `store/feature-graphic.png`, `store/screenshots/` (see "Screenshots" below) |

## App content

### Privacy policy
`https://<site-name>.netlify.app/privacy.html` (built from `src/legal/policy.ts` by `npm run build:site`, hosted by
Netlify; see `docs/android-release.md`).

### App access
Choose **All or some functionality is restricted**, then add one set of credentials:

- Name: Reviewer account
- Username: a reviewer address you control, for example `play-review@<your-domain>`
- Password: a long random one, used for nothing else
- Other information: "Sign in with this email and password. No second factor is used. The planner, meal plan,
  shopping list and every module are available after signing in. Sharing a price with Open Prices is optional and
  needs the reviewer's own Open Food Facts account; nothing else needs one."

Before submitting, add that address to the invite list, create the account in the app, and open the confirmation email:

```sql
insert into private.signup_allowlist (email) values ('play-review@<your-domain>');
```

### Ads
No, the app does not contain ads.

### Content rating (IARC questionnaire)
Category: **All other app types**. Answer No to violence, sexual content, profanity, drugs, alcohol, tobacco and
gambling. Answer **Yes** to "users can interact or exchange content": members of a household share a shopping
list, a stock list, prices and chores, and a recipe can be proposed to everyone (it is read by the owner before it
is shown). No chat, no free messaging between strangers, no location sharing, no digital purchases. Expected result:
suitable for all ages (PEGI 3 / Everyone) with the interactive element "Users Interact".

### Target audience
**18 and over** only. The app is not designed for children and must not appear in the Families programme.

### News app
No.

### Government app
No.

### Financial features
**My app doesn't provide any financial features.** Finance in GetIt is a personal record the person types (what
they spent and received, budgets, planned payments). It does not connect to a bank, move money, give loans or
advice, or trade anything. (If the form's wording has changed, choose the option for "no financial services".)

### Health apps declaration
Tick:
- **Nutrition and weight management**
- **Activity and fitness**
- **Sleep management** (the Sleep module logs sleep and works out sleep debt)

Do not tick anything medical: GetIt does not diagnose, treat or monitor any condition, and the listing says it
gives no medical advice. From version 19 it can read sleep from Health Connect (see "Health Connect" below).

### Data safety

**Does your app collect or share any of the required user data types?** Yes.
**Is all of the user data collected by your app encrypted in transit?** Yes (HTTPS to Supabase, Open Food Facts,
Open Prices and OpenStreetMap; Google's scanner uses HTTPS too).
**Do you provide a way for users to request that their data is deleted?** Yes: in the app (Settings → Data and
account → Delete account), and at `https://<site-name>.netlify.app/delete.html`.

#### Collected

| Category | Data type | Collected | Optional? | Purpose | What it is in GetIt |
| --- | --- | --- | --- | --- | --- |
| Personal info | Email address | Yes | Required | Account management, App functionality | The sign-in address. |
| Personal info | Name | Yes | Optional | App functionality | The profile name; the name a member shows in a household. |
| Personal info | Other info | Yes | Optional | App functionality | Date of birth and sex, for the calorie and protein targets. |
| Financial info | Purchase history | Yes | Optional | App functionality | What the person types in Finance as spent, and the prices they type for shopping items. |
| Financial info | Other financial info | Yes | Optional | App functionality | Income, budgets and planned payments typed in Finance. |
| Health and fitness | Health info | Yes | Optional | App functionality | Weight, waist, food eaten, targets, sleep, supplements. |
| Health and fitness | Fitness info | Yes | Optional | App functionality | Training sessions, sets and exercises. |
| Photos and videos | Photos | Yes | Optional | App functionality | Photos added to records in a module the person built (private storage); a photo of a price tag or receipt, sent to Open Prices only when the person shares a price. |
| Location | Approximate location | Yes | Optional | App functionality | The country and town the person types in their profile (for shops, prices and public holidays), and the shop's place when they share a price. Never the device's location: GetIt has no location permission. |
| Calendar | Calendar events | Yes | Optional | App functionality | Events the person puts in their own agenda; the addresses of calendars they follow (those calendars' events stay on the device). |
| App activity | Other user-generated content | Yes | Optional | App functionality | Tasks, notes, recipes, shopping lists, stock, module records, household chores. |
| App info and performance | Diagnostics | Yes | Optional | Analytics | Collected by Google's ML Kit code scanner (in Google Play services) when the person scans a barcode: performance figures and error codes, for Google's own diagnostics. GetIt itself collects none. |
| Device or other IDs | Device or other IDs | Yes | Optional | Analytics | The same ML Kit scanner: a per-installation identifier "not intended to uniquely identify a user or physical device", for Google's diagnostics ([ML Kit data disclosure](https://developers.google.com/ml-kit/android-data-disclosure)). |

Not collected: precise location, contacts, messages, audio, files and docs, web browsing, installed apps, crash
logs, identifiers for ads, credit score, payment info. No data is used for advertising, and none is processed
only ephemerally.

#### Shared

**No data is shared.** Explain if asked:

- Supabase stores data as a processor on GetIt's behalf, which Google does not count as sharing.
- Product searches and barcodes sent to Open Food Facts, and prices looked up on Open Prices, are requests the
  person makes, and they carry no personal data beyond what any website sees.
- A price shared with Open Prices (optional, off by default) is sent only when the person taps Share on that price,
  after the app says it will be public: Google's guidance does not count "transfers based on a specific user action,
  where the user reasonably expects the data to be shared" as sharing. The policy describes it in full.
- ML Kit "does not transfer this data to third parties" (ML Kit data disclosure).
- Telegram reminders (version 19, optional, off by default): when the person links their own Telegram chat in
  Settings → Reminders, the titles and times of the reminders they chose are sent to Telegram for delivery. That is
  a transfer the person starts and expects, so it is not sharing either; the policy describes it in full.
- A product added to Open Food Facts (version 19, optional): sent only when the person ticks "Also add it to Open
  Food Facts" and signs in with their own Open Food Facts account; it becomes public there, as the app says first.

If crash reporting or any analytics is ever added, **App info and performance** must be updated here first.

### Account deletion
- In-app: Settings → Data and account → Delete account
- Web: `https://<site-name>.netlify.app/delete.html`
- Deleting some data without deleting the account: Yes, in the app (any record can be deleted; Finance, modules,
  habits and the rest each have their own delete), and by email to the contact address for anything else.

### Permissions
From the merged manifest (version 18). All are normal permissions except notifications, which Android 13 and later
asks the person for:

| Permission | Why |
| --- | --- |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Sync, and knowing when the phone is offline. |
| `POST_NOTIFICATIONS` | Reminders, only if the person turns them on. |
| `RECEIVE_BOOT_COMPLETED` | Setting reminders again after a restart. |
| `WAKE_LOCK` | Held briefly by the notification library so a reminder arrives on time. |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | Only to confirm switching between accounts kept on the phone. |
| `app.getit.planner.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | Added by AndroidX; only GetIt holds it. |
| `android.permission.health.READ_SLEEP` | Version 19: reading sleep sessions from Health Connect, only when the person chooses Import from Health Connect on the Sleep page (see "Health Connect" below). |

Removed on purpose (`tools:node="remove"` in `android/app/src/main/AndroidManifest.xml`): `CAMERA` (barcodes go
through Google's code scanner; photos through the camera app or Android's photo picker, which need no
permission), `SCHEDULE_EXACT_ALARM` and `USE_EXACT_ALARM`. No location, contacts, microphone, storage or phone
permission, so no permission declaration form is needed.

## Store listing

Text in `store/listing.json` (short description at most 80 characters, full description at most 4000).

### Screenshots

Made by `node scripts/store-shots.mjs` (version 19) and kept in `store/screenshots/`: phone, portrait, 1080 × 1920,
from an invented demo week with no real person's data, no network. Upload them in this order:

1. `1-today.png` — Today: the time rail with tasks, a meal and a habit; the round + visible.
2. `2-plan-week.png` — Plan: the week view.
3. `3-food-day.png` — Food: a day's meals with the calorie and protein bars.
4. `4-shop-list.png` — Shopping: the list with prices and the summary line.
5. `5-habits.png` — Habits.
6. `6-stats.png` — Stats: one saved view (not a weight chart).
7. `7-today-dark.png` — Today in the dark theme.

Run it again after any change to those screens; the images come out the same each time. Keep the feature graphic
as it is.

## Release

| Item | Value |
| --- | --- |
| Format | Android App Bundle (`.aab`), from the `getit-android-release` CI artifact |
| Target API | 36 (Android 16), required for new apps since 31 August 2026 |
| Minimum API | 24 (Android 7.0) |
| Signing | Play App Signing. You keep only the upload key (see `docs/android-release.md`) |
| Version code | The CI run number, so every upload is higher than the last |
| Version name | `package.json` version |

## Health Connect (version 19, SLP-05)

GetIt reads **one** Health Connect data type, **Sleep** (`android.permission.health.READ_SLEEP`), and writes none.
The merged manifest declares nothing else from Health Connect (checked with `aapt2 dump permissions` on the version 19
build). Health Connect access has its own declaration in Play Console, separate from Data safety; without it the
release is rejected.

### Health Connect permissions declaration
Play Console → App content → **Health Connect permissions** (or the "Health apps" declaration's Health Connect part).
Declare exactly this; if a later version needs another type, the declaration must list the old types and the new one
together.

| Field | Answer |
| --- | --- |
| Data type | Sleep (read only) |
| Write access | None |
| Use case | Sleep tracking / sleep management: show the person's own nights (bed and wake time, hours asleep) on the Sleep page, against their sleep target, with sleep debt and how regular their nights are. |
| How the data is used | When the person chooses **Import from Health Connect** on the Sleep page (Android only), GetIt asks for the Sleep permission and reads the sleep sessions that ended in the last 7, 14 or 30 days (they choose). Each night becomes a sleep entry in their GetIt account, the same as a night they type in, so it shows on their other devices. Sessions that overlap are joined, naps are left out, and a day that already has a night keeps it. Nothing is read in the background or on a schedule. |
| Shared with third parties | No. The nights are stored by Supabase as GetIt's processor, like the rest of the person's data; never sold, never used for advertising, never shared. |
| Used for advertising or credit | No |
| Human access | No. Only the person sees it, in their own account; it is not shared with their household. |
| Data retention | Kept until the person deletes the night or their account. Taking the permission back stops new imports; nights already imported stay until deleted. |
| Privacy policy | The same URL as above. The policy has a Health Connect section (version 19); the screen Health Connect opens from its permission screen and its settings (`HealthPrivacyActivity`) says the same and leads to it. Put the policy's address in `android/app/src/main/res/values/health.xml` (`health_privacy_url`) once the site is published, so that screen opens the public page rather than the copy in the app. |
| Limited use | Confirm the Health Connect / Google API **Limited Use** requirements: the data is used only to provide the Sleep feature the person sees, not transferred except as needed for that feature (sync to their own account), not used for ads, and not read by people. |

### Data safety (unchanged categories)
Sleep from Health Connect is **Health and fitness → Health info**, which is already declared as collected, optional,
for App functionality ("Weight, waist, food eaten, targets, sleep, supplements"). Nothing new is shared. If the form
asks whether health data comes from Health Connect, answer Yes.

### Reviewer notes
To see it: an Android phone with Health Connect (built in on Android 14 and later; the Health Connect app from Google
Play on Android 9 to 13) holding some sleep (any sleep tracker or Health Connect's own "add data"). In GetIt: switch
on Sleep (More → Modules), open Sleep, ⋮ → Import from Health Connect → Import, allow Sleep on Health Connect's screen.

