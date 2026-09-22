/** A module is configuration on a shared core, not a hard-coded screen.
 *  Built-in modules are defined the same way a custom one is, which is what
 *  makes the editor an addition later rather than a rewrite. */

export type FieldType =
  | 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'time'
  | 'datetime' | 'select' | 'lookup' | 'formula' | 'duration'

export interface FieldDef {
  name: string
  label: string
  type: FieldType
  /** Spreadsheet-style expression over the record's own fields, e.g.
   *  "grams * kcal / 100". Calculated fields are never stored. */
  formula?: string
  /** Table a lookup picks from, so a food or an exercise is never typed twice. */
  lookup?: 'food' | 'recipe' | 'exercise' | 'task' | 'goal'
  options?: string[]
  required?: boolean
  unit?: string
  width?: number
}

export interface ViewDef {
  key: string
  name: string
  type: 'list' | 'table' | 'calendar' | 'board' | 'grid' | 'chart' | 'form'
  entity: string
  columns?: string[]
  filters?: Record<string, unknown>
}

export interface RuleDef {
  name: string
  /** Stated as a sentence with one qualifier, the way the design kit asks. */
  sentence: string
  when: string
  then: string
  locked?: boolean
}

export interface EntityDef {
  name: string
  label: string
  /** A built-in module stores its records in its own table; a custom one uses
   *  the shared module_record store. Either way the planner sees the same
   *  Task and Series rows. */
  table?: string
  fields: FieldDef[]
}

export interface ModuleDef {
  key: string
  name: string
  summary: string
  entities: EntityDef[]
  views: ViewDef[]
  rules: RuleDef[]
  /** What the assistant is allowed to read and change once this is on. */
  skills?: string[]
  defaultOn?: boolean
  depth: 'full' | 'light'
}
