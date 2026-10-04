import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  allTicked, pickedRows, pruneGone, toggleOne, toggleShown, type Row,
} from '../lib/selection-rules'
import type { MenuItem } from './MoreMenu'
import { useBackClose } from './useBackClose'
import { useLongPress } from './useLongPress'

/** What the select bar says after an action ("Copied 3 tasks."). */
export type SelectStatus = { text: string; bad?: boolean } | null

/** The props <SelectBar> takes, ready to spread: `<SelectBar {...sel.bar(shown, 'tasks')}>`. */
export interface SelectBarProps {
  count: number
  noun: string
  allShown: boolean
  anyShown: boolean
  onAll: () => void
  onDone: () => void
  status: SelectStatus
}

export interface Selection<T extends Row> {
  /** Select mode is on: rows show a tick box and the select bar is up. */
  selecting: boolean
  /** The ticked rows, in the order of `rows`, rows that have gone left out. */
  picked: T[]
  has: (id: string) => boolean
  /** Starts select mode, with one row ticked if given. */
  start: (id?: string) => void
  /** Leaves select mode; nothing stays ticked. */
  stop: () => void
  toggle: (id: string, on?: boolean) => void
  /** Unticks everything but stays in select mode (after an action). */
  clear: () => void
  /** Spread on a row: holding it starts select mode with it ticked
   *  (GEN-52). Nothing while already selecting, or when `hold` is off. */
  hold: (id: string) => { onPointerDown?: React.PointerEventHandler<HTMLElement>; onContextMenu?: (e: { preventDefault: () => void }) => void }
  /** "Select" / "Stop selecting" for the page's ⋮ (CALM-16). */
  menuItem: (label?: string) => MenuItem
  /** The select bar's props for the rows on screen now. */
  bar: (shown: readonly T[], noun: string) => SelectBarProps
  /** Puts a line in the bar (read out to screen readers). */
  say: (text: string, bad?: boolean) => void
  status: SelectStatus
}

/** THE way to pick several rows (GEN-52, GEN-53, CALM-16), for any list:
 *  tasks on Plan and Today, the Inbox, module records, Finance, Stock.
 *
 *  - Hold a row (about half a second) and select mode starts with that row
 *    ticked; or "Select" in the page's ⋮ (`menuItem()`).
 *  - A tap on a row then ticks it; the bar at the bottom says how many, has
 *    "Select all shown", Done, and the list's own actions.
 *  - Back and Escape leave select mode, like a sheet (CALM-10); a sheet
 *    opened from the bar closes first.
 *
 *  `rows` is every row that can be ticked (not only the ones a search shows),
 *  so ticks survive a search and rows that go away are dropped.
 *
 *  Lists where holding already means something else (Today's rail: hold to
 *  drag and open in place) pass `{ hold: false }` and start from the ⋮. */
export function useSelection<T extends Row>(rows: readonly T[], options: {
  /** Hold to start selecting. Default on. */
  hold?: boolean
  /** The hold, in ms. */
  delay?: number
  /** Told when select mode starts or ends (to hide a page's own controls). */
  onChange?: (selecting: boolean) => void
} = {}): Selection<T> {
  const { hold: canHold = true, delay = 450, onChange } = options
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [status, setStatus] = useState<SelectStatus>(null)

  // A row deleted (here or on another phone) is no longer ticked.
  useEffect(() => {
    setSelected((s) => pruneGone(s, rows))
  }, [rows])

  const start = useCallback((id?: string) => {
    setSelecting(true)
    setSelected(id ? new Set([id]) : new Set())
    setStatus(null)
    onChange?.(true)
  }, [onChange])

  const stop = useCallback(() => {
    setSelecting(false)
    setSelected(new Set())
    setStatus(null)
    onChange?.(false)
  }, [onChange])

  // Back and Escape leave select mode (only the top sheet closes first).
  useBackClose(stop, selecting)

  const press = useLongPress<string>({
    delay,
    onStart: (id) => {
      if (selecting) return false
      start(id)
    },
  })

  const picked = useMemo(() => pickedRows(rows, selected), [rows, selected])

  return {
    selecting,
    picked,
    has: (id) => selected.has(id),
    start,
    stop,
    toggle: (id, on) => setSelected((s) => toggleOne(s, id, on)),
    clear: () => setSelected(new Set()),
    hold: (id) => (canHold && !selecting ? press.bind(id) : {}),
    menuItem: (label = 'Select') => (selecting
      ? { label: 'Stop selecting', onSelect: stop }
      : { label, disabled: rows.length === 0, onSelect: () => start() }),
    bar: (shown, noun) => ({
      count: picked.length,
      noun,
      allShown: allTicked(selected, shown),
      anyShown: shown.length > 0,
      onAll: () => setSelected((s) => toggleShown(s, shown)),
      onDone: stop,
      status,
    }),
    say: (text, bad) => setStatus({ text, bad }),
    status,
  }
}
