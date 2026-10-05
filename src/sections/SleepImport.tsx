import { useEffect, useState, type ReactNode } from 'react'
import { allowSleepReading, healthStatus, installHealthConnect, openHealthConnect, type HealthStatus } from '../lib/native'
import { importSleep, undoImport } from '../lib/sleep-import'
import { describeImport, importRange } from '../lib/sleep-import-rules'
import { offerUndo } from '../ui/Undo'
import { Sheet } from './ModuleKit'

const SPANS = [7, 14, 30]

type Step =
  | { kind: 'checking' }
  | { kind: 'status'; status: HealthStatus }
  | { kind: 'working' }
  | { kind: 'refused' }
  | { kind: 'done'; line: string }
  | { kind: 'failed' }

/** Whether Sleep's ⋮ offers "Import from Health Connect": on Android, where
 *  Health Connect is there or can be installed. Undefined while looking. */
export function useHealthConnect(): HealthStatus | undefined {
  const [status, setStatus] = useState<HealthStatus | undefined>(undefined)
  useEffect(() => {
    let live = true
    void healthStatus().then((s) => { if (live) setStatus(s) })
    return () => { live = false }
  }, [])
  return status
}

/** Import from Health Connect (SLP-05): the days to bring in, then one line
 *  on what came in. Health Connect's permission is asked for only here,
 *  when the person chooses Import. */
export function SleepImportSheet({ profileId, today, onClose }: { profileId: string; today: string; onClose: () => void }) {
  const [days, setDays] = useState(14)
  const [step, setStep] = useState<Step>({ kind: 'checking' })

  // Looked at on opening, and again on coming back from Google Play.
  useEffect(() => {
    let live = true
    const check = () => void healthStatus().then((status) => {
      if (live) setStep((s) => (s.kind === 'checking' || s.kind === 'status' ? { kind: 'status', status } : s))
    })
    check()
    const onShow = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onShow)
    return () => { live = false; document.removeEventListener('visibilitychange', onShow) }
  }, [])

  async function run() {
    setStep({ kind: 'working' })
    try {
      if (!(await allowSleepReading())) { setStep({ kind: 'refused' }); return }
      const res = await importSleep(profileId, importRange(today, days))
      setStep({ kind: 'done', line: describeImport(res) })
      if (res.rows.length) offerUndo(`${res.added} ${res.added === 1 ? 'night' : 'nights'} imported`, () => undoImport(res.rows))
    } catch (e) {
      setStep((e as { code?: string })?.code === 'not-allowed' ? { kind: 'refused' } : { kind: 'failed' })
    }
  }

  const close = <button type="button" className="btn grow" onClick={onClose}>Close</button>
  const ready = step.kind === 'status' && step.status === 'available'
  const busy = step.kind === 'working'

  let body: ReactNode = null
  let actions: ReactNode = close
  if (step.kind === 'checking') {
    body = <p className="kit-hint" aria-live="polite">Looking for Health Connect…</p>
  } else if (step.kind === 'status' && step.status === 'unsupported') {
    body = <p className="kit-hint">Health Connect is not available on this phone.</p>
  } else if (step.kind === 'status' && step.status === 'install') {
    body = <p className="kit-hint">Health Connect needs installing or updating first.</p>
    actions = <>{close}<button type="button" className="btn btn-primary" onClick={() => void installHealthConnect()}>Get Health Connect</button></>
  } else if (ready || busy) {
    body = (
      <div className="form-grid">
        <div className="sleep-quality slp-days" role="radiogroup" aria-label="Nights to import">
          <span>Nights ending in the last</span>
          <div>
            {SPANS.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={days === d} disabled={busy}
                onClick={() => setDays(d)}>{d} days</button>
            ))}
          </div>
        </div>
      </div>
    )
    actions = <>
      <button type="button" className="btn grow" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Importing…' : 'Import'}</button>
    </>
  } else if (step.kind === 'refused') {
    body = <p className="kit-hint" role="status">Visuma may not read sleep. You can allow it in Health Connect.</p>
    actions = <>{close}<button type="button" className="btn btn-primary" onClick={() => void openHealthConnect()}>Open Health Connect</button></>
  } else if (step.kind === 'done') {
    body = <p className="kit-hint" role="status">{step.line}</p>
    actions = <button type="button" className="btn btn-primary grow" onClick={onClose} autoFocus>Done</button>
  } else if (step.kind === 'failed') {
    body = <p className="kit-error" role="alert">Health Connect did not answer. Try again in a moment.</p>
    actions = <>{close}<button type="button" className="btn btn-primary" onClick={() => setStep({ kind: 'status', status: 'available' })}>Try again</button></>
  }

  return (
    <Sheet title="Import from Health Connect" onClose={onClose} onSubmit={() => { if (ready) void run() }} actions={actions}>
      {body}
    </Sheet>
  )
}
