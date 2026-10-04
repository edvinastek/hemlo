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
