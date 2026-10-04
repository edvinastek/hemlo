import { useMemo, useState, type FormEvent, type CSSProperties, type ReactNode } from 'react'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { edit, saveSettings } from '../lib/write'
import { readSettings } from '../lib/settings'
import {
  addBook, addToBook, bookBack, booksOf, chosen, combineIngredients, countOf, deleteBook, inBook, ingredientText, liveCount,
  namesText, pruneBooks, putBack, recipeIngredients, recolourBook, removeFromBook, renameBook, sharedNote, splitOwned, toggleAll,
  MAX_NAME, type Book, type BookKind, type BookResult,
} from '../lib/books-rules'
import { search as find } from '../lib/search-rules'
import { DataTable } from '../ui/DataTable'
import { BookBar, MINE } from '../ui/BookBar'
import { SelectBar } from '../ui/SelectBar'
import { useExport } from '../ui/ExportLink'
import type { MenuItem } from '../ui/MoreMenu'
import { FoodPageMenu } from './FoodMenu'
import { useLongPress } from '../ui/useLongPress'
import { useBackClose } from '../ui/useBackClose'
import { offerUndo } from '../ui/Undo'
import type { FieldDef } from '../modules/types'
import type { Food, RecipeLine } from '../lib/types'
import '../ui/books.css'

type Row = { id: string; name: string; owner_id: string | null }
type Status = { text: string; bad?: boolean } | null

/** The Recipes or Foods table with its books and select mode.
 *
 *  Books: a row of chips above the table ("All", "Mine", each book); picking
 *  one shows only its rows. Select: hold a row to start with it ticked (or
 *  Select in the page's ⋮), then a tick box on every row and a bar at the
 *  bottom to put the ticked rows in a book, take them out, copy them, export
 *  them or delete the ones that are the person's own. Shared catalogue rows
 *  are never deleted. The tab's page ⋮ is drawn here (v17): the tab's own
 *  items first, then New book, Edit book and Select. */
export function BookTable<T extends Row>({
  kind, rows, fields, priority, emptyNote, head, search = '', limit, lines = [], foods, onOpen, openLabel, extra, order, after, actions,
  menu = [], menuSheets,
}: {
  kind: BookKind
  /** Every row that still exists, in the table's order. */
  rows: T[]
  fields: FieldDef[]
  priority?: string[]
  emptyNote: string
  /** The line above the table: counts, a search box. */
  head: ReactNode
  /** Typed search, applied inside the chosen book. */
  search?: string
  /** At most this many rows are drawn while nothing is typed; "Show all"
   *  draws the rest. A search always finds the whole list (FOOD-14). */
  limit?: number
  /** Text a search also looks in besides the name: ingredients, the Dutch
   *  name, a brand. */
  extra?: (row: T) => string
  /** An order the person chose (kcal, most cooked); without one, the one
   *  search's own: best match first, else own first, then A to Z. */
  order?: (a: T, b: T) => number
  /** Shown under the table, before "Show all", knowing how many rows the
   *  search found (the Foods tab's "Find in stores"). */
  after?: (matched: number) => ReactNode
  /** The tab's own items for the page's ⋮ (sort, import, export…), and the
   *  sheets they open. */
  menu?: (MenuItem | null | false)[]
  menuSheets?: ReactNode
  /** More buttons for the select bar, for the rows ticked ("Add to shopping
   *  list"); `say` puts a line in the bar. */
  actions?: (picked: T[], say: (text: string, bad?: boolean) => void) => ReactNode
  /** For "Copy ingredients" on recipes. */
  lines?: RecipeLine[]
  foods?: Map<string, Food>
  /** An Open button on each row, for the row's own page (a food's units). */
  onOpen?: (row: T) => void
  openLabel?: (row: T) => string
}) {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const books = booksOf(readSettings(profile).books, kind)
  const [active, setActive] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [status, setStatus] = useState<Status>(null)
  const [sheet, setSheet] = useState<'add' | 'delete' | null>(null)
  const [bookSheet, setBookSheet] = useState<'new' | 'edit' | null>(null)
  const plural = kind === 'recipe' ? 'recipes' : 'foods'

  const ids = useMemo(() => new Set(rows.map((r) => r.id)), [rows])
  const book = books.find((b) => b.id === active) ?? null
  const mineCount = useMemo(() => (userId ? rows.filter((r) => r.owner_id === userId).length : 0), [rows, userId])
  const onlyMine = active === MINE
  const counts = new Map(books.map((b) => [b.id, liveCount(b, ids)]))

  const [showAll, setShowAll] = useState(false)
  // The one search (GEN-10 to GEN-12): every word, in any order, accents
  // ignored, in the name or the extra text; names starting with the first
  // word first, the person's own first, then plainer names.
  const matched = useMemo(() => {
    const inside = onlyMine ? rows.filter((r) => !!userId && r.owner_id === userId) : inBook(rows, book)
    const items = inside.map((r) => ({ row: r, name: String(r.name ?? ''), extra: extra?.(r), mine: !!userId && r.owner_id === userId }))
    const hits = find(items, search).map((x) => x.row)
    return order ? [...hits].sort(order) : hits
  }, [rows, book, onlyMine, search, extra, order, userId])
  const capped = !!limit && !showAll && !search.trim() && matched.length > limit
  const shown = capped ? matched.slice(0, limit) : matched
  const picked = useMemo(() => chosen(rows, selected), [rows, selected])

  /** Change the books, always from what is stored now (not what this screen
   *  last drew), and drop rows of this kind that have gone. */
  async function updateBooks(change: (current: Book[]) => BookResult): Promise<string | null> {
    if (!profile) return 'Sign in to keep books.'
    const fresh = (await db.profile.get(profile.id)) ?? profile
    const result = change(readSettings(fresh).books)
    if (result.error !== undefined) return result.error
    const live = { recipe: new Set<string>(), food: new Set<string>(), [kind]: ids } as Record<BookKind, Set<string>>
    await saveSettings(fresh, { books: pruneBooks(result.books, live) })
    return null
  }

  function leave() {
    setSelecting(false)
    setSelected(new Set())
    setStatus(null)
    setSheet(null)
  }

  // Back and Escape leave select mode; a sheet opened from the bar closes first.
  useBackClose(leave, selecting)

  // Holding a row starts select mode with that row ticked.
  const hold = useLongPress<string>({
    delay: 450,
    onStart: (id) => {
      if (selecting) return false
      setSelecting(true)
      setSelected(new Set([id]))
      setStatus(null)
    },
  })

  function tick(row: T, on: boolean) {
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(row.id)
      else next.delete(row.id)
      return next
    })
  }

  async function copy(text: string, what: string) {
    if (!text) { setStatus({ text: `There is nothing to copy.`, bad: true }); return }
    const ok = await copyText(text)
    setStatus(ok ? { text: `Copied ${what}.` } : { text: 'The clipboard could not be reached here.', bad: true })
  }

  function copyIngredients() {
    // Recipes in name order, as the table lists them, so the same choice
    // always gives the same list.
    const byName = [...picked].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
    const list = combineIngredients(byName.map((r) => recipeIngredients(r as never, lines, foods ?? new Map())))
    if (list.length === 0) { setStatus({ text: 'These recipes have no ingredients listed.', bad: true }); return }
    void copy(ingredientText(list), `${list.length} ${list.length === 1 ? 'ingredient' : 'ingredients'} from ${countOf(picked.length, kind)}`)
  }

  async function removeHere() {
    if (!book) return
    let removed = 0
    let before: Book[] = []
    const ids = picked.map((p) => p.id)
    const error = await updateBooks((current) => {
      before = current
      const r = removeFromBook(current, book.id, ids)
      removed = r.removed
      return { books: r.books }
    })
    if (error) { setStatus({ text: error, bad: true }); return }
    setSelected(new Set())
    setStatus(null)
    // Undo (GEN-54): the rows go back where they were in the book.
    if (removed) offerUndo(`Took ${countOf(removed, kind)} out of ${book.name}`, async () => { await updateBooks((current) => ({ books: putBack(current, before, ids) })) })
  }

  async function remove(mine: T[], shared: number) {
    const now = new Date().toISOString()
    const table = kind === 'recipe' ? db.recipe : db.food
    // The books as they are, so Undo can put the rows back in them.
    const fresh = profile ? (await db.profile.get(profile.id)) ?? profile : null
    const before = fresh ? readSettings(fresh).books : []
    const gone: string[] = []
    for (const r of mine) {
      // The stored row, not the table's (which carries worked-out figures).
      const row = await table.get(r.id)
      if (!row) continue
      await edit(kind, row as never, { deleted_at: now } as never)
      gone.push(r.id)
    }
    setSelected((s) => new Set([...s].filter((id) => !mine.some((m) => m.id === id))))
    setSheet(null)
    const note = sharedNote(shared)
    setStatus(note ? { text: `${note}, so ${shared === 1 ? 'it was' : 'they were'} left out.` } : null)
    // Undo (GEN-54): the rows come back, and into the books they were in.
    if (gone.length) {
      offerUndo(`Deleted ${countOf(gone.length, kind)}`, async () => {
        for (const id of gone) {
          const row = await table.get(id)
          if (row && (row as { deleted_at?: string | null }).deleted_at) await edit(kind, row as never, { deleted_at: null } as never)
        }
        await updateBooks((current) => ({ books: putBack(current, before, gone) }))
      })
    }
  }

  const exportSource = useMemo(() => ({
    rows: picked as unknown as Record<string, unknown>[], fields,
    label: `${book ? book.name : kind === 'recipe' ? 'Recipes' : 'Foods'} (selected)`,
  }), [picked, fields, book, kind])

  const exportPicked = useExport(exportSource)
  const allShown = shown.length > 0 && shown.every((r) => selected.has(r.id))
  const none = picked.length === 0

  return (
    <>
      <BookBar kind={kind} books={books} counts={counts} active={onlyMine ? MINE : book?.id ?? null} onPick={setActive}
        mine={mineCount} total={rows.length} sheet={bookSheet} onSheet={setBookSheet}
        onCreate={async (name, colour) => {
          const id = crypto.randomUUID()
          const error = await updateBooks((current) => addBook(current, id, name, kind, colour ?? undefined))
          if (!error) setActive(id)
          return error
        }}
        onRename={(id, name) => updateBooks((current) => renameBook(current, id, name))}
        onRecolour={(id, colour) => void updateBooks((current) => ({ books: recolourBook(current, id, colour) }))}
        onDelete={async (id) => {
          let gone: Book | undefined
          let at = 0
          await updateBooks((current) => {
            at = current.findIndex((b) => b.id === id)
            gone = current[at]
            return { books: deleteBook(current, id) }
          })
          setActive(null)
          // Undo (GEN-54): the book comes back in its place, with its rows.
          const back = gone
          if (back) offerUndo(`Deleted the book ${back.name}`, async () => { await updateBooks((current) => ({ books: bookBack(current, back, at) })) })
        }} />
      <FoodPageMenu items={[
        ...menu,
        { label: 'New book…', onSelect: () => setBookSheet('new') },
        book && { label: `Edit book “${book.name}”…`, onSelect: () => setBookSheet('edit') },
        !selecting && { label: 'Select', disabled: rows.length === 0, onSelect: () => { setSelecting(true); setStatus(null) } },
      ]} sheets={menuSheets} />

      <div className="totals">{head}</div>

      <div className="bk-table">
      <DataTable
        fields={fields}
        priority={priority}
        rows={shown as never}
        emptyNote={book && !search.trim()
          ? `Nothing in ${book.name} yet. Hold one of the ${plural} under All to add it.`
          : emptyNote}
        selected={selecting ? selected : undefined}
        onSelect={selecting ? (row) => tick(row as T, !selected.has((row as T).id)) : undefined}
        selectLabel={(row) => `Select ${(row as T).name}`}
        rowProps={selecting ? undefined : (row) => hold.bind((row as T).id)}
        onOpen={selecting || !onOpen ? undefined : (row) => onOpen(row as T)}
        openLabel={openLabel ? (row) => openLabel(row as T) : undefined}
      />
      </div>
      {after?.(matched.length)}
      {capped && (
        <div className="bk-more">
          <span className="row-meta">Showing {shown.length} of {matched.length}. Type to search them all.</span>
          <button type="button" className="btn" onClick={() => setShowAll(true)}>Show all {matched.length}</button>
        </div>
      )}

      {selecting && (
        <SelectBar count={picked.length} noun={plural} allShown={allShown} anyShown={shown.length > 0}
          onAll={() => setSelected((s) => toggleAll(s, shown))} onDone={leave} status={status}>
          <button type="button" className="btn" disabled={none} onClick={() => setSheet('add')}>Add to book…</button>
          {book && <button type="button" className="btn" disabled={none} onClick={() => void removeHere()}>Remove from this book</button>}
          {kind === 'recipe'
            ? <button type="button" className="btn" disabled={none} onClick={copyIngredients}>Copy ingredients</button>
            : <button type="button" className="btn" disabled={none} onClick={() => void copy(namesText(picked), countOf(picked.length, 'food'))}>Copy names</button>}
          {actions?.(picked, (text, bad) => setStatus({ text, bad }))}
          {!none && exportPicked.item && <button type="button" className="btn" onClick={exportPicked.item.onSelect}>Export…</button>}
          <button type="button" className="btn sb-delete" disabled={none} onClick={() => setSheet('delete')}>Delete…</button>
        </SelectBar>
      )}

      {sheet === 'add' && (
        <AddToBookSheet kind={kind} books={books} counts={counts} count={picked.length} onClose={() => setSheet(null)}
          onPick={async (target, name) => {
            let result = { added: 0, already: 0, full: 0 }
            let bookName = ''
            const error = await updateBooks((current) => {
              let list = current
              let id = target
              if (!id) {
                id = crypto.randomUUID()
                const made = addBook(list, id, name ?? '', kind)
                if (made.error !== undefined) return made
                list = made.books
              }
              bookName = list.find((b) => b.id === id)?.name ?? ''
              const r = addToBook(list, id, picked.map((p) => p.id))
              result = r
              return { books: r.books }
            })
            if (error) return error
            setSheet(null)
            const parts = [`Added ${countOf(result.added, kind)} to ${bookName}.`]
            if (result.already) parts.push(`${result.already} ${result.already === 1 ? 'was' : 'were'} there already.`)
            if (result.full) parts.push(`${result.full} did not fit: a book holds at most 500.`)
            setStatus({ text: parts.join(' ') })
            return null
          }} />
      )}

      {exportPicked.sheet}

      {sheet === 'delete' && (
        <DeleteSheet kind={kind} rows={picked} userId={userId} onClose={() => setSheet(null)} onDelete={remove} />
      )}
    </>
  )
}

/** Put the ticked rows in a book: one of this tab's books, or a new one. */
function AddToBookSheet({ kind, books, counts, count, onClose, onPick }: {
  kind: BookKind
  books: Book[]
  counts: Map<string, number>
  count: number
  onClose: () => void
  /** A book's id, or null with a name for a new book. Resolves to a problem, if any. */
  onPick: (id: string | null, name?: string) => Promise<string | null>
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useBackClose(onClose)

  async function go(id: string | null, newName?: string) {
    if (busy) return
    setBusy(true)
    const problem = await onPick(id, newName)
    setBusy(false)
    setError(problem)
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    void go(null, name)
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet bk-sheet" role="dialog" aria-modal="true" aria-label="Add to book">
        <h2>Add {countOf(count, kind)} to a book</h2>
        {books.length > 0 && (
          <ul className="bk-options">
            {books.map((b) => (
              <li key={b.id}>
                <button type="button" className="bk-option" disabled={busy} onClick={() => void go(b.id)}
                  style={b.colour ? ({ '--bk': b.colour } as CSSProperties) : undefined}>
                  <i className={`bk-dot${b.colour ? '' : ' is-plain'}`} aria-hidden="true" />
                  <span className="bk-name">{b.name}</span>
                  <span className="row-meta">{counts.get(b.id) ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="bk-newrow" onSubmit={submit}>
          <input value={name} maxLength={MAX_NAME} aria-label="New book name" autoFocus={books.length === 0}
            placeholder={books.length ? 'Or a new book' : 'Name the new book'} onChange={(e) => { setName(e.target.value); setError(null) }} />
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>Make and add</button>
        </form>
        {error && <p className="bk-note is-bad" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  )
}

/** Asks before deleting. Only the person's own rows can go; shared catalogue
 *  rows are left out, and the sheet says how many. */
function DeleteSheet<T extends Row>({ kind, rows, userId, onClose, onDelete }: {
  kind: BookKind
  rows: T[]
  userId: string | null
  onClose: () => void
  onDelete: (mine: T[], shared: number) => Promise<void>
}) {
  const { mine, shared } = splitOwned(rows, userId)
  const [busy, setBusy] = useState(false)
  useBackClose(onClose)
  const note = sharedNote(shared.length)
  const list = mine.slice(0, 6)

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet bk-sheet" role="alertdialog" aria-modal="true" aria-label="Delete">
        <h2>{mine.length ? `Delete ${countOf(mine.length, kind)}?` : 'Nothing here can be deleted'}</h2>
        {mine.length > 0 && (
          <>
            <ul className="bk-names">
              {list.map((r) => <li key={r.id}>{r.name}</li>)}
              {mine.length > list.length && <li className="row-meta">and {mine.length - list.length} more</li>}
            </ul>
            <p className="bk-note">
              {kind === 'recipe'
                ? 'They go from your recipes and every book. Meals already planned with them stay as they are.'
                : 'They go from your foods and every book. Recipes that use them keep their figures.'}
            </p>
          </>
        )}
        {note && <p className="bk-note">{note}{mine.length ? `, so ${shared.length === 1 ? 'it is' : 'they are'} left out.` : ': shared rows belong to everyone.'}</p>}
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>{mine.length ? 'Cancel' : 'Close'}</button>
          {mine.length > 0 && (
            <button type="button" className="btn bk-danger grow" disabled={busy}
              onClick={() => { setBusy(true); void onDelete(mine, shared.length) }}>
              Delete {countOf(mine.length, kind)}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

/** Plain text to the clipboard. Falls back to the old copy command where the
 *  clipboard is not offered (an older phone's web view). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* try the old way */ }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}
