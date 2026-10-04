import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { edit } from './write'
import { useApp } from './store'
import { ensureInstance, instanceFor } from '../modules/defs'
import { readLabelChoice, type LabelChoice } from './eu-label-rules'
import { readUnitOverlay, withOverlay, readUnits, type FoodUnit } from './units-rules'
import { readMicroChoice, type MicroCode } from './micros-rules'
import type { Food } from './types'

/** The nutrition module's own choices, kept in its module settings (per
 *  profile, synced): which extra label figures the food lists show and
 *  whether %RI is shown (FOOD-16, FOOD-06), and the units a person added to
 *  shared foods (UNIT-16). */
const LABEL_KEY = 'label'
const OVERLAY_KEY = 'unit_overlay'
/** The vitamins and minerals the person shows (FOOD-17): none by default. */
const MICROS_KEY = 'micros'

export interface NutritionPrefs { label: LabelChoice; overlay: Record<string, FoodUnit[]>; micros: MicroCode[] }

export async function nutritionPrefs(profileId: string): Promise<NutritionPrefs> {
  const inst = await instanceFor(profileId, 'nutrition')
  return {
    label: readLabelChoice(inst?.settings?.[LABEL_KEY]), overlay: readUnitOverlay(inst?.settings?.[OVERLAY_KEY]),
    micros: readMicroChoice(inst?.settings?.[MICROS_KEY]),
  }
}

export function useNutritionPrefs(): NutritionPrefs {
  const profileId = useApp((s) => s.profile?.id ?? null)
  return useLiveQuery(async () => (profileId ? nutritionPrefs(profileId) : EMPTY), [profileId], EMPTY)
}
const EMPTY: NutritionPrefs = { label: { figures: [], ri: false }, overlay: {}, micros: [] }

/** Change some of the nutrition module's settings, keeping the rest (the
 *  module's own overlay and rules included). Made when the profile has no
 *  row for the module yet, switched off: choosing a figure never switches a
 *  module on. */
async function saveModuleSetting(profileId: string, key: string, value: unknown) {
  const inst = await ensureInstance(profileId, 'nutrition', false)
  const current = (await db.module_instance.get(inst.id)) ?? inst
  await edit('module_instance', current, { settings: { ...(current.settings ?? {}), [key]: value } })
}

export async function saveLabelChoice(profileId: string, choice: LabelChoice) {
  await saveModuleSetting(profileId, LABEL_KEY, readLabelChoice(choice))
}

/** Which vitamins and minerals the food pages, recipes and the day show. */
export async function saveMicroChoice(profileId: string, codes: MicroCode[]) {
  await saveModuleSetting(profileId, MICROS_KEY, readMicroChoice(codes))
}

/** A person's own units for one shared food (empty to remove them all). */
export async function saveOwnUnits(profileId: string, foodId: string, units: FoodUnit[]) {
  const overlay = (await nutritionPrefs(profileId)).overlay
  const next = { ...overlay }
  const mine = units.filter((u) => u.source === 'mine' || !u.source).map(({ source: _s, ...u }) => u)
  if (mine.length) next[foodId] = mine
  else delete next[foodId]
  await saveModuleSetting(profileId, OVERLAY_KEY, next)
  overlayNow = next
}

// ---- the overlay, everywhere a food is read -------------------------------------------------

/** The person's own units are laid over shared foods as the foods are read
 *  from the device's database, so every screen that counts in units (meals,
 *  recipes, stock, scanning, the shopping list) offers them without knowing
 *  about overlays. Only shared foods get them; nothing is written back. */
let overlayNow: Record<string, FoodUnit[]> = {}

db.food.hook('reading', (f: Food) => {
  const own = f && !f.owner_id ? overlayNow[f.id] : undefined
  return own?.length ? { ...f, units: withOverlay(readUnits(f.units), own) } : f
})

/** Follows the open profile's overlay. Started once, when the app loads this
 *  file; a profile switch or a change from another device is picked up. */
let watching = false
export function watchUnitOverlay() {
  if (watching) return
  watching = true
  let lastProfile: string | null = null
  const refresh = async () => {
    const id = useApp.getState().profile?.id ?? null
    lastProfile = id
    overlayNow = id ? (await nutritionPrefs(id)).overlay : {}
  }
  useApp.subscribe((s) => { if ((s.profile?.id ?? null) !== lastProfile) void refresh() })
  db.module_instance.hook('creating', () => { setTimeout(() => void refresh(), 0) })
  db.module_instance.hook('updating', () => { setTimeout(() => void refresh(), 0) })
  void refresh()
}
watchUnitOverlay()
