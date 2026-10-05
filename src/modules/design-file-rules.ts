/** A module's design as a file (MOD-16): its name, mark, fields, views and
 *  rules, never its records, so it can be passed to someone else and built
 *  again. Pure. Reading a file goes through the same checks as a module read
 *  from storage (def-rules.ts), so a hand-edited file cannot carry anything
 *  the app would not accept from its own editor. */
import type { ModuleDef } from './types.ts'
import { definitionFor, definitionProblem, readBuiltDefinition } from './def-rules.ts'
import { MODULE_FORMAT, isFormat } from '../lib/file-format-rules.ts'

export const DESIGN_FORMAT = MODULE_FORMAT
export const DESIGN_VERSION = 1

export interface DesignFile {
  format: typeof DESIGN_FORMAT
  version: typeof DESIGN_VERSION
  name: string
  definition: Record<string, unknown>
}

/** The file for a module: what is stored for it, records left out, and links
 *  to another built module's records dropped (that module is not in the
 *  file). */
export function designFile(def: ModuleDef): DesignFile {
  const d = definitionFor(def)
  const entities = (d.entities as { fields: { lookup?: string }[] }[]).map((e) => ({ ...e, fields: e.fields.filter((f) => f.lookup !== 'record') }))
  return { format: DESIGN_FORMAT, version: DESIGN_VERSION, name: def.name, definition: { ...d, entities } }
}

/** "plant-care.visuma-module.json" */
export function designFileName(name: string): string {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'module'
  return `${base}.visuma-module.json`
}

/** A file read back as a draft to build, or what is wrong with it. */
export function readDesignFile(text: string): { ok: true; def: ModuleDef } | { ok: false; problem: string } {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, problem: 'That file is not a module design.' } }
  const f = raw as Partial<DesignFile>
  // A design saved before version 21 says getit.module; it reads the same.
  if (!f || !isFormat(f.format, DESIGN_FORMAT) || typeof f.definition !== 'object' || !f.definition) return { ok: false, problem: 'That file is not a module design.' }
  if (f.version !== DESIGN_VERSION) return { ok: false, problem: 'That design comes from a newer Visuma. Update the app, then import it again.' }
  const def = readBuiltDefinition({ key: 'u_import00', name: typeof f.name === 'string' ? f.name : '', definition: f.definition })
  if (def.entities.length === 0 || def.entities.every((e) => e.fields.length === 0)) return { ok: false, problem: 'That design has no fields to build from.' }
  const problem = definitionProblem(def)
  return problem ? { ok: false, problem } : { ok: true, def }
}
