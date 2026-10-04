import { useState, type CSSProperties, type FormEvent } from 'react'
import { SWATCHES } from '../lib/colours-rules'
import { MAX_BOOKS, MAX_NAME, type Book, type BookKind } from '../lib/books-rules'
import { useBackClose } from './useBackClose'
import './books.css'

/** "Mine" in the row of books: the person's own recipes or foods, the list
 *  that sat above the Recipes table until v16. Not a stored book. */
export const MINE = '\u0000mine'

/** The row of books above the Recipes or Foods table: "All", "Mine" (when
 *  the list holds both one's own and shared ones) and each book. Picking one
 *  shows only its rows. Making a book and changing the one shown are in the
 *  page's ⋮ (v17), which opens the sheets drawn here; with no book and
 *  nothing to tell apart, the row is not drawn at all. */
export function BookBar({ kind, books, counts, active, onPick, mine = 0, total = 0, sheet, onSheet, onCreate, onRename, onRecolour, onDelete }: {
  kind: BookKind
  books: Book[]
  /** How many rows each book holds that still exist, by book id. */
  counts: Map<string, number>
  /** A book's id, MINE, or null for all. */
  active: string | null
  onPick: (id: string | null) => void
  /** How many of the rows are the person's own, and how many there are. */
  mine?: number
  total?: number
  /** The sheet open: a new book, or the one shown being changed. */
  sheet: 'new' | 'edit' | null
  onSheet: (s: 'new' | 'edit' | null) => void
  onCreate: (name: string, colour: string | null) => Promise<string | null>
  onRename: (id: string, name: string) => Promise<string | null>
  onRecolour: (id: string, colour: string | null) => void
  onDelete: (id: string) => void
}) {
  const current = books.find((b) => b.id === active) ?? null
  const noun = kind === 'recipe' ? 'Recipe' : 'Food'
  const showMine = mine > 0 && mine < total
  const setSheet = onSheet

  return (
    <>
      {(books.length > 0 || showMine) && (
        <div className="bk-row">
          <div className="bk-bar" role="group" aria-label={`${noun} books`}>
            <button type="button" className="bk-chip" aria-pressed={active === null} onClick={() => onPick(null)}>All</button>
            {(showMine || active === MINE) && (
              <button type="button" className="bk-chip" aria-pressed={active === MINE} onClick={() => onPick(MINE)}>
                <span className="bk-name">Mine</span>
                <span className="bk-count">{mine}</span>
              </button>
            )}
            {books.map((b) => (
              <button key={b.id} type="button" className="bk-chip" aria-pressed={b.id === active} onClick={() => onPick(b.id)}
                style={b.colour ? ({ '--bk': b.colour } as CSSProperties) : undefined}>
                {b.colour && <i className="bk-dot" aria-hidden="true" />}
                <span className="bk-name">{b.name}</span>
                <span className="bk-count">{counts.get(b.id) ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {sheet === 'new' && (
        <BookSheet kind={kind} book={null} full={books.length >= MAX_BOOKS} onClose={() => setSheet(null)}
          onSave={async (name, colour) => {
            const error = await onCreate(name, colour)
            if (!error) setSheet(null)
            return error
          }} />
      )}
      {sheet === 'edit' && current && (
        <BookSheet kind={kind} book={current} full={false} onClose={() => setSheet(null)}
          onSave={async (name, colour) => {
            const error = name !== current.name ? await onRename(current.id, name) : null
            if (error) return error
            if ((colour ?? null) !== (current.colour ?? null)) onRecolour(current.id, colour)
            setSheet(null)
            return null
          }}
          onDelete={() => { onDelete(current.id); setSheet(null) }} />
      )}
    </>
  )
}

/** Making a book, or changing one: a name, a colour, and (for one that
 *  exists) Delete, which asks once more before it goes. */
function BookSheet({ kind, book, full, onClose, onSave, onDelete }: {
  kind: BookKind
  book: Book | null
  full: boolean
  onClose: () => void
  onSave: (name: string, colour: string | null) => Promise<string | null>
  onDelete?: () => void
}) {
  const [name, setName] = useState(book?.name ?? '')
  const [colour, setColour] = useState<string | null>(book?.colour ?? null)
  const [error, setError] = useState<string | null>(null)
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const rows = kind === 'recipe' ? 'recipes' : 'foods'

  // Back and Escape close it (CALM-10).
  useBackClose(onClose)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const problem = await onSave(name, colour)
    setBusy(false)
    setError(problem)
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <form className="bottom-sheet bk-sheet" role="dialog" aria-modal="true" aria-label={book ? 'Edit book' : 'New book'} onSubmit={submit}>
        <h2>{book ? 'Edit book' : 'New book'}</h2>
        {full ? (
          <p className="bk-note">There are already {MAX_BOOKS} books. Delete one to make room.</p>
        ) : (
          <div className="form-grid">
            <label>
              Name
              <input value={name} maxLength={MAX_NAME} autoFocus={!book} placeholder={kind === 'recipe' ? 'Quick lunches' : 'Snacks'}
                onChange={(e) => { setName(e.target.value); setError(null) }} />
            </label>
            <div className="bk-colours">
              <span id="bk-colour-label">Colour</span>
              <div className="bk-grid" role="group" aria-labelledby="bk-colour-label">
                <button type="button" className="bk-pick bk-plain" aria-label="No colour" title="No colour"
                  aria-pressed={colour === null} onClick={() => setColour(null)} />
                {SWATCHES.map((s) => (
                  <button key={s.hex} type="button" className="bk-pick" aria-label={s.name} title={s.name}
                    aria-pressed={s.hex === colour} style={{ '--mod': s.hex } as CSSProperties} onClick={() => setColour(s.hex)} />
                ))}
              </div>
            </div>
          </div>
        )}
        {error && <p className="bk-note is-bad" role="alert">{error}</p>}
        {book && onDelete && (
          sure ? (
            <div className="bk-confirm">
              <p className="bk-note">Delete “{book.name}”? Its {rows} stay where they are; only the book goes.</p>
              <div className="sheet-actions">
                <button type="button" className="btn" onClick={() => setSure(false)}>Keep it</button>
                <button type="button" className="btn bk-danger grow" onClick={onDelete}>Delete book</button>
              </div>
            </div>
          ) : (
            <button type="button" className="slot-link bk-delete" onClick={() => setSure(true)}>Delete this book…</button>
          )
        )}
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          {!full && <button type="submit" className="btn btn-primary grow" disabled={busy || !name.trim()}>{book ? 'Save' : 'Make book'}</button>}
        </div>
      </form>
    </>
  )
}
