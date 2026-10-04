import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, setMeta } from '../lib/db'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { readBuiltDefinition } from './def-rules'
import {
  PHOTO_BUCKET, PHOTO_MAX_BYTES, PHOTO_MAX_INPUT_BYTES, PHOTO_QUALITIES, fitWithin, isPhotoPath, pathsIn, photoPath,
  photoRefs, photosToRemove, type KeptPhoto, type KnownRecord,
} from './photo-rules'

/** Photos on the device (MOD-12). A photo is made smaller here (about
 *  1600 px, JPEG), kept in this device's database at once, so the record
 *  shows it with no connection, and uploaded to the private bucket when
 *  there is one. Photos seen once stay on the device for offline viewing.
 *  Photos no record uses any more are tidied away after a sync (at most
 *  once a day), a day after their record was deleted, so Undo still has
 *  them. The rules are in photo-rules.ts. */

/* ---------- making one ------------------------------------------------------- */

/** A picked file as a JPEG of at most PHOTO_MAX_PX on its longest side,
 *  under the bucket's limit. Turned the right way up (the camera's own
 *  orientation is applied by the browser). */
export async function makePhoto(file: File): Promise<{ ok: true; blob: Blob } | { ok: false; message: string }> {
  if (!file.type.startsWith('image/')) return { ok: false, message: 'That is not a picture.' }
  if (file.size > PHOTO_MAX_INPUT_BYTES) return { ok: false, message: 'That picture is too large to open.' }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
  } catch {
    return { ok: false, message: 'That picture could not be opened.' }
  }
  try {
    for (const shrink of [1, 0.75, 0.5]) {
      const size = fitWithin(bitmap.width * shrink, bitmap.height * shrink)
      const canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return { ok: false, message: 'This device cannot make the photo smaller.' }
      ctx.drawImage(bitmap, 0, 0, size.width, size.height)
      for (const q of PHOTO_QUALITIES) {
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q))
        if (blob && blob.size <= PHOTO_MAX_BYTES) return { ok: true, blob }
      }
    }
    return { ok: false, message: 'That photo is too large, even made smaller.' }
  } finally {
    bitmap.close()
  }
}

/** Keep a new photo for a record: on this device at once, in Storage as
 *  soon as there is a connection. Returns its name, which the record keeps. */
export async function keepPhoto(profileId: string, recordId: string, blob: Blob): Promise<string> {
  const path = photoPath(profileId, recordId, crypto.randomUUID())
  const now = new Date().toISOString()
  await db.photo.put({ path, profile_id: profileId, blob, state: 'pending', created_at: now, used_at: now })
  void uploadPending()
  return path
}

/* ---------- showing one -------------------------------------------------------- */

const fetching = new Map<string, Promise<void>>()

/** Fetch a photo from Storage into this device's copy (once at a time). */
function fetchPhoto(path: string): Promise<void> {
  if (fetching.has(path)) return fetching.get(path)!
  const job = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(path)
    if (error || !data) return
    const profile = path.split('/')[0]
    const now = new Date().toISOString()
    await db.photo.put({ path, profile_id: profile, blob: data, state: 'cached', created_at: now, used_at: now })
  })().catch(() => undefined).finally(() => fetching.delete(path))
  fetching.set(path, job)
  return job
}

/** A photo to show: a local address for it, null while it is being
 *  fetched or cannot be (offline and never seen here), undefined for none. */
export function usePhotoUrl(path: unknown): string | null | undefined {
  const valid = isPhotoPath(path) ? path : null
  const row = useLiveQuery(async () => (valid ? (await db.photo.get(valid)) ?? null : undefined), [valid])
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!row) { setUrl(null); return }
    const u = URL.createObjectURL(row.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [row])
  useEffect(() => {
    if (valid && row === null) void fetchPhoto(valid)
  }, [valid, row])
  if (!valid) return undefined
  return url
}

/* ---------- uploading and tidying ----------------------------------------------- */

let uploading: Promise<void> | null = null

/** Upload every photo still waiting; those that fail wait for the next try. */
export function uploadPending(): Promise<void> {
  if (uploading) return uploading
  uploading = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    if (!useApp.getState().session) return
    const waiting = await db.photo.where('state').equals('pending').toArray()
    for (const p of waiting) {
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(p.path, p.blob, { contentType: 'image/jpeg', upsert: true })
      if (!error) await db.photo.update(p.path, { state: 'cached' })
    }
  })().catch(() => undefined).finally(() => { uploading = null })
  return uploading
}

const SWEEP_KEY = 'photos:swept'
const DAY_MS = 86_400_000

/** Photos no record uses any more go from Storage and from this device:
 *  checked after a sync, at most once a day, for every profile on it. */
export async function tidyPhotos(force = false): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0
  if (!useApp.getState().session) return 0
  const last = await getMeta<string | null>(SWEEP_KEY, null)
  if (!force && last && Date.now() - Date.parse(last) < DAY_MS) return 0
  // Waiting uploads first, so nothing in Storage is newer than this device knows.
  await uploadPending()
  if (await db.photo.where('state').equals('pending').count()) return 0
  const records = await db.module_record.toArray()
  const known = new Map<string, KnownRecord>(records.map((r) => [r.id, { deleted_at: r.deleted_at }]))
  // In use: every photo field of every live record, and, for records whose
  // module is no longer to hand, any value that is a photo's name.
  const used = new Set<string>()
  const defs = new Map((await db.module.toArray()).filter((m) => !m.deleted_at && !m.builtin).map((m) => [m.key, readBuiltDefinition(m)]))
  for (const r of records) {
    if (r.deleted_at) continue
    const def = defs.get(r.module_key)
    const entity = def?.entities.find((e) => e.name === r.entity)
    if (entity) for (const p of photoRefs(entity.fields, [r])) used.add(p)
    for (const p of pathsIn(r.data)) used.add(p)
  }
  let removed = 0
  const profiles = [...new Set((await db.profile.toArray()).map((p) => p.id))]
  for (const profile of profiles) {
    const kept: KeptPhoto[] = []
    const { data: folders, error } = await supabase.storage.from(PHOTO_BUCKET).list(profile, { limit: 1000 })
    if (error || !folders) continue
    for (const folder of folders) {
      // A folder is a record; its files are the photos.
      if (folder.id) continue
      const { data: files } = await supabase.storage.from(PHOTO_BUCKET).list(`${profile}/${folder.name}`, { limit: 100 })
      for (const f of files ?? []) kept.push({ path: `${profile}/${folder.name}/${f.name}`, created_at: f.created_at ?? null })
    }
    const gone = photosToRemove(kept, known, used, Date.now())
    if (gone.length) {
      const { error: e2 } = await supabase.storage.from(PHOTO_BUCKET).remove(gone)
      if (!e2) { await db.photo.bulkDelete(gone); removed += gone.length }
    }
  }
  // Copies on this device that nothing uses and that are safely in Storage.
  const local = await db.photo.where('state').equals('cached').toArray()
  await db.photo.bulkDelete(local.filter((p) => !used.has(p.path) && Date.now() - Date.parse(p.created_at) > 2 * DAY_MS).map((p) => p.path))
  await setMeta(SWEEP_KEY, new Date().toISOString())
  return removed
}

/* ---------- after every sync ----------------------------------------------------- */

let watching = false
/** Upload waiting photos after each sync, and tidy once a day. Started
 *  when this file is first loaded (the record views load it). */
export function watchPhotos() {
  if (watching || typeof window === 'undefined') return
  watching = true
  useApp.subscribe((s, prev) => {
    if (s.lastSync && s.lastSync !== prev.lastSync) void uploadPending().then(() => tidyPhotos())
  })
  window.addEventListener('online', () => { void uploadPending() })
  void uploadPending()
}
watchPhotos()

/** Every photo of this device's profiles out of Storage: called just before
 *  the account is deleted, since Storage keeps files apart from the rows. */
export async function removeAllPhotos(): Promise<void> {
  for (const p of await db.profile.toArray()) {
    const { data: folders } = await supabase.storage.from(PHOTO_BUCKET).list(p.id, { limit: 1000 })
    for (const folder of folders ?? []) {
      if (folder.id) continue
      const { data: files } = await supabase.storage.from(PHOTO_BUCKET).list(`${p.id}/${folder.name}`, { limit: 100 })
      const names = (files ?? []).map((f) => `${p.id}/${folder.name}/${f.name}`)
      if (names.length) await supabase.storage.from(PHOTO_BUCKET).remove(names)
    }
  }
}
