import { useEffect, useState } from 'react'
import { useApp } from '../lib/store'
import { saveFile } from '../lib/native'
import { FORMATS, type Format, type Range } from '../lib/transfer-rules'
import type { FieldDef } from '../modules/types'
import './transfer.css'

/** What a page's Export link saves:
 *  - a dataset from the catalogue (a module's records, the calendar), cut
 *    to the day, week or month the page shows; `more` names other datasets
 *    of the same page (the household's done history beside its chores),
 *    offered as a choice at the top of the sheet;
 *  - rows the page has already worked out (the shopping trip);
 *  - a piece of text (a task's note). */
export type ExportSource =
  | { dataset: string; range?: Range | null; label?: string; more?: string[] }
  | { rows: Record<string, unknown>[]; fields: FieldDef[]; label: string }
  | { text: string; label: string }

const HINT: Record<Format, string> = {
  csv: 'opens in Excel and Google Sheets',
  xlsx: 'a workbook with one sheet',
  json: 'for other apps and scripts',
  ics: 'Google Calendar, Outlook, Apple Calendar',
  txt: 'plain text with headings',
}

/** "Export", small, bold and underlined, at the bottom right of a data page.
 *  It opens a sheet with the formats that make sense for what the page
 *  shows; `calendar` adds the calendar file for pages laid out by date. */
export function ExportLink({ source, calendar = false }: { source: ExportSource; calendar?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="xl-row">
        <button type="button" className="xl-link" onClick={() => setOpen(true)}>Export</button>
      </div>
      {open && <ExportSheet source={source} calendar={calendar} onClose={() => setOpen(false)} />}
    </>
  )
}

function ExportSheet({ source, calendar, onClose }: { source: ExportSource; calendar: boolean; onClose: () => void }) {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const [formats, setFormats] = useState<Format[] | null>(null)
  const [title, setTitle] = useState(source.label ?? '')
  const [busy, setBusy] = useState<Format | null>(null)
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null)
  // Which of the page's datasets is being saved, and the choice of them.
  const [key, setKey] = useState('dataset' in source ? source.dataset : '')
  const [choices, setChoices] = useState<{ key: string; label: string }[]>([])

  useEffect(() => {
    let gone = false
    void (async () => {
      if ('text' in source) { setFormats(['txt']); return }
      if ('rows' in source) { setFormats(['csv', 'xlsx', 'json']); return }
      if (!profile) return
      const { findDataset, listDatasets } = await import('../lib/transfer')
      const d = await findDataset(profile.id, key)
      if (source.more?.length) {
        const all = await listDatasets(profile.id)
        const keys = [source.dataset, ...source.more]
        if (!gone) setChoices(keys.map((k) => all.find((x) => x.key === k)).filter((x) => !!x).map((x) => ({ key: x!.key, label: x!.label })))
      }
      if (gone) return
      if (!d) { setFormats([]); return }
      setTitle(key === source.dataset ? source.label ?? d.label : d.label)
      // Calendar-like pages offer the calendar file first; table pages leave it out.
      const list = d.formats.filter((f) => f !== 'txt' && (calendar || f !== 'ics'))
      setFormats(calendar ? [...list.filter((f) => f === 'ics'), ...list.filter((f) => f !== 'ics')] : list)
    })()
    return () => { gone = true }
  }, [source, calendar, profile, key])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run(format: Format) {
    if (busy) return
    setBusy(format)
    setStatus(null)
    try {
      const t = await import('../lib/transfer')
      let result
      if ('text' in source) result = t.exportText(source.label, source.text)
      else if ('rows' in source) result = await t.exportRows(source.label, source.fields, source.rows, format)
      else {
        if (!profile) throw new Error('No profile is open.')
        const d = await t.findDataset(profile.id, key)
        if (!d) throw new Error('There is nothing to export here.')
        result = await t.exportDataset(profile, userId, { dataset: d, format, range: source.range ?? null })
      }
      const how = await saveFile(result.name, result.blob)
      if (how === 'cancelled') setStatus({ text: 'Not saved.' })
      else setStatus({ text: `${how === 'shared' ? 'Shared' : 'Saved'} ${result.name} · ${result.count} ${result.count === 1 ? 'row' : 'rows'}.` })
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : 'That could not be exported.', bad: true })
    } finally {
      setBusy(null)
    }
  }

  const range = 'dataset' in source ? source.range : null
  return (
    <>
      <div className="sheet-scrim xl-scrim" onClick={onClose} />
      <div className="bottom-sheet xl-sheet" role="dialog" aria-modal="true" aria-label="Export">
        <h2>Export</h2>
        {choices.length > 1 && (
          <div className="xl-which" role="group" aria-label="What to export">
            {choices.map((c) => (
              <button key={c.key} type="button" aria-pressed={c.key === key} disabled={!!busy}
                onClick={() => { setKey(c.key); setStatus(null) }}>{c.label.replace(/^[^·]+· /, '')}</button>
            ))}
          </div>
        )}
        <p className="xl-what">{title || 'This page'}{range ? ` · ${range.label}` : ''}</p>
        {formats === null ? null : formats.length === 0 ? (
          <p className="xl-what">There is nothing on this page to export.</p>
        ) : (
          <div className="xl-formats">
            {formats.map((f) => (
              <button key={f} type="button" className="xl-format" disabled={!!busy} onClick={() => void run(f)}>
                <span>{FORMATS[f].label}<br /><small>{HINT[f]}</small></span>
                <small>{busy === f ? 'Saving…' : `.${FORMATS[f].ext}`}</small>
              </button>
            ))}
          </div>
        )}
        {status && <p className={`xl-status${status.bad ? ' is-bad' : ''}`} role="status">{status.text}</p>}
        <div className="sheet-actions">
          <button type="button" className="btn grow" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  )
}
