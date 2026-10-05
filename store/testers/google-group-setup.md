# Google Group for closed testers

A personal developer account created after 13 November 2023 must run a closed
test "with a minimum of 12 testers who have been opted in continuously for at
least 14 days" before it can apply for production. A tester who opts out and back
in starts again ([Play Console Help: testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)).
Invite 15 to 20 people, so a few dropping out does not reset the fortnight.

## Why a group rather than an email list

Play Console accepts either email lists or Google Groups for a closed test
([Play Console Help: set up a test](https://support.google.com/googleplay/android-developer/answer/9845334)).
A group is easier because:

- You add or remove a tester in the group, from your phone, without touching the release or the track in Play Console.
- The same group works for every track and every later app, so a second test needs no new list.
- At the end of the test you empty or delete one group, instead of hunting for lists.
- The addresses stay in one place you control, rather than being re-typed into Play Console, which keeps `store/testers/` the only other copy until you delete it.

Either way, joining the group does not let anyone create a Visuma account. Sign-up
is invite-only, so each address also goes into the allowlist (step 5).

## 1. Collect the addresses

Put each tester's address in `store/testers/testers.txt`, one per line (or save a
CSV there). Git ignores `store/testers/*.txt` and `*.csv`, so the list never
reaches the repository. It must be the Google account they use on their phone.

## 2. Create the group

At [groups.google.com](https://groups.google.com), signed in with the developer
Google account ([Google Groups Help: create a group](https://support.google.com/groups/answer/2464926)):

1. Click **Create group**.
2. Name: `Visuma testers`. Group email: something like `visuma-testers` (it becomes `visuma-testers@googlegroups.com`). Description: "Closed test of the Visuma app."
3. Privacy settings:
   - Who can search for group: **Group members**.
   - Who can join group: **Only invited users**.
   - Who can view conversations: **Group managers** (the group is not for discussion).
   - Who can post: **Group managers**.
   - Who can view members: **Group managers**, so testers do not see each other's addresses.
4. Click **Create group**. It can take a few minutes before it works.

## 3. Add the testers

In the group, open **Members** → **Add members**, paste the addresses from
`testers.txt`, separated by commas. If Google offers to add them directly, do
that; otherwise they get an invitation email and must accept it before they
count as members. Set email delivery for them to "No email" if offered, so they
are not sent group mail.

## 4. Attach the group to the closed test

In [Play Console](https://play.google.com/console), with the app open:

1. **Test and release → Testing → Closed testing**. Use the default closed track, or **Create track**.
2. **Manage track → Testers**.
3. Choose **Google Groups** and enter `visuma-testers@googlegroups.com`.
4. Feedback: the contact address.
5. **Save changes**, then **Copy link** under "Join on the web": this is the opt-in link for the invite message.
6. **Countries / regions**: choose where testers live (at least the Netherlands). This applies to every track.
7. **Create new release**, upload the `.aab`, and send it for review. After the first test release is published, the link "can take several hours to become available to testers" (Play Console Help, above).

## 5. Let them sign up

From the repository root:

```sh
node scripts/allowlist.mjs store/testers/testers.txt
```

The script prints one SQL statement, then how many addresses it accepted and any
lines it refused. It writes nothing to disk. Copy the statement into the
Supabase dashboard → SQL editor and run it. It is safe to
run again after adding more names: existing addresses are skipped.

Then delete `testers.txt`: the group and the allowlist are the only places the
addresses need to be.

## 6. Send the invite

Send the second message from `invite-message.md`, with the opt-in link. Write
down the date each person joins; the 14 days run from the last of the 12.

## 7. After the test

- Apply for production: Play Console **Dashboard → Apply for production** (Play Console Help: testing requirements, above).
- When the test is no longer needed, remove the members or delete the group.
- Remove the allowlist rows of testers who deleted their account (`docs/privacy/data-requests.md`). When sign-ups open to the public, empty the allowlist: `delete from private.signup_allowlist;`.
