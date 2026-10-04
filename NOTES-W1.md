# NOTES-W1 — version 18, planner core

Running log of W1's work (branch v18/w1). Shared pieces for W2, W3 and W4 first.

## For W3 and W4: selecting several rows — `src/ui/useSelection.ts`

```tsx
import { useSelection } from '../ui/useSelection'
import { SelectBar, SelectAction, SelectDelete } from '../ui/SelectBar'

const sel = useSelection(rows)          // rows: every row that can be ticked ({ id: string }[])
// options: { hold?: boolean (default true), delay?: ms (default 450), onChange?: (selecting) => void }

// A row (any element): holding it starts select mode with it ticked (GEN-52).
<li {...sel.hold(row.id)} onClick={() => (sel.selecting ? sel.toggle(row.id) : open(row))}>
  {sel.selecting && <input type="checkbox" checked={sel.has(row.id)} onChange={() => sel.toggle(row.id)} aria-label={`Select ${row.name}`} />}
</li>
// DataTable: selected={sel.selecting ? new Set(sel.picked.map(r => r.id)) : undefined}
//            onSelect={sel.selecting ? (row, on) => sel.toggle(row.id, on) : undefined}
//            rowProps={sel.selecting ? undefined : (row) => sel.hold(row.id)}

// The page's ⋮ (CALM-16): "Select" / "Stop selecting"
<PageMenu items={[..., sel.menuItem()]} />          // sel.menuItem('Select records') for another label

// The bar, when selecting (shown = the rows on screen now, e.g. after a search)
{sel.selecting && (
  <SelectBar {...sel.bar(shown, 'records')}>
    <SelectAction count={sel.picked.length} onClick={...}>Copy to day…</SelectAction>
    <SelectDelete count={sel.picked.length} onDelete={async () => { offerUndo(..., await remove(sel.picked)); sel.clear() }} />
  </SelectBar>
)}
```

- `sel.picked` — the ticked rows in the order of `rows`; rows that have gone are dropped by themselves.
- `sel.start(id?)`, `sel.stop()`, `sel.toggle(id, on?)`, `sel.clear()` (untick all, stay selecting), `sel.has(id)`.
- `sel.say(text, bad?)` puts a line in the bar (screen readers hear it); `sel.status`.
- Back and Escape leave select mode (it uses `useBackClose`), and a sheet opened from the bar closes first.
- The SelectBar hides the round + while it is up (`html.is-selecting .fab`).
- Pure rules: `src/lib/selection-rules.ts` (toggleOne, toggleShown, pickedRows, pruneGone, countWords, deleteNeedsAsk), checked by `src/test/selection.check.mjs`.
- `SelectDelete` is always last; one row goes at once, several ask "Delete 4? Tap again". Pass `label` for "Remove".
- Bulk "Export": `const exp = useExport({ rows: sel.picked, fields, label: 'Stock (selected)' })` then
  `<SelectAction count={n} onClick={() => exp.item?.onSelect()}>Export…</SelectAction>` and render `exp.sheet`.

## For W2: meals through the shared CopySheet (GEN-55)

```tsx
import { CopySheet } from '../ui/CopySheet'
// A whole day's food ("Copy day to…" in Food's ⋮):
{copying && <CopySheet what={{ kind: 'meals', day, groups: 'all' }} onClose={() => setCopying(false)} />}
// One meal (MealCard's "Copy to…"): groups = Food's meal keys, label = the meal's name
{panel === 'copy' && <CopySheet what={{ kind: 'meals', day, groups: [g.key], label: title }} onClose={() => setPanel(null)} />}
```

- It calls `meals.ts:copyMeals(day, targets, groups, profileId)` (unchanged), offers Undo itself
  ("Lunch copied to 2 days" / "Copied 3 meals to Tue 6 Oct"; `copy-rules.ts:mealCopySummary`), and
  closes on Back/Escape. Optional `onDone(days)`.
- The sheet shows only the days (shortcuts Tomorrow / Every weekday this week / Same day next week and the
  scrolling calendar); no Options (time, notes, keep do not apply to meals). The source day is disabled,
  as are past days (a copy plans ahead; copying yesterday's food onto today works).
- With no food in the chosen meals it says "There is no food to copy here." and Copy stays off.
- You can then delete FoodDay's `CopyDays` panel (and its native date input). Never open it from inside
  another sheet: close the meal panel first, then open the CopySheet (CALM-10).

## Log
- useSelection + selection-rules + SelectBar (SelectAction, SelectDelete) built and checked.
- CopySheet `meals` case (copy.ts runCopy → copyMeals; copy-rules mealCopySummary) built and checked.
- GEN-22: "after completion" and "flexible" in RepeatPicker (`loose` prop) for tasks (TaskSheet), habits (Habits.tsx, one prop)
  and module records (RecordSheet.tsx, one prop). Stored as rule 'daily' + rule_config {n, mode:'after'|'flexible'} so every
  table's rule CHECK accepts it (no migration). Engine = schedule-rules choreState via looseState(). Series lay out only
  their first day; tasks.ts setTaskDone → series.followDone makes the next one n days after the tick (shared occurrence id),
  unticking takes it back. Flexible tasks wait on today (day-items), never in carry-over (ReviewCard one line) or the
  evening review (review.ts one line). notify.ts reminder tick now goes through setTaskDone.
