# Play Console answers for GetIt

Every form Google Play asks for before a release, with the answer that matches
what the app does as of version 0.2.0. If a feature changes what is collected,
change this file in the same commit and update the form in Play Console.

## App details

| Field | Answer |
| --- | --- |
| App name | GetIt - Day & Meal Planner |
| Package name | `app.getit.planner` (permanent) |
| Default language | English (United Kingdom) |
| App or game | App |
| Free or paid | Free. A free app can never become paid; in-app subscriptions stay possible |
| Category | Productivity |
| Listing text and graphics | `store/listing.json`, `store/icon-512.png`, `store/feature-graphic.png`, `store/screenshots/` |

## App content

### Privacy policy
`https://<your-site>/privacy.html` (built from `src/legal/policy.ts` by `npm run build:site`).

### App access
Choose **All or some functionality is restricted**, then add one set of credentials:

- Name: Reviewer account
- Username: a reviewer address you control, for example `play-review@<your-domain>`
- Password: a long random one, used for nothing else
- Other information: "Sign in with this email and password. No second factor is used. The planner, meal plan and shopping list are available after signing in."

Before submitting, add that address to the invite list, create the account in the app, and open the confirmation email:

```sql
insert into private.signup_allowlist (email) values ('play-review@<your-domain>');
```

### Ads
No, the app does not contain ads.

### Content rating (IARC questionnaire)
Category: **All other app types**. Answer No to violence, sexual content, profanity,
drugs, alcohol, tobacco, gambling, and to "users can interact or exchange content"
(household sharing is invitation-only and not built yet). No location sharing, no
digital purchases. Expected result: suitable for all ages (PEGI 3 / Everyone).

### Target audience
**18 and over** only. The app is not designed for children and must not appear in the Families programme.

### News app
No.

### Government app
No.

### Financial features
None.

### Health apps declaration
Tick:
- **Nutrition and weight management**
- **Activity and fitness**

Do not tick anything medical: GetIt does not diagnose, treat or monitor any condition,
and the listing says it gives no medical advice. It does not use Health Connect.

### Data safety

**Does your app collect or share any of the required user data types?** Yes.
**Is all of the user data collected by your app encrypted in transit?** Yes (HTTPS to Supabase).
**Do you provide a way for users to request that their data is deleted?** Yes: in the app, and at `https://<your-site>/delete.html`.

Nothing is **shared**. Supabase stores data as a processor on GetIt's behalf, which Google does not count as sharing.

| Category | Data type | Collected | Optional? | Purpose |
| --- | --- | --- | --- | --- |
| Personal info | Email address | Yes | Required | Account management, App functionality |
| Personal info | Name | Yes | Optional | App functionality |
| Personal info | Other info (date of birth, sex) | Yes | Optional | App functionality |
| Health and fitness | Health info (weight, waist, food eaten, targets, sleep) | Yes | Optional | App functionality |
| Health and fitness | Fitness info (training sessions and sets) | Yes | Optional | App functionality |
| App activity | Other user-generated content (tasks, notes, recipes, shopping lists) | Yes | Optional | App functionality |

Not collected: location, contacts, photos, files, messages, calendar, device IDs,
crash logs, diagnostics, web browsing, financial info, audio, identifiers for ads.
No data is processed ephemerally; none is used for advertising or analytics.

If crash reporting is ever added, **App info and performance → Crash logs** must be added here first.

### Account deletion
- In-app: More → Data → Delete account
- Web: `https://<your-site>/delete.html`
- Deleting some data without deleting the account: No (not offered as a separate request).

### Permissions
Only normal permissions are used: internet, showing notifications (Android 13+ asks the
user), and restarting reminders after the phone reboots. The exact-alarm permissions
are removed from the manifest on purpose, so no permission declaration is needed.

## Release

| Item | Value |
| --- | --- |
| Format | Android App Bundle (`.aab`), from the `getit-android-release` CI artifact |
| Target API | 36 (Android 16), required for new apps since 31 August 2026 |
| Minimum API | 24 (Android 7.0) |
| Signing | Play App Signing. You keep only the upload key (see `docs/android-release.md`) |
| Version code | The CI run number, so every upload is higher than the last |
| Version name | `package.json` version |
