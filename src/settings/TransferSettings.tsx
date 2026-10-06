import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format as formatDate } from 'date-fns'
import { useApp } from '../lib/store'
import { saveFile } from '../lib/native'
import { Dropdown } from '../ui/Dropdown'
import { FORMATS, rangeFor, type Dataset, type Format, type RangeKind } from '../lib/transfer-rules'
import type { ImportPreview, ImportDone } from '../lib/transfer'
import '../ui/transfer.css'

const RANGES: { value: RangeKind; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'day', label: 'One day' },
  { value: 'week', label: 'That week' },
  { value: 'month', label: 'That month' },
  { value: 'year', label: 'That year' },
  { value: 'custom', label: 'From… to…' },
]
const ACCEPT: Record<Format, string> = { csv: '.csv,.tsv,.txt,.tab', xlsx: '.xlsx,.xls,.ods', json: '.json', ics: '.ics,.ical', txt: '' }

/** Settings, Data: Import and export. Pick what (a module's records, tasks,
 *  the calendar, notes, figures for charts, or the whole account), tick its
 *  fields, pick a format and a range, and export. The same choice is what a
 *  file is read into: it is checked row by row and shown before anything is
 *  saved. */
export function TransferSettings() {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const datasets = useLiveQuery(async () => {
    if (!profile) return [] as Dataset[]
    const { listDatasets } = await import('../lib/transfer')
    return listDatasets(profile.id)
  }, [profile?.id])
  // /more?page=data&dataset=… opens on that dataset (Finance's "Import from your bank…").
  const [params] = useSearchParams()
  const asked = params.get('dataset')
  const [key, setKey] = useState<string>(asked ?? 'tasks')
  const top = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (asked && datasets) top.current?.scrollIntoView({ block: 'start' }) }, [asked, !!datasets]) // eslint-disable-line react-hooks/exhaustive-deps
  const dataset = datasets?.find((d) => d.key === key) ?? datasets?.[0]
  const [fields, setFields] = useState<string[] | null>(null)
  const [fmt, setFmt] = useState<Format>('csv')
  const [rangeKind, setRangeKind] = useState<RangeKind>('all')
  const [day, setDay] = useState(formatDate(new Date(), 'yyyy-MM-dd'))
  const [until, setUntil] = useState(formatDate(new Date(), 'yyyy-MM-dd'))
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [done, setDone] = useState<ImportDone | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  // A new dataset starts with every field ticked and a format it has.
  useEffect(() => {
    if (!dataset) return
    setFields(null)
    setFmt((f) => (dataset.formats.includes(f) ? f : dataset.formats[0]))
    if (!dataset.dateField) setRangeKind('all')
    setPreview(null)
    setDone(null)
    setNote(null)
  }, [dataset?.key])

  const options = useMemo(() => (datasets ?? []).map((d) => ({
    value: d.key,
    label: d.off ? `${d.label} (off)` : d.label,
    hint: d.group === 'Account' ? 'Everything in one file, to restore or move' : d.group,
  })), [datasets])

  if (!profile || !datasets || !dataset) return null
  const d = dataset
  const chosen = fields ?? d.fields.map((f) => f.name)
  const range = d.dateField ? rangeFor(rangeKind, day, { from: day, to: until }) : null
  const badRange = !!d.dateField && rangeKind === 'custom' && !range

  function tick(name: string) {
    setFields(chosen.includes(name) ? chosen.filter((n) => n !== name) : d.fields.map((f) => f.name).filter((n) => n === name || chosen.includes(n)))
  }

  async function doExport() {
    if (busy || !profile) return
    setBusy(true)
    setNote(null)
    try {
      const { exportDataset } = await import('../lib/transfer')
      const result = await exportDataset(profile, userId, { dataset: d, fields: chosen, format: fmt, range })
      const how = await saveFile(result.name, result.blob)
      setNote({ text: how === 'cancelled' ? 'Not saved.' : `${how === 'shared' ? 'Shared' : 'Saved'} ${result.name}${d.store === 'backup' ? '' : ` · ${result.count} ${result.count === 1 ? 'row' : 'rows'}`}.` })
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : 'That could not be exported.', bad: true })
    } finally {
      setBusy(false)
    }
  }

  async function choose(file: File) {
    if (!profile) return
    setNote(null)
    setDone(null)
    setPreview(null)
    setBusy(true)
    try {
      const { readImport } = await import('../lib/transfer')
      setPreview(await readImport(profile, userId, d, file))
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : 'That file could not be read.', bad: true })
    } finally {
      setBusy(false)
    }
  }

  async function doImport() {
    if (!preview || busy || !profile) return
    setBusy(true)
    setNote(null)
    try {
      const { saveImport } = await import('../lib/transfer')
      const result = await saveImport(profile, userId, preview, (n, total) => setProgress(`${n} of ${total}`))
      setDone(result)
      setPreview(null)
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : 'The import stopped. Rows saved so far are kept.', bad: true })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const importable = d.imports.length > 0
  const ready = preview?.plan.valid ?? 0

  return (
    <>
      <p className="section-title" ref={top}>Import and export</p>
      <div className="tx">
        <p className="tx-step"><b>1.</b> What</p>
        <div className="tx-row">
          <Dropdown label="What to export or import" value={d.key} options={options} onChange={setKey} />
        </div>

        {d.fields.length > 0 && (
          <>
            <p className="tx-step">
              <b>2.</b> Fields · {chosen.length} of {d.fields.length}{' '}
              <button type="button" className="tx-link" onClick={() => setFields(chosen.length === d.fields.length ? [] : null)}>
                {chosen.length === d.fields.length ? 'None' : 'All'}
              </button>
            </p>
            <div className="tx-fields">
              {d.fields.map((f) => (
                <label key={f.name} className="tx-field">
                  <input type="checkbox" checked={chosen.includes(f.name)} onChange={() => tick(f.name)} />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <p className="tx-step"><b>{d.fields.length ? 3 : 2}.</b> Format{d.dateField ? ' and range' : ''}</p>
        <div className="tx-row" role="group" aria-label="Format">
          {d.formats.map((f) => (
            <button key={f} type="button" className="tx-chip" aria-pressed={f === fmt} onClick={() => setFmt(f)}>{FORMATS[f].label}</button>
          ))}
        </div>
        {d.dateField && (
          <div className="tx-row">
            <Dropdown label="Range" value={rangeKind} options={RANGES} onChange={setRangeKind} />
            {rangeKind !== 'all' && (
              <input className="tx-date" type="date" value={day} aria-label={rangeKind === 'custom' ? 'From' : 'Day in the range'}
                onChange={(e) => e.target.value && setDay(e.target.value)} />
            )}
            {rangeKind === 'custom' && (
              <input className="tx-date" type="date" value={until} aria-label="To" onChange={(e) => e.target.value && setUntil(e.target.value)} />
            )}
          </div>
        )}
        {range && <p className="tx-note">{range.label}</p>}
        {badRange && <p className="tx-note is-bad">The last day comes before the first.</p>}
        <div className="tx-actions">
          <button type="button" className="btn btn-primary" disabled={busy || badRange || (d.fields.length > 0 && chosen.length === 0)}
            onClick={() => void doExport()}>Export</button>
        </div>
      </div>

      <div className="tx">
        <p className="tx-step"><b>Import</b> into {d.label}</p>
        {!importable ? (
          <p className="tx-note">{d.label} is export only.</p>
        ) : (
          <>
            <p className="tx-note">
              {d.store === 'backup'
                ? 'A backup file from Hemlo, read into the profile that is open. Nothing is saved until you confirm.'
                : `From ${d.imports.map((f) => FORMATS[f].label).join(', ')}. Columns are matched by name; nothing is saved until you confirm, and rows already here are skipped.`}
            </p>
            <div className="tx-actions">
              <label className="btn" style={{ cursor: busy ? 'default' : 'pointer' }}>
                Choose file
                <input type="file" hidden disabled={busy} accept={d.imports.map((f) => ACCEPT[f]).join(',')}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void choose(file)
                  }} />
              </label>
            </div>
          </>
        )}
        {preview && <Preview p={preview} busy={busy} progress={progress} ready={ready}
          onCancel={() => setPreview(null)} onImport={() => void doImport()} />}
        {done && (
          <p className="tx-note" role="status">
            {d.store === 'backup'
              ? `${done.added} records read into ${profile.name}. They go up to your account with the next sync.`
              : `${done.added} ${done.added === 1 ? 'row' : 'rows'} added${done.series ? `, ${done.series} of them repeating` : ''}`
                + `${done.skipped ? ` · ${done.skipped} skipped` : ''}${done.failed ? ` · ${done.failed} could not be saved` : ''}.`}
          </p>
        )}
        {note && <p className={`tx-note${note.bad ? ' is-bad' : ''}`} role="status">{note.text}</p>}
      </div>
    </>
  )
}

/** The file as it will be saved: which column fills which field, the first
 *  twenty rows with their problems, and the count that is ready. */
function Preview({ p, busy, progress, ready, onCancel, onImport }: {
  p: ImportPreview; busy: boolean; progress: string | null; ready: number; onCancel: () => void; onImport: () => void
}) {
  const d = p.dataset
  if (d.store === 'backup') {
    return (
      <>
        <p className="tx-note">{p.file.name} · a backup with {p.backupRecords} records. Rows already here are updated, not doubled.</p>
        <div className="tx-actions">
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onImport}>{busy ? 'Importing…' : 'Import backup'}</button>
        </div>
      </>
    )
  }
  const plan = p.plan
  const used = plan.columns.filter((c) => c.field)
  const unused = plan.columns.filter((c) => !c.field && c.header)
  const shown = d.fields.filter((f) => used.some((c) => c.field === f.name))
  const problems = plan.rows.filter((r) => r.problems.length).slice(0, 8)
  const fmt = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v))
  return (
    <>
      <p className="tx-note">
        {p.file.name} · {plan.rows.length} {plan.rows.length === 1 ? 'row' : 'rows'} · <b>{ready} ready</b>
        {plan.duplicates ? ` · ${plan.duplicates} already here` : ''}
        {plan.withProblems ? ` · ${plan.withProblems} with problems` : ''}
        {p.series.size ? ` · ${p.series.size} repeating` : ''}
      </p>
      <p className="tx-note">
        Columns: {used.map((c) => `${c.header} → ${d.fields.find((f) => f.name === c.field)?.label}`).join(', ') || 'none matched'}
        {unused.length ? ` · not used: ${unused.map((c) => c.header).slice(0, 8).join(', ')}` : ''}
      </p>
      {plan.missing.length > 0 && (
        <p className="tx-note is-bad">No column for {plan.missing.join(', ')}, which every row needs. Add it to the file and choose it again.</p>
      )}
      {p.notes.map((n) => <p key={n} className="tx-note is-bad">{n}</p>)}
      {plan.rows.length > 0 && shown.length > 0 && (
        <div className="tx-preview">
          <div className="sheet-wrap">
            <table className="sheet">
              <thead>
                <tr>
                  <th>Line</th>
                  {shown.map((f) => <th key={f.name}>{f.label}</th>)}
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.slice(0, 20).map((r) => (
                  <tr key={r.line} className={r.duplicate ? 'is-dup' : undefined}>
                    <td>{r.line}</td>
                    {shown.map((f) => <td key={f.name}>{fmt(r.values[f.name])}</td>)}
                    <td className={r.problems.length ? 'tx-bad' : undefined}>
                      {r.problems.length ? r.problems.join(' ') : r.duplicate ? 'already here' : p.series.has(r.line) ? 'ok, repeats' : 'ok'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {plan.rows.length > 20 && <p className="tx-note">Showing the first 20 of {plan.rows.length}.</p>}
      {problems.length > 0 && (
        <ul className="tx-problems">
          {problems.map((r) => <li key={r.line}>Line {r.line}: {r.problems.join(' ')}</li>)}
        </ul>
      )}
      <div className="tx-actions">
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy || ready === 0} onClick={onImport}>
          {busy ? `Importing${progress ? ` ${progress}` : '…'}` : `Import ${ready} ${ready === 1 ? 'row' : 'rows'}`}
        </button>
      </div>
    </>
  )
}
