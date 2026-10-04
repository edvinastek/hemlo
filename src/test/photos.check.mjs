// Checks photos on built modules' records (MOD-12): the size a photo is
// made, its name in Storage, which records use it, and which kept photos are
// tidied away (never one a record uses, never one too new, Undo first).
import {
  fitWithin, photoPath, isPhotoPath, photoParts, photoRefs, pathsIn, photosToRemove,
  PHOTO_MAX_PX, PHOTO_MAX_BYTES, NEW_PHOTO_DAYS, KEEP_AFTER_DELETE_DAYS, UNKNOWN_RECORD_DAYS,
} from '../modules/photo-rules.ts'
import { cleanValues, FIELD_TYPES } from '../modules/def-rules.ts'
import { filterOps, sortableFields } from '../modules/list-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}
const P = '11111111-2222-4333-8444-555555555555'
const R = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const R2 = 'aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff'
const F = (n) => `0000000${n}-0000-4000-8000-000000000000`

/* ---------- size ---------- */
is('a 4000 × 3000 photo becomes 1600 × 1200', fitWithin(4000, 3000), { width: 1600, height: 1200 })
is('upright: 3024 × 4032 becomes 1200 × 1600', fitWithin(3024, 4032), { width: 1200, height: 1600 })
is('a small one is never made larger', fitWithin(800, 600), { width: 800, height: 600 })
is('a long strip keeps at least a pixel', fitWithin(16000, 2), { width: 1600, height: 1 })
is('nothing is nothing', fitWithin(0, 100), { width: 0, height: 0 })
is('the longest side and the limit the bucket takes', [PHOTO_MAX_PX, PHOTO_MAX_BYTES], [1600, 2 * 1024 * 1024])

/* ---------- names ---------- */
const path = photoPath(P, R, F(1))
is('a photo is filed under its profile and record', path, `${P}/${R}/${F(1)}.jpg`)
is('…and read back', photoParts(path), { profile: P, record: R })
is('only that shape is a photo', [isPhotoPath(path), isPhotoPath(`${P}/${F(1)}.jpg`), isPhotoPath(`${P}/${R}/../${F(1)}.jpg`), isPhotoPath(`${P}/${R}/${F(1)}.png`), isPhotoPath(42)], [true, false, false, false, false])

/* ---------- a field of its own ---------- */
const fields = [{ name: 'name', label: 'Plant', type: 'text' }, { name: 'pic', label: 'Photo', type: 'photo' }]
is('photo is a field kind', FIELD_TYPES.includes('photo'), true)
is('a photo field keeps a photo\'s name', cleanValues(fields, { name: 'Fern', pic: path }).data.pic, path)
is('…and refuses anything else', cleanValues(fields, { name: 'Fern', pic: 'https://example.com/x.jpg' }).errors.pic, 'Photo needs a photo.')
is('an empty photo field is empty', cleanValues(fields, { name: 'Fern', pic: null }).data.pic, null)
is('a list is not sorted by a photo', sortableFields(fields).map((f) => f.name), ['name'])
is('a list can show only records with (or without) a photo', filterOps(fields[1]).map((o) => o.op), ['filled', 'empty'])

/* ---------- which records use it ---------- */
const p2 = photoPath(P, R2, F(2))
is('photos used by live records only', [...photoRefs(fields, [{ values: { pic: path } }, { values: { pic: p2 }, deleted_at: 'x' }])], [path])
is('any value that is a photo\'s name counts (a field since renamed)', pathsIn({ a: 'text', old_pic: p2 }), [p2])

/* ---------- tidying away ---------- */
const DAY = 86_400_000
const now = Date.parse('2026-10-04T12:00:00Z')
const ago = (d) => new Date(now - d * DAY).toISOString()
const kept = (p, days) => ({ path: p, created_at: ago(days) })
const known = new Map([[R, { deleted_at: null }], [R2, { deleted_at: ago(3) }]])
is('a photo a record uses always stays', photosToRemove([kept(path, 90)], known, new Set([path]), now), [])
is('a photo of a record deleted three days ago goes', photosToRemove([kept(p2, 10)], known, new Set(), now), [p2])
is(`a record deleted within ${KEEP_AFTER_DELETE_DAYS} day keeps it (Undo)`, photosToRemove([kept(p2, 10)], new Map([[R2, { deleted_at: ago(0.2) }]]), new Set(), now), [])
is('a live record that took it off or changed it: it goes', photosToRemove([kept(photoPath(P, R, F(3)), 5)], known, new Set([path]), now), [photoPath(P, R, F(3))])
is(`nothing younger than ${NEW_PHOTO_DAYS} days ever goes (its record may be on its way)`, photosToRemove([kept(photoPath(P, R, F(4)), 1)], known, new Set(), now), [])
const stranger = photoPath(P, '99999999-9999-4999-8999-999999999999', F(5))
is('a record this device has never seen keeps its photo for a month', photosToRemove([kept(stranger, 10)], known, new Set(), now), [])
is(`…and after ${UNKNOWN_RECORD_DAYS} days it goes`, photosToRemove([kept(stranger, 31)], known, new Set(), now), [stranger])
is('a duplicate using the original\'s photo keeps it after the original goes', photosToRemove([kept(p2, 10)], known, new Set([p2]), now), [])
is('a name that is not a photo is never touched', photosToRemove([{ path: `${P}/notes.txt`, created_at: ago(90) }], known, new Set(), now), [])

if (fail) { console.log(`\n${fail} check(s) failed`); process.exit(1) }
console.log('\nall checks passed')
