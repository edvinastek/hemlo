// Checks a recipe's photo (REC-11): its name in Storage (the recipe's own
// folder under recipes/, which migration 036's policies read), and which
// photos leave Storage when: replaced or taken off, or the recipe deleted,
// each only after a day so Undo still has them, and never one in use again.
import { recipePhotoPath, isRecipePhotoPath, recipeOfPhoto, recipePhotosToRemove, stillAside } from '../lib/recipe-photo-rules.ts'
import { isPhotoPath } from '../modules/photo-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

const R = '11111111-2222-4333-8444-555555555555'
const P = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const Q = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const path = recipePhotoPath(R, P)
is('the name: recipes/<recipe>/<photo>.jpg', path, `recipes/${R}/${P}.jpg`)
is('known as a recipe photo, and never as a record’s', [isRecipePhotoPath(path), isPhotoPath(path)], [true, false])
is('a record’s photo is not a recipe’s', isRecipePhotoPath(`${R}/${R}/${P}.jpg`), false)
is('anything else is refused', [isRecipePhotoPath('recipes/x/y.jpg'), isRecipePhotoPath(`recipes/${R}/${P}.png`), isRecipePhotoPath(`recipes/${R}/${P}.jpg/x`), isRecipePhotoPath(null)], [false, false, false, false])
is('the recipe it belongs to', recipeOfPhoto(path), R)
is('capitals made small, as the database checks', recipePhotoPath(R.toUpperCase(), P), path)

const me = 'me'
const now = Date.parse('2026-10-04T12:00:00Z')
const old = '2026-10-02T12:00:00Z'
const recent = '2026-10-04T09:00:00Z'
const other = recipePhotoPath(R, Q)
const recipes = [
  { id: R, owner_id: me, photo_path: other, deleted_at: null },
  { id: 'gone', owner_id: me, photo_path: recipePhotoPath('99999999-2222-4333-8444-555555555555', P), deleted_at: old },
  { id: 'fresh', owner_id: me, photo_path: recipePhotoPath('88888888-2222-4333-8444-555555555555', P), deleted_at: recent },
  { id: 'theirs', owner_id: 'them', photo_path: recipePhotoPath('77777777-2222-4333-8444-555555555555', P), deleted_at: old },
]
const aside = [{ path, since: old }, { path: other, since: old }, { path: recipePhotoPath(R, '12345678-bbbb-4ccc-8ddd-eeeeeeeeeeee'), since: recent }]
const gone = recipePhotosToRemove(aside, recipes, me, now)
is('a replaced photo goes after a day', gone.includes(path), true)
is('one set aside but in use again (Undo) stays', gone.includes(other), false)
is('one set aside within the day stays', gone.some((g) => g.includes('12345678')), false)
is('a recipe deleted more than a day ago loses its photo', gone.includes(recipes[1].photo_path), true)
is('a recipe deleted today keeps it (Undo)', gone.includes(recipes[2].photo_path), false)
is('another person’s recipe is never touched', gone.includes(recipes[3].photo_path), false)
is('after the sweep: removed and in-use ones leave the list, the rest wait', stillAside(aside, gone, recipes).map((g) => g.path), [aside[2].path])

console.log(fail ? `\n${fail} failed` : '\nAll recipe photo checks passed')
process.exit(fail ? 1 : 0)
