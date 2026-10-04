/** A photo kept on this device (Dexie version 14, MOD-12): its name in
 *  Storage, the picture itself, and whether it has reached Storage yet. */
export interface PhotoRow {
  path: string
  profile_id: string
  blob: Blob
  /** pending: taken here and not uploaded yet; cached: a copy of what is in Storage. */
  state: 'pending' | 'cached'
  created_at: string
  /** When it was last shown, so a full cache can let the oldest go. */
  used_at: string
}
