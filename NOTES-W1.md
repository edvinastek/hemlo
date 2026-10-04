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

## For W2: meals through the shared CopySheet

(see below once committed)

## Log
- useSelection + selection-rules + SelectBar (SelectAction, SelectDelete) built and checked.
