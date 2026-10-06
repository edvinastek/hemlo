Not legal advice: drafted from public sources, and to be checked by someone qualified before Hemlo launches publicly.

# DPIA screening

Does Hemlo need a data protection impact assessment (article 35)? Screened on
24 September 2026, for the app as it is: a planner that stores health data for a
few dozen invited testers, moving towards a public release on Google Play.

## The rules

1. **Article 35(1)**: a DPIA is required when processing "is likely to result in a high risk to the rights and freedoms of natural persons" ([GDPR art. 35](https://gdpr-info.eu/art-35-gdpr/)).
2. **Article 35(3)(b)** always requires one for "processing on a large scale of special categories of data referred to in Article 9(1)".
3. **The AP's list** (article 35(4)), [Staatscourant 2019, 64418](https://www.autoriteitpersoonsgegevens.nl/uploads/imported/stcrt-2019-64418.pdf), names 17 kinds of processing that always need one. Item 7, health data, covers "Grootschalige verwerkingen van gegevens over gezondheid" (large-scale processing of health data), with examples such as care institutions, insurers and research institutes. Item 15 covers profiling that systematically and extensively evaluates personal aspects, including health. Item 16 covers large-scale automated observation or influencing of behaviour.
4. **The nine European criteria**, repeated in that decision: evaluation or scoring; automated decisions with legal or similar effect; systematic monitoring; sensitive data; large scale; matching or combining datasets; vulnerable data subjects; innovative technology; processing that stops people using a service or contract. The AP's rule of thumb: "Als vuistregel geldt dat u een DPIA moet uitvoeren als uw verwerking aan 2 of meer van deze criteria voldoet" (as a rule, carry out a DPIA if the processing meets two or more) ([AP: DPIA](https://autoriteitpersoonsgegevens.nl/nl/zelf-doen/data-protection-impact-assessment-dpia)).

## Hemlo against the criteria

| Criterion | Met? | Why |
| --- | --- | --- |
| 1. Evaluation or scoring | Partly | Hemlo calculates a calorie and protein budget from weight, height, age, sex and activity (Mifflin-St Jeor, `src/lib/calc.ts`). That is a calculation for the user's own use, not an assessment of the person by or for anyone else, and nothing is decided about them. Counted as borderline. |
| 2. Automated decisions with legal or similar effect | No | Nothing is decided; the user sees suggestions and edits them. |
| 3. Systematic monitoring | No | Users log their own entries. No location, no sensors, no background tracking. Since version 19 the Android app can import sleep sessions from Health Connect, but only when the person taps Import, for the days they choose, read once on the phone: not continuous monitoring. |
| 4. Sensitive data | **Yes** | Weight, food eaten, training and sleep are health data (art. 9). |
| 5. Large scale | No, for now | A closed test of a few dozen people, one developer. Recital 91 and the AP's list aim at institutions; a public app could grow, so this is re-checked at every thousand users. |
| 6. Matching or combining datasets | No | Only what the user enters, plus a shared food catalogue. |
| 7. Vulnerable data subjects | Possible | Not aimed at them, but people with a difficult relationship with food or weight may use a calorie planner. Under-16s are excluded by the policy; Play's target audience is 18 and over. |
| 8. Innovative technology | No | A database, an app, row-level security. The AI persona name in the schema (`ai_persona_name`) is not used to process data with AI today. |
| 9. Blocks a right or service | No | |

## Conclusion

Not on the AP's mandatory list, because the health data is not processed on a
large scale; article 35(3)(b) does not apply for the same reason. One criterion
is clearly met (sensitive data), with two more borderline (evaluation, vulnerable
people). That makes the answer **unclear rather than a clear no**, and the AP's
rule of thumb is close to triggering. A short DPIA costs little and is written
below. It becomes mandatory, and must be redone properly, if any of these happen:

- the user base becomes large (hundreds to thousands of active users with health data is a reasonable point to reconsider; the GDPR gives no number);
- managed profiles are offered, so users enter health data about other people;
- any AI feature sends user data to a model provider;
- health data is shared with anyone, or used for anything other than the user's own planning;
- Health Connect, wearables or other automatic data sources are added.

**Re-screened for version 19 (4 October 2026).** Health Connect was added as a source of sleep only: opt-in,
read-only, started by the person each time, for at most 30 days back, kept as the person's own sleep records and
never passed on. Telegram reminders send only reminder titles and times the person chose, to their own chat. Neither
changes a criterion above, so the answer stays as concluded; continuous or background reading from Health Connect
or a wearable would trigger a full DPIA.

## Short DPIA

### 1. What the processing is

A personal planner. Users enter body measurements, targets, meals, training,
sleep, habits and supplements, alongside tasks and notes. The app calculates
targets and plans meals and shopping. Data is stored on the device and synced
through Supabase (Frankfurt). Legal basis for health data: explicit consent at
sign-up (art. 9(2)(a)). Full detail: `records-of-processing.md`.

### 2. Necessary and proportionate?

- Every health field is used for a visible feature (targets, meal plans, progress). None is collected "for later".
- Modules for sleep, habits and supplements are optional and can be turned off.
- Date of birth is stored rather than age, because age changes; it is used only to calculate the budget.
- No data leaves the processor; no analytics, advertising or sharing.
- Users can see, export, correct and delete everything themselves.

Gaps: the export does not include every table (`data-requests.md` covers the
rest by hand), and items deleted in the app stay in the database, hidden, until
the account is deleted (`retention.md`).

### 3. Risks to people

| Risk | Likelihood | Severity | Notes |
| --- | --- | --- | --- |
| Another account reads someone's health data through a policy mistake | Low | High | Happened before in development (views ignoring RLS, household members reading profiles), closed in `012_security.sql`. |
| Secret key leak gives full database access | Low | High | The key is never in a build; only one person holds it. |
| Account takeover through a weak or reused password | Medium | Medium | 10-character minimum, no second factor for users. |
| Data seen on the phone by someone else (lock screen, backups) | Low | Medium | Hidden notification text; app data excluded from backups. |
| Loss of all data (no backups on the free plan) | Medium | Medium | Users keep a local copy on their devices, but a lost server would lose other devices' history. |
| A user with an eating disorder is harmed by calorie targets | Low to medium | High | Not a data protection risk in the narrow sense, but a harm from the processing. The listing and app give no medical advice. |
| Consent not freely given because the app cannot work without health data | Low | Low | The health data is the service itself; the policy says plainly that withdrawing consent ends it. |
| Data kept longer than needed (soft deletes, audit logs, allowlist) | Medium | Low | See `retention.md`. |

### 4. Measures

Already in place: row-level security on every table, rebuilt and reviewed;
invite-only sign-ups; PKCE email links; TLS and encryption at rest; no
third-party SDKs; Android backup exclusion; hidden lock-screen text; in-app and
web account deletion; a breach plan (`incident-response.md`).

To do (tracked in `processors.md`):

- turn off database audit logs, or purge them after 30 days;
- backups before public launch (Pro, or encrypted weekly dumps);
- a purge for soft-deleted rows that the sync layer can live with;
- a complete in-app export;
- a line in the app near the calorie target pointing people who struggle with eating to their doctor, reviewed with someone who knows the subject;
- two-factor sign-in on every admin account.

### 5. Residual risk and outcome

With the measures above, the remaining risk is not high. No prior consultation
with the AP (art. 36) is needed. Review this screening before the public launch
and whenever one of the triggers above happens.

| Date | Reviewer | Outcome |
| --- | --- | --- |
| 2026-09-24 | Drafted for the developer | DPIA not strictly required; short DPIA recorded; review before public launch |
| 2026-10-04 | Version 18 changes | Outcome unchanged. New since: households share chores (with who did them), the shopping list and typed prices, and member names (household members only, by RLS); Finance amounts (private to the user, off the calendar feed); photos in built modules (private bucket); stats widgets that can put a health figure on the home screen (the user's own choice; the policy says how to avoid it); opt-in sharing of single prices with Open Prices, public under ODbL with the user's Open Food Facts name (nothing sent without a tap; photos stripped of EXIF on the device; no health data). None adds a criterion: no new special-category data, no monitoring, no combining of datasets. |
