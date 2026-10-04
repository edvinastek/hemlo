import { db, getMeta, setMeta } from './db'
import { supabase } from './supabase'
import { useApp } from './store'
import { edit } from './write'
import { makePhoto, uploadPending } from '../modules/photos'
import { PHOTO_BUCKET } from '../modules/photo-rules'
import { recipePhotoPath, recipePhotosToRemove, stillAside, type GonePhoto } from './recipe-photo-rules'
import type { Recipe } from './types'

/** A recipe's photo (REC-11), on the v18 photo storage (modules/photos.ts):
 *  made smaller on the device, kept in this device's database at once (so
 *  the recipe shows it offline) and uploaded to the private bucket when
 *  there is a connection. A replaced or removed photo, and the photo of a
 *  deleted recipe, leave Storage a day later, so Undo still has them. */

const ASIDE = 'recipe-photos:aside'
const SWEPT = 'recipe-photos:swept'
const DAY_MS = 86_400_000

async function setAside(path: string | null | undefined) {
  if (!path) return
  const list = await getMeta<GonePhoto[]>(ASIDE, [])
  if (!list.some((g) => g.path === path)) await setMeta(ASIDE, [...list, { path, since: new Date().toISOString() }])
}

/** Give a recipe a new photo from a picked file (camera or files). Returns
 *  what went wrong in words, or null. The old photo is set aside. */
export async function setRecipePhoto(recipe: Recipe, file: File): Promise<string | null> {
  const made = await makePhoto(file)
  if (!made.ok) return made.message
  const path = recipePhotoPath(recipe.id, crypto.randomUUID())
  const now = new Date().toISOString()
  await db.photo.put({ path, profile_id: 'recipes', blob: made.blob, state: 'pending', created_at: now, used_at: now })
  const current = (await db.recipe.get(recipe.id)) ?? recipe
  await setAside(current.photo_path)
  await edit('recipe', current, { photo_path: path })
  void uploadPending()
  return null
}

/** Take the photo off a recipe (it stays in Storage a day, for Undo). */
export async function removeRecipePhoto(recipe: Recipe): Promise<void> {
  const current = (await db.recipe.get(recipe.id)) ?? recipe
  await setAside(current.photo_path)
  await edit('recipe', current, { photo_path: null })
}

/** Put a photo back (Undo). */
export async function restoreRecipePhoto(recipe: Recipe, path: string | null): Promise<void> {
  const current = (await db.recipe.get(recipe.id)) ?? recipe
  await edit('recipe', current, { photo_path: path })
}

/** Out of Storage: photos set aside more than a day ago and photos of the
 *  person's recipes deleted more than a day ago. After a sync, at most once
 *  a day. */
export async function tidyRecipePhotos(force = false): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0
  const me = useApp.getState().session?.user.id
  if (!me) return 0
  const last = await getMeta<string | null>(SWEPT, null)
  if (!force && last && Date.now() - Date.parse(last) < DAY_MS) return 0
  const recipes = await db.recipe.toArray()
  const aside = await getMeta<GonePhoto[]>(ASIDE, [])
  const gone = recipePhotosToRemove(aside, recipes, me, Date.now())
  if (gone.length) {
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(gone)
    if (error) return 0
    await db.photo.bulkDelete(gone)
    // A deleted recipe forgets its photo, so it is not asked about again.
    for (const r of recipes) if (r.deleted_at && r.photo_path && gone.includes(r.photo_path)) await edit('recipe', r, { photo_path: null })
  }
  await setMeta(ASIDE, stillAside(aside, gone, recipes))
  await setMeta(SWEPT, new Date().toISOString())
  return gone.length
}

let watching = false
/** Tidy after each sync (once a day). Started when this file is loaded. */
export function watchRecipePhotos() {
  if (watching || typeof window === 'undefined') return
  watching = true
  useApp.subscribe((s, prev) => {
    if (s.lastSync && s.lastSync !== prev.lastSync) void tidyRecipePhotos().catch(() => undefined)
  })
}
watchRecipePhotos()
