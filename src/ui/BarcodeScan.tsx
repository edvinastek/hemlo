import { useEffect, useRef, useState, type FormEvent } from 'react'
import { features, isNative } from '../lib/native'
import { normaliseBarcode } from '../lib/products-rules'

type Mode = 'native' | 'camera' | 'type'
/** What a browser offers for reading barcodes from the camera, where it offers it. */
type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string; format: string }[]> }
type DetectorClass = new (options: { formats: string[] }) => Detector

const WEB_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

/** Which way this device can read a barcode: ML Kit's scanner in the phone
 *  apps, the camera in a browser that can read barcodes itself, otherwise
 *  typing the digits under the stripes. */
function modeHere(): Mode {
  if (isNative()) return 'native'
  const w = window as unknown as { BarcodeDetector?: DetectorClass }
  if (w.BarcodeDetector && typeof navigator.mediaDevices?.getUserMedia === 'function') return 'camera'
  return 'type'
}

/** Reads one barcode and hands it over checked (the digits and the check
 *  digit), or lets the person type it. Shown inside a sheet.
 *
 *  In the Android app this is Google's code scanner from Play services: it
 *  opens its own camera screen and hands back only the code, so GetIt needs
 *  no camera permission. On a phone without it, it is fetched once from
 *  Google Play, with progress shown. In the iPhone app ML Kit is built in and
 *  shows its own camera screen; the iPhone asks once for the camera. */
export function BarcodeScan({ onCode, onCancel }: { onCode: (code: string) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<Mode>(modeHere)
  const [note, setNote] = useState<string | null>(null)

  return (
    <div className="bs">
      {mode === 'native' && <NativeScan onCode={onCode} onFail={(why) => { setNote(why); setMode('type') }} onCancel={onCancel} />}
      {mode === 'camera' && <CameraScan onCode={onCode} onFail={(why) => { setNote(why); setMode('type') }} />}
      {note && <p className="pf-note" role="status">{note}</p>}
      <TypeCode onCode={onCode} first={mode === 'type'} />
      {mode === 'type' && modeHere() !== 'type' && (
        <button type="button" className="slot-link" onClick={() => { setNote(null); setMode(modeHere()) }}>Scan again</button>
      )}
    </div>
  )
}

/** The digits under the stripes, typed. Checked before anything is looked up. */
function TypeCode({ onCode, first }: { onCode: (code: string) => void; first: boolean }) {
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  function submit(e: FormEvent) {
    e.preventDefault()
    const code = normaliseBarcode(text)
    if (!code) { setBad(true); return }
    onCode(code)
  }
  return (
    <form className="pf-search bs-type" onSubmit={submit}>
      <label className="pf-label">
        <span>{first ? 'Type the numbers under the barcode' : 'Or type the numbers'}</span>
        <input value={text} inputMode="numeric" autoComplete="off" pattern="[0-9 \-]*" maxLength={20} autoFocus={first}
          aria-label="Barcode digits" aria-invalid={bad} placeholder="8710496979125"
          onChange={(e) => { setText(e.target.value); setBad(false) }} />
      </label>
      <button type="submit" className="btn" disabled={!text.trim()}>Look up</button>
      {bad && <p className="pf-note is-bad" role="alert">That is not a barcode: 8 or 13 digits, and the last one checks the others.</p>}
    </form>
  )
}

/** ML Kit's scanner, through its plugin. Loaded only in the phone apps. */
function NativeScan({ onCode, onFail, onCancel }: { onCode: (code: string) => void; onFail: (why: string) => void; onCancel: () => void }) {
  const [status, setStatus] = useState('Opening the scanner…')
  const started = useRef(false)
  const on = useLatest({ onCode, onFail, onCancel })

  useEffect(() => {
    // Once per opening, even when React runs effects twice in development.
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        const { BarcodeScanner, BarcodeFormat, GoogleBarcodeScannerModuleInstallState: State } = await import('@capacitor-mlkit/barcode-scanning')
        // Only Android fetches the scanner separately; the iPhone has it built in.
        const { available } = features().scannerModule ? await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable() : { available: true }
        if (!available) {
          setStatus('Getting Google’s barcode scanner from Google Play. This happens once.')
          await new Promise<void>((resolve, reject) => {
            void BarcodeScanner.addListener('googleBarcodeScannerModuleInstallProgress', (e) => {
              if (e.state === State.COMPLETED) resolve()
              else if (e.state === State.FAILED || e.state === State.CANCELED) reject(new Error('install'))
              else if (typeof e.progress === 'number') setStatus(`Getting Google’s barcode scanner: ${Math.round(e.progress)}%`)
            })
            BarcodeScanner.installGoogleBarcodeScannerModule().catch(reject)
          }).finally(() => void BarcodeScanner.removeAllListeners())
        }
        setStatus('Point the camera at the barcode.')
        const { barcodes } = await BarcodeScanner.scan({
          formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE],
        })
        const first = barcodes[0]
        const code = first ? normaliseBarcode(first.rawValue ?? first.displayValue, String(first.format)) : null
        if (code) on.current.onCode(code)
        else on.current.onFail('That barcode could not be read. Try again, or type the numbers.')
      } catch (e) {
        const text = String((e as Error)?.message ?? e)
        // Closing the scanner is not a problem: back to where the person was.
        if (/cancel/i.test(text)) { on.current.onCancel(); return }
        if (text === 'install') on.current.onFail('Google’s barcode scanner could not be installed. Type the numbers instead.')
        // The iPhone's answer when the camera was refused (now or before).
        else if (/denied access to camera/i.test(text)) on.current.onFail('GetIt may not use the camera. Allow it in the iPhone’s Settings → GetIt, or type the numbers.')
        else on.current.onFail('The scanner is not available on this phone. Type the numbers instead.')
      }
    })()
  }, [on])

  return <p className="pf-note" role="status">{status}</p>
}

/** A browser that can read barcodes itself (Chrome on Android, for one): the
 *  camera shows in the sheet until a code is read. Nothing is recorded or
 *  sent; the picture stays on the device and stops when the sheet closes. */
function CameraScan({ onCode, onFail }: { onCode: (code: string) => void; onFail: (why: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const on = useLatest({ onCode, onFail })

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false
    const Detector = (window as unknown as { BarcodeDetector: DetectorClass }).BarcodeDetector
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped || !video.current) { stream.getTracks().forEach((t) => t.stop()); return }
        video.current.srcObject = stream
        await video.current.play()
        setReady(true)
        const detector = new Detector({ formats: WEB_FORMATS })
        let last: string | null = null
        const look = async () => {
          if (stopped || !video.current) return
          try {
            const found = await detector.detect(video.current)
            const hit = found.map((b) => normaliseBarcode(b.rawValue, b.format === 'upc_e' ? 'UPC_E' : undefined)).find(Boolean) ?? null
            // The same code twice in a row, so a half-seen barcode is never taken.
            if (hit && hit === last) { on.current.onCode(hit); return }
            last = hit
          } catch { /* a frame that could not be read; try the next */ }
          timer = window.setTimeout(() => void look(), 250)
        }
        void look()
      } catch {
        if (!stopped) on.current.onFail('The camera is not available here. Type the numbers instead.')
      }
    })()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [on])

  return (
    <div className="bs-camera">
      <video ref={video} muted playsInline aria-label="Camera: point it at the barcode" />
      <p className="pf-note" role="status">{ready ? 'Hold the barcode inside the frame.' : 'Starting the camera…'}</p>
    </div>
  )
}

/** The newest props, for an effect that must run once (a camera started
 *  once) but call whatever the parent passes now. */
function useLatest<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

/** A barcode drawn as stripes, for a scan button that sits inside a search
 *  field (v17: "Scan barcode" is no longer a button of its own on the page).
 *  It takes the text colour, so it follows light and dark. */
export function ScanIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M17 3h2.5A1.5 1.5 0 0 1 21 4.5V7M21 17v2.5a1.5 1.5 0 0 1-1.5 1.5H17M7 21H4.5A1.5 1.5 0 0 1 3 19.5V17" />
      <path d="M7 8v8M10 8v8M12.5 8v8M15 8v8M17 8v8" />
    </svg>
  )
}
