import { useMemo, useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import type { EntityDef, FieldDef, ModuleDef } from './types'
import type { ModuleRecord } from '../lib/types'
import { PlainSheet } from './ModuleHead'
import { Dropdown, type Option } from '../ui/Dropdown'
import { DayPickSheet } from '../ui/DayPickSheet'
import { RepeatPicker, NO_REPEAT, type RepeatValue } from '../ui/RepeatPicker'
import { SelectAction, SelectBar, SelectDelete } from '../ui/SelectBar'
import { useExport } from '../ui/ExportLink'
import { offerUndo } from '../ui/Undo'
import { useSelection, type Selection } from '../ui/useSelection'
import type { MenuItem } from '../ui/MoreMenu'
import { computeFormulas, firstDateField } from './def-rules'
import { canCopy, copyRecords, deleteRecords, restoreRecords, saveListOrder, setEventRepeat, useListOrder, type Lookups, type Rec } from './records'
import { recordRepeat, setRecordRepeat } from './record-repeat'
import { RECORD_REPEAT_KINDS } from './repeat-rules'
import { EVENT_RULE_KINDS } from '../lib/day-items-rules'
import { arrange, filterOps, filterableFields, orderSummary, sortableFields, sortDirs, type FilterOp, type ListOrder, type SortDir } from './list-rules'
import { formatValue } from './RecordSheet'
import { plural } from '../lib/stats-builder-rules'
import { planToday } from '../lib/day-edge'

/** The tools of a module's record list (GEN-52, competitor review 4.2):
 *  sort and filter by a field (in the page's ⋮), the quiet line that says
 *  so, and what can be done with several records at once. */

/* ---------- one hook for a view's list ---------------------------------------- */

export interface ListTools {
  /** The records in the view's order, filtered (undefined while loading). */
  arranged: Rec[] | undefined
  sel: Selection<Rec>
  /** For the page's ⋮: Sort and filter…, Select. */
  menu: (MenuItem | null | false)[]
  /** The quiet line over the list (null when nothing is arranged). */
  line: ReactNode
  /** The sheet and the select bar, drawn by the page. `shown`: the rows on
   *  screen (after a search). */
  overlays: (shown: Rec[]) => ReactNode
  /** Filtered to nothing: say so. */
  filteredOut: boolean
}

/** What a view of a module's records needs to be arranged and picked from
 *  (GEN-52, competitor review 4.2): its kept sort and filter, select mode
 *  for lists and tables, and the ⋮ items for both. */
export function useListTools({ def, entity, viewKey, viewType, profileId, recs, lookups, repeat = true }: {
  def: ModuleDef; entity: EntityDef | undefined; viewKey: string; viewType: string | undefined; profileId: string
  recs: Rec[] | undefined; lookups: Lookups
  /** Offer Change repeat (Finance's entries do not repeat; its payments do). */
  repeat?: boolean
}): ListTools {
  const [ordering, setOrdering] = useState(false)
  const key = `${entity?.name ?? ''}:${viewKey}`
  const order = useListOrder(profileId, def.key, key, entity?.fields ?? [])
  const sortsHere = viewType === 'list' || viewType === 'table' || viewType === 'board'
  const arranged = useMemo(() => (recs && entity && order
    ? arrange(recs, entity.fields, sortsHere ? order : { filter: order.filter }, (f, v) => formatValue(f, v, lookups))
    : recs), [recs, entity, order, sortsHere, lookups])
  const picks = viewType === 'list' || viewType === 'table'
  const sel = useSelection(picks ? arranged ?? [] : [])
  const any = !!recs?.length
  const arrangedHere = !!order && !!(order.filter || (sortsHere && order.sort))
  return {
    arranged,
    sel,
    menu: [
      !!entity && viewType !== 'form' && any && { label: sortsHere ? 'Sort and filter…' : 'Filter…', onSelect: () => setOrdering(true) },
      !!entity && picks && any && sel.menuItem(`Select ${plural(entity.label.toLowerCase())}`),
    ],
    line: entity && arrangedHere ? <OrderLine order={order!} fields={entity.fields} onClear={() => void saveListOrder(profileId, def.key, key, {})} /> : null,
    filteredOut: arrangedHere && !!recs?.length && !arranged?.length,
    overlays: (shown) => entity && (
      <>
        {ordering && order && (
          <OrderSheet profileId={profileId} moduleKey={def.key} viewKey={key} entity={entity} order={order} sortable={sortsHere} onClose={() => setOrdering(false)} />
        )}
        {sel.selecting && <RecordSelectBar def={def} entity={entity} profileId={profileId} sel={sel} shown={shown} lookups={lookups} repeat={repeat} />}
      </>
    ),
  }
}

/* ---------- sort and filter ------------------------------------------------- */

/** The quiet line over an arranged list, with the way back to its own order. */
export function OrderLine({ order, fields, onClear }: { order: ListOrder; fields: FieldDef[]; onClear: () => void }) {
  const text = orderSummary(order, fields)
  if (!text) return null
  return (
    <div className="mp-order" role="status">
      <span>{text}</span>
      <button type="button" className="mp-order-clear" onClick={onClear} aria-label={`Clear: ${text}`}>Clear</button>
    </div>
  )
}

/** "Sort and filter…": by which field and which way round, and which
 *  records to show. Applied when the person says so; Clear goes back. */
export function OrderSheet({ profileId, moduleKey, viewKey, entity, order, sortable, onClose }: {
  profileId: string; moduleKey: string; viewKey: string; entity: EntityDef; order: ListOrder
  /** False for views that lay records out by themselves (a calendar). */
  sortable: boolean
  onClose: () => void
}) {
  const [sortField, setSortField] = useState(order.sort?.field ?? '')
  const [dir, setDir] = useState<SortDir>(order.sort?.dir ?? 'asc')
  const [filterField, setFilterField] = useState(order.filter?.field ?? '')
  const [op, setOp] = useState<FilterOp | ''>(order.filter?.op ?? '')
  const [value, setValue] = useState(order.filter?.value ?? '')
  const sf = entity.fields.find((f) => f.name === sortField)
  const ff = entity.fields.find((f) => f.name === filterField)
  const ops = ff ? filterOps(ff) : []
  const opNow = ops.find((o) => o.op === op) ?? ops[0]
  const ready = !ff || !opNow?.needsValue || value.trim() !== ''

  async function apply(next: ListOrder) {
    await saveListOrder(profileId, moduleKey, viewKey, next)
    onClose()
  }
  const draft = (): ListOrder => ({
    sort: sortable && sf ? { field: sf.name, dir } : null,
    filter: ff && opNow ? { field: ff.name, op: opNow.op, value: opNow.needsValue ? value.trim() : null } : null,
  })

  const sortOptions: Option[] = [{ value: '', label: 'Their own order' }, ...sortableFields(entity.fields).map((f) => ({ value: f.name, label: f.label }))]
  const filterOptions: Option[] = [{ value: '', label: `Every ${entity.label.toLowerCase()}` }, ...filterableFields(entity.fields).map((f) => ({ value: f.name, label: f.label }))]

  return (
    <PlainSheet title={sortable ? 'Sort and filter' : 'Filter'} onClose={onClose} actions={<>
      {(order.sort || order.filter) && <button type="button" className="btn" onClick={() => void apply({})}>Clear</button>}
      <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => void apply(draft())}>Apply</button>
    </>}>
      <div className="mp-order-form">
        {sortable && (
          <div className="mf-field">
            <span>Sort by</span>
            <Dropdown label="Sort by" value={sortField} options={sortOptions} onChange={(v) => { setSortField(v); const f = entity.fields.find((x) => x.name === v); if (f) setDir(sortDirs(f)[0].dir) }} />
            {sf && (
              <div className="mp-seg" role="group" aria-label="Which way round">
                {sortDirs(sf).map((d) => (
                  <button key={d.dir} type="button" className="me-col" aria-pressed={dir === d.dir} onClick={() => setDir(d.dir)}>{d.label}</button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="mf-field">
          <span>Show</span>
          <Dropdown label="Show" value={filterField} options={filterOptions} onChange={(v) => { setFilterField(v); setOp(''); setValue('') }} />
        </div>
        {ff && opNow && (
          <div className="mf-field">
            <span>Where {ff.label.toLowerCase()}</span>
            <Dropdown label={`Test for ${ff.label}`} value={opNow.op} options={ops.map((o) => ({ value: o.op, label: o.label }))} onChange={(v) => setOp(v)} />
            {opNow.needsValue && <FilterValue field={ff} value={value} onChange={setValue} />}
          </div>
        )}
      </div>
    </PlainSheet>
  )
}

function FilterValue({ field: f, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  if ((f.type === 'select' || f.type === 'multi') && f.options?.length) {
    return <Dropdown label={`${f.label} to look for`} value={value} placeholder="Choose" options={f.options.map((o) => ({ value: o, label: o }))} onChange={onChange} />
  }
  const numeric = ['number', 'integer', 'duration', 'formula', 'rating', 'percent', 'money'].includes(f.type)
  const date = f.type === 'date' || f.type === 'datetime'
  return (
    <input className="mp-order-value" aria-label={`${f.label} to look for`} value={value} onChange={(e) => onChange(e.target.value)}
      type={numeric ? 'number' : date ? 'date' : 'text'} inputMode={numeric ? 'decimal' : undefined} step={numeric ? 'any' : undefined} maxLength={80} />
  )
}

/* ---------- several records at once ------------------------------------------ */

type Panel = null | 'day' | 'repeat'

/** The select bar of a module's records: Duplicate, Copy to day (records
 *  with a date), Change repeat (records that can repeat), Export and
 *  Delete, each undoable where it changes anything. */
export function RecordSelectBar({ def, entity, profileId, sel, shown, lookups, repeat = true }: {
  def: ModuleDef; entity: EntityDef; profileId: string; sel: Selection<Rec>; shown: Rec[]; lookups: Lookups; repeat?: boolean
}) {
  const [panel, setPanel] = useState<Panel>(null)
  const picked = sel.picked
  const n = picked.length
  const noun = entity.label.toLowerCase()
  const nouns = plural(noun)
  const words = (k: number) => `${k} ${k === 1 ? noun : nouns}`
  const dated = !!firstDateField(entity.fields)
  const copyable = canCopy(entity)
  const isEvent = entity.table === 'calendar_event'
  const repeats = repeat && (!entity.table || isEvent)
  // The rows as a person reads them: names for links, totals worked out.
  const fields = entity.fields.filter((f) => !f.hidden).map((f) => ({ ...f, type: 'text' as const }))
  const exp = useExport(n ? {
    label: `${def.name} (${words(n)})`, fields,
    rows: picked.map((r) => {
      const calc = computeFormulas(entity.fields, r.values)
      return Object.fromEntries(entity.fields.filter((f) => !f.hidden).map((f) => [f.name, formatValue(f, f.type === 'formula' ? calc[f.name] : r.values[f.name], lookups)]))
    }),
  } : null)

  async function copy(day: string | null) {
    setPanel(null)
    const list = picked
    const { made, errors } = await copyRecords(profileId, def, entity, list, day)
    if (errors.length && !made.length) { sel.say(errors[0], true); return }
    sel.clear()
    const where = day ? ` to ${format(new Date(`${day}T12:00`), 'EEE d MMM')}` : ''
    sel.say(`${day ? 'Copied' : 'Duplicated'} ${words(made.length)}${where}.${errors.length ? ` ${errors.length} could not be.` : ''}`, errors.length > 0)
    offerUndo(`${words(made.length)} ${day ? 'copied' : 'duplicated'}`, () => deleteRecords(profileId, def, entity, made))
  }

  async function remove() {
    const gone = await deleteRecords(profileId, def, entity, picked)
    sel.clear()
    const kept = picked.length - gone.length
    sel.say(kept ? `${kept} from a calendar you follow ${kept === 1 ? 'was' : 'were'} left as ${kept === 1 ? 'it is' : 'they are'}.` : '', kept > 0)
    if (gone.length) offerUndo(`${words(gone.length)} deleted`, () => restoreRecords(profileId, def, entity, gone))
  }

  async function changeRepeat(value: RepeatValue) {
    setPanel(null)
    const list = picked.filter((r) => !r.row.subscription_id)
    const before: { rec: Rec; value: RepeatValue }[] = []
    for (const r of list) {
      if (isEvent) {
        before.push({ rec: r, value: r.row.rule ? { rule: r.row.rule as RepeatValue['rule'], rule_config: (r.row.rule_config ?? {}) as RepeatValue['rule_config'], end_date: (r.row.end_date as string | null) ?? null, count: (r.row.count as number | null) ?? null } : NO_REPEAT })
        await setEventRepeat(r.id, value)
      } else {
        const row = r.row as unknown as ModuleRecord
        before.push({ rec: r, value: (await recordRepeat(row)).value })
        await setRecordRepeat(profileId, def, entity, row, value)
      }
    }
    sel.clear()
    sel.say(`${value.rule ? 'Repeat set for' : 'Repeat taken off'} ${words(list.length)}.`)
    offerUndo(`Repeat changed for ${words(list.length)}`, async () => {
      const { db } = await import('../lib/db')
      for (const b of before) {
        if (isEvent) await setEventRepeat(b.rec.id, b.value)
        else {
          const row = await db.module_record.get(b.rec.id)
          if (row) await setRecordRepeat(profileId, def, entity, row, b.value)
        }
      }
    })
  }

  const today = planToday()
  return (
    <>
      <SelectBar {...sel.bar(shown, nouns)}>
        {copyable && <SelectAction count={n} onClick={() => void copy(null)}>Duplicate</SelectAction>}
        {copyable && dated && <SelectAction count={n} onClick={() => setPanel('day')}>Copy to day…</SelectAction>}
        {repeats && <SelectAction count={n} onClick={() => setPanel('repeat')}>Change repeat…</SelectAction>}
        <SelectAction count={n} onClick={() => exp.item?.onSelect()}>Export…</SelectAction>
        <SelectDelete count={n} onDelete={() => void remove()} />
      </SelectBar>
      {exp.sheet}
      {panel === 'day' && (
        <DayPickSheet title={`Copy ${words(n)} to`} onPick={(d) => { if (d) void copy(d) }} onClose={() => setPanel(null)} />
      )}
      {panel === 'repeat' && (
        <RepeatSheet title={`Repeat ${words(n)}`} start={today} today={today} kinds={isEvent ? [...EVENT_RULE_KINDS] : [...RECORD_REPEAT_KINDS]}
          onApply={(v) => void changeRepeat(v)} onClose={() => setPanel(null)} />
      )}
    </>
  )
}

/** One repeat for several records at once; each keeps its own first day. */
function RepeatSheet({ title, start, today, kinds, onApply, onClose }: {
  title: string; start: string; today: string; kinds: Parameters<typeof RepeatPicker>[0]['kinds']; onApply: (v: RepeatValue) => void; onClose: () => void
}) {
  const [value, setValue] = useState<RepeatValue>(NO_REPEAT)
  return (
    <PlainSheet title={title} onClose={onClose} actions={<button type="button" className="btn btn-primary" onClick={() => onApply(value)}>Apply</button>}>
      <div className="mf-repeat">
        <RepeatPicker value={value} onChange={setValue} start={start} today={today} kinds={kinds} noneLabel="Does not repeat" />
      </div>
    </PlainSheet>
  )
}

/** Copy one record to a day (from its sheet's ⋮): the record's sheet has
 *  closed first, so no sheet is on a sheet (CALM-10). */
export function CopyToDaySheet({ def, entity, profileId, rec, onClose }: { def: ModuleDef; entity: EntityDef; profileId: string; rec: Rec; onClose: () => void }) {
  return (
    <DayPickSheet title={`Copy ${entity.label.toLowerCase()} to`} onClose={onClose} onPick={(d) => {
      onClose()
      if (!d) return
      void copyRecords(profileId, def, entity, [rec], d).then(({ made }) => {
        if (made.length) offerUndo(`${entity.label} copied to ${format(new Date(`${d}T12:00`), 'EEE d MMM')}`, () => deleteRecords(profileId, def, entity, made))
      })
    }} />
  )
}
