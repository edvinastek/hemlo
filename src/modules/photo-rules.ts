import type { FieldDef } from './types.ts'

/** Photos on a built module's records (MOD-12), as rules with no database,
 *  no network and no React (checked in src/test/photos.check.mjs): how big
 *  a photo is made on the device, what it is called in Storage, which
 *  records use it, and which kept photos can go.
 *
 *  A photo is a JPEG in the private 'record-photos' bucket, named
 *  '<profile id>/<record id>/<photo id>.jpg' (migration 033: only the
 *  people who can see the record's profile can see it). The record keeps
 *  that name in its field. */

export const PHOTO_BUCKET = 'record-photos'
/** The longest side a photo is made, in pixels. */
export const PHOTO_MAX_PX = 1600
/** JPEG quality, then lower ones tried while it is still too large. */
export const PHOTO_QUALITIES = [0.8, 0.7, 0.6, 0.5]
/** What the bucket takes at most (migration 033). */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024
/** A file larger than this is not even opened. */
export const PHOTO_MAX_INPUT_BYTES = 40 * 1024 * 1024

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PATH = new RegExp(`^(${UUID})/(${UUID})/(${UUID})\\.jpg$`)

/** A photo's name in Storage. */
export const photoPath = (profileId: string, recordId: string, photoId: string) => `${profileId}/${recordId}/${photoId}.jpg`.toLowerCase()

/** Is this a photo's name (and so safe to ask Storage for)? */
export const isPhotoPath = (v: unknown): v is string => typeof v === 'string' && PATH.test(v)

/** The profile and the record a photo was taken for. */
export function photoParts(path: string): { profile: string; record: string } | null {
  const m = PATH.exec(path)
  return m ? { profile: m[1], record: m[2] } : null
}

/** A picture's size made to fit within `max` on its longest side, never
 *  made larger, in whole pixels (at least 1). */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_PX): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** The photo fields of an entity. */
export const photoFields = (fields: FieldDef[]) => fields.filter((f) => f.type === 'photo')

/** Every photo the given records use, in any photo field. */
export function photoRefs(fields: FieldDef[], records: { values?: Record<string, unknown>; data?: Record<string, unknown> | null; deleted_at?: string | null }[]): Set<string> {
  const out = new Set<string>()
  const names = photoFields(fields).map((f) => f.name)
  for (const r of records) {
    if (r.deleted_at) continue
    const v = r.values ?? r.data ?? {}
    for (const n of names) if (isPhotoPath(v[n])) out.add(v[n] as string)
  }
  return out
}

/** Every photo name anywhere in a record's values: for records whose
 *  module's fields are not to hand (a module deleted, a field renamed). */
export function pathsIn(values: Record<string, unknown> | null | undefined): string[] {
  return Object.values(values ?? {}).filter(isPhotoPath)
}

export interface KeptPhoto { path: string; created_at: string | null }
export interface KnownRecord { deleted_at: string | null }

const DAY = 86_400_000
/** How long a photo stays after its record is deleted: Undo and a day more. */
export const KEEP_AFTER_DELETE_DAYS = 1
/** A photo younger than this is never tidied away: its record may still be
 *  on its way from another device. */
export const NEW_PHOTO_DAYS = 2
/** A photo whose record this device has never heard of goes only after this. */
export const UNKNOWN_RECORD_DAYS = 30

/** Which kept photos can go: none that any live record uses; of the rest,
 *  those whose record was deleted more than a day ago, those of a live
 *  record that now uses another photo, and those whose record is unknown
 *  here after a month. Nothing younger than two days ever goes. */
export function photosToRemove(kept: KeptPhoto[], records: Map<string, KnownRecord>, used: Set<string>, now: number): string[] {
  const out: string[] = []
  for (const k of kept) {
    if (!isPhotoPath(k.path) || used.has(k.path)) continue
    const made = k.created_at ? Date.parse(k.created_at) : NaN
    const age = Number.isFinite(made) ? (now - made) / DAY : 0
    if (age < NEW_PHOTO_DAYS) continue
    const rec = records.get(photoParts(k.path)!.record)
    if (!rec) { if (age >= UNKNOWN_RECORD_DAYS) out.push(k.path); continue }
    if (rec.deleted_at) {
      const gone = (now - Date.parse(rec.deleted_at)) / DAY
      if (Number.isFinite(gone) && gone >= KEEP_AFTER_DELETE_DAYS) out.push(k.path)
      continue
    }
    // A live record that no longer uses it: the photo was changed or taken off.
    out.push(k.path)
  }
  return out
}
