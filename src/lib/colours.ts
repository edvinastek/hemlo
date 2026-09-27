import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useApp } from './store'
import { readSettings } from './settings'
import { enabledModules } from './day'
import {
  assignBuiltColours, colourFor, moduleLabel, taskColour, taskModule,
} from './colours-rules'
import type { ModuleRow, Task } from './types'

export {
  SWATCHES, DEFAULT_COLOURS, colourFor, taskModule, taskColour, moduleLabel, contrastNote, parseHex, withColour,
} from './colours-rules'

/** Modules the person built (not deleted): their definitions for colours and
 *  their names for labels. Read live, so a module built on another device
 *  gets its colour as soon as it syncs in. */
export function useBuiltModules(): ModuleRow[] {
  return useLiveQuery(async () =>
    (await db.module.toArray()).filter((m) => !m.builtin && !m.deleted_at), [], [] as ModuleRow[])
}

export interface ModuleColours {
  /** Colour by module is switched on. */
  on: boolean
  /** The marker for a task, or null (off, or no module). */
  ofTask: (t: Pick<Task, 'module_key' | 'category'>) => string | null
  /** The colour for a module key, whether or not colours are on. */
  of: (key: string) => string
  label: (key: string) => string
  moduleOf: typeof taskModule
  /** Module keys switched on, built modules included. */
  enabled: string[]
  built: ModuleRow[]
}

/** Everything a screen needs to colour its items, for the current profile. */
export function useModuleColours(): ModuleColours {
  const profile = useApp((s) => s.profile)
  const built = useBuiltModules()
  const enabled = useLiveQuery(
    async () => (profile ? enabledModules(profile.id, built) : []), [profile?.id, built], [] as string[])
  return useMemo(() => {
    const settings = readSettings(profile)
    const defs = new Map(built.map((m) => [m.key, m.definition as unknown]))
    // Built modules get colours that stay clear of the ones already on the page.
    const assigned = assignBuiltColours(built.map((m) => m.key), defs, enabled, settings.colours)
    const names = new Map(built.map((m) => [m.key, m.name]))
    return {
      on: settings.colours.on,
      ofTask: (t) => taskColour(t, settings, assigned),
      of: (key) => colourFor(key, settings, assigned),
      label: (key) => moduleLabel(key, names),
      moduleOf: taskModule,
      enabled,
      built,
    }
  }, [profile, built, enabled])
}
