/** A recipe's photo (REC-11), as rules with no database, no network and no
 *  React (checked in src/test/recipephoto.check.mjs). The photo is a JPEG
 *  made on the device as for records (modules/photo-rules.ts: about 1600 px,
 *  under 2 MB), kept in the private 'record-photos' bucket as
 *  'recipes/<recipe id>/<photo id>.jpg' (migration 036: readable by whoever
 *  can read the recipe, written only by its owner). The recipe keeps that
 *  name in photo_path. */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PATH = new RegExp(`^recipes/(${UUID})/(${UUID})\\.jpg$`)

export const recipePhotoPath = (recipeId: string, photoId: string) => `recipes/${recipeId}/${photoId}.jpg`.toLowerCase()

/** Is this a recipe photo's name (and so safe to ask Storage for)? */
export const isRecipePhotoPath = (v: unknown): v is string => typeof v === 'string' && PATH.test(v)

/** The recipe a photo belongs to. */
export const recipeOfPhoto = (path: string): string | null => PATH.exec(path)?.[1] ?? null

/** How long a photo stays in Storage after its recipe was deleted or the
 *  photo replaced or removed: Undo and a day more. */
export const KEEP_DAYS = 1
const DAY = 86_400_000

export interface GonePhoto { path: string; since: string }

/** Photos to take out of Storage now: those set aside (replaced, removed)
 *  more than a day ago that no live recipe uses again (an Undo brings one
 *  back), and those of the person's own recipes deleted more than a day ago. */
export function recipePhotosToRemove(
  setAside: GonePhoto[],
  recipes: { id: string; owner_id: string | null; photo_path?: string | null; deleted_at?: string | null }[],
  me: string, now: number,
): string[] {
  const live = new Set(recipes.filter((r) => !r.deleted_at && r.photo_path).map((r) => r.photo_path as string))
  const out = new Set<string>()
  for (const g of setAside) {
    if (isRecipePhotoPath(g.path) && !live.has(g.path) && now - Date.parse(g.since) > KEEP_DAYS * DAY) out.add(g.path)
  }
  for (const r of recipes) {
    if (r.owner_id !== me || !r.deleted_at || !isRecipePhotoPath(r.photo_path)) continue
    if (live.has(r.photo_path)) continue
    if (now - Date.parse(r.deleted_at) > KEEP_DAYS * DAY) out.add(r.photo_path)
  }
  return [...out]
}

/** The set-aside list after a sweep: what was removed goes, what is in use
 *  again goes, the rest waits. */
export function stillAside(setAside: GonePhoto[], removed: string[], recipes: { photo_path?: string | null; deleted_at?: string | null }[]): GonePhoto[] {
  const live = new Set(recipes.filter((r) => !r.deleted_at && r.photo_path).map((r) => r.photo_path as string))
  return setAside.filter((g) => !removed.includes(g.path) && !live.has(g.path))
}
