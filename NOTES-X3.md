# NOTES-X3 (version 19, branch v19/x3)

## For X1 (Plan my day): the review schedule

```ts
// src/lib/study-review-rules.ts
export interface StudyRecordLike { data: Record<string, unknown>; record_date: string | null; deleted_at?: string | null; entity?: string }
export interface ReviewDue { subject: string; due: string /* yyyy-MM-dd */; after_days: number /* 1|3|7|14|30 */; since: string }
export function reviewsDue(records: StudyRecordLike[], day: string): ReviewDue[]   // one per subject, earliest first
export function nextReview(records: StudyRecordLike[], subject: string, day: string): string | null
export const describeReviews: (n: number) => string   // "3 reviews due"
```

Pass Learning's module_record rows (any entity; non-"study" rows and deleted ones are skipped). The schedule is
off by default: only show reviews when the Learning module's switch is on:
`module_instance` row of module_key 'learning', `settings.review_schedule === true` (exported later as
`reviewScheduleOn(settings)` from src/lib/learning-rules.ts; reading the raw flag is the same thing).

## Log
- FIRST: study-review-rules.ts + src/test/studyreview.check.mjs (in the check loop and README).
- LRN-05/06 built: Learning ⋮ → "Weekly target…", "Switch review schedule on/off" (on also pins the "Reviews due"
  card, key `learning:reviews`, on Today if there is room; off takes it away; Undo restores). Study tab: "This week"
  section (only once a target exists) with progress bars; subject rows get a ⋮ (Focus, Weekly target…), and
  "Review due"/"Review <day>" as the quiet line while the schedule is on. The + now offers Study block / Focus timer.
  Focus timer: localStorage `getit.focus` (device-local), start time + pauses only; bar on every Learning tab;
  countdown logs itself when the page sees it ended; Stop logs the minutes as a study record with `logged: true`
  (its task is made already ticked); Undo removes record and task. End notification: notify.ts
  scheduleFocusEnd/cancelFocusEnd (kind 'focus', survives rescheduleReminders).
- HLT-04/05 built (measure entity in Health registry, module_record, record_date null; weigh-in day in
  module_instance.settings.weigh_in_day/weigh_in_time; Today Body tab gated via day-tabs offerWeighIn; reminder in
  notify.ts upcoming()).
- TRN-07 built: migration 037 (phase: colour, updated_at, deleted_at, checks NOT VALID, touch trigger, grants),
  Dexie v17 `phase`, SYNCED + bundle add 'phase'. Plan.tsx: one import + one line `<YearPhases …/>` before YearGoals.
- PRJ-05 built: projects-rules templates, settings.templates in Projects' module_instance.
- FIN-06 built: src/lib/finance-bank-rules.ts; hooked into transfer.ts readImport (bank detection for
  m:finance:entry) and saveRow (extra dataset fields kept); .tab accepted.

## Sources (FIN-06 bank formats)
- ING header + example rows (yyyymmdd, "98,87", Af/Bij): firefly-iii issue #3358
  https://github.com/firefly-iii/firefly-iii/issues/3358 ; https://github.com/vincent-smit/INGBtoYNAB
- Rabobank header (Dutch and English), signed comma amounts: beancount-rabobank importer
  https://github.com/mvaerle/beancount-rabobank (rabobank.py RABOBANK_HEADER_PATTERNS)
- ABN AMRO column names (Rekeningnummer, Muntsoort, Transactiedatum, Beginsaldo, Eindsaldo, Rentedatum,
  Transactiebedrag, Omschrijving): https://gist.github.com/thomwiggers/dcbde2c85ead1caf8ff9a46aa4c17c2d ;
  formats offered (TXT/TAB, MT940, CAMT.053): https://www.abnamro.nl/nl/zakelijk/internet-bankieren/bestanden-downloaden.html
  (the TAB file being headerless, tab-separated, yyyymmdd, comma decimals is from common knowledge of the format; the
  check covers both headerless and with header.)
- Revolut columns (Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance):
  tariochbctools Revolut importer https://tariochbctools.readthedocs.io/en/stable/_modules/tariochbctools/importers/revolut/importer.html
