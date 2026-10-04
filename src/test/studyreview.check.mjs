// Checks Learning's review schedule (LRN-05): which subjects have a review
// due on a day under the 1-3-7-14-30 day chain.
import { reviewsDue, nextReview, sessionDay, describeReviews, reviewCardText } from '../lib/study-review-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

const s = (subject, day, x = {}) => ({ data: { subject, block_date: day, minutes: 30 }, record_date: day, entity: 'study', ...x })
const due = (recs, day) => reviewsDue(recs, day).map((r) => `${r.subject} ${r.due} +${r.after_days}`)

eq('nothing studied: nothing due', reviewsDue([], '2026-10-04'), [])
eq('the day of the session: nothing due yet', due([s('Dutch', '2026-10-01')], '2026-10-01'), [])
eq('the next day: the 1-day review', due([s('Dutch', '2026-10-01')], '2026-10-02'), ['Dutch 2026-10-02 +1'])
eq('still due two days on, not doubled', due([s('Dutch', '2026-10-01')], '2026-10-03'), ['Dutch 2026-10-02 +1'])
eq('done the next day: the 3-day review is next, not yet due',
  due([s('Dutch', '2026-10-01'), s('Dutch', '2026-10-02')], '2026-10-03'), [])
eq('the 3-day review falls due on day 3 after the session',
  due([s('Dutch', '2026-10-01'), s('Dutch', '2026-10-02')], '2026-10-04'), ['Dutch 2026-10-04 +3'])
eq('a late review clears every review due by then (no pile)',
  due([s('Dutch', '2026-10-01'), s('Dutch', '2026-10-09')], '2026-10-10'), [])
eq('...and the next one is the 14-day review',
  due([s('Dutch', '2026-10-01'), s('Dutch', '2026-10-09')], '2026-10-15'), ['Dutch 2026-10-15 +14'])
eq('daily study keeps the chain on time',
  due(Array.from({ length: 20 }, (_, i) => s('Dutch', `2026-10-${String(i + 1).padStart(2, '0')}`)), '2026-10-20'), [])
const chain = ['2026-01-01', '2026-01-02', '2026-01-04', '2026-01-08', '2026-01-15', '2026-01-31'].map((d) => s('Maths', d))
eq('a finished chain has nothing due', due(chain, '2026-02-10'), [])
eq('a session after a finished chain starts a fresh one',
  due([...chain, s('Maths', '2026-02-10')], '2026-02-11'), ['Maths 2026-02-11 +1'])
eq('a review more than 30 days late lapses', due([s('Dutch', '2026-01-01')], '2026-02-02'), [])
eq('30 days late still shows', due([s('Dutch', '2026-01-01')], '2026-02-01'), ['Dutch 2026-01-02 +1'])
eq('subjects are matched without case; the latest spelling is shown',
  due([s('dutch', '2026-10-01'), s('Dutch ', '2026-10-02')], '2026-10-04'), ['Dutch 2026-10-04 +3'])
eq('a planned block after the day does not count', due([s('Dutch', '2026-10-01'), s('Dutch', '2026-10-10')], '2026-10-02'), ['Dutch 2026-10-02 +1'])
eq('deleted sessions and other entities are left out',
  due([s('Dutch', '2026-10-01', { deleted_at: 'x' }), s('Book', '2026-10-01', { entity: 'book' })], '2026-10-05'), [])
eq('several subjects, earliest first',
  due([s('Physics', '2026-10-02'), s('Dutch', '2026-10-01')], '2026-10-04'), ['Dutch 2026-10-02 +1', 'Physics 2026-10-03 +1'])
eq('no subject: called Study', due([{ data: { block_date: '2026-10-01' }, record_date: null }], '2026-10-02'), ['Study 2026-10-02 +1'])
eq('the day falls back to the record day', sessionDay({ data: {}, record_date: '2026-10-01' }), '2026-10-01')
eq('a bad day is no session', sessionDay({ data: { block_date: 'soon' }, record_date: null }), null)
eq('next review for a subject (not yet due)', nextReview([s('Dutch', '2026-10-01'), s('Dutch', '2026-10-02')], 'dutch', '2026-10-02'), '2026-10-04')
eq('no next review once the chain is done', nextReview(chain, 'Maths', '2026-02-10'), null)
eq('one review', describeReviews(1), '1 review due')
eq('three reviews', describeReviews(3), '3 reviews due')

eq('the Today card with nothing due', reviewCardText([]), { label: 'Reviews', headline: 'No reviews due', sub: null })
eq('the Today card names the subjects',
  reviewCardText(reviewsDue([s('Physics', '2026-10-02'), s('Dutch', '2026-10-01')], '2026-10-04')),
  { label: 'Reviews', headline: '2 reviews due', sub: 'Dutch, Physics' })
eq('more than three subjects are counted',
  reviewCardText(['A', 'B', 'C', 'D'].map((x) => ({ subject: x }))).sub, 'A, B, C and 1 more')

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nstudy review: all ok')
