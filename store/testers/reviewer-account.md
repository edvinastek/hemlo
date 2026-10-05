# The Google Play reviewer account

Visuma shows nothing without signing in, so Play Console's **App access** section
must give Google's reviewers a working account. Reviewers need access that
keeps working through the review: no expiry, no one-time codes, no second factor
([Play Console Help: App access](https://support.google.com/googleplay/android-developer/answer/9859455)).

## 1. A dedicated address

Create an address used for nothing else, that you can read: for example a new
Gmail account, or `play-review@<your domain>` if you have one. Do not use your
own address, a tester's, or the contact address: the reviewer account's
password will be stored in Play Console.

It must be able to receive email from Visuma. That needs custom SMTP set up in
Supabase first: the built-in sender only delivers to members of the Supabase
team (`docs/privacy/processors.md`).

## 2. Allowlist it

Sign-up is invite-only. In the Supabase dashboard → SQL editor:

```sql
insert into private.signup_allowlist (email) values ('play-review@example.com') on conflict do nothing;
```

(or put it in a file and use `node scripts/allowlist.mjs`, as for testers).

## 3. Create it in the app

1. Make a long random password (20 characters or more) in a password manager, and save it there with the address.
2. On an Android phone with the test build, or in the web build, choose **Create account**, enter the address and password, and tick the consent box.
3. Open the confirmation email **on the same device** and tap the link. Visuma's links carry a one-time code that only works where the sign-up started (`src/lib/supabase.ts`, PKCE).
4. Sign in. Go through the first-run setup with **made-up** figures (for example 75 kg, 175 cm, born 1990), never your own: reviewers will see them.
5. Add enough to show the app working: a few tasks today, a meal plan for the week, a shopping list. Reviewers approve faster when screens are not empty.

## 4. Fill in App access

Play Console → **Policy and programs → App content → App access** (it may appear
under "Monitor and improve" in newer layouts):

1. Choose **All or some functionality is restricted**.
2. **Add new instructions**:
   - Name: `Reviewer account`
   - Username: the address
   - Password: the password
   - Any other instructions: "Sign in with this email and password on the first screen. No second factor or one-time code is used. The planner, meal plan and shopping list are available after signing in. The account holds made-up sample data."
3. Save. This matches `store/play-console-answers.md`, which you update if anything here changes.

## 5. Keep it working

- Before each submission, sign in once with it to check it still works.
- The Supabase free plan pauses a project after a week without activity ([pricing](https://supabase.com/pricing)). During the closed test the testers keep it active; later, if nobody uses the app for a week before a review, open it yourself first, or reviewers get an error and reject the update.
- Never delete the account, change its password without updating Play Console, or turn on two-factor sign-in for it.
- Its data is made up, so it is not personal data about anyone. Delete it with the in-app **Delete account** once the app no longer needs review, and remove its allowlist row.
