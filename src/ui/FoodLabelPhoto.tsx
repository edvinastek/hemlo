import { useEffect, useRef, useState } from 'react'
import { makePhoto } from '../modules/photos'
import { readLabelText, type LabelRead } from '../lib/eu-label-rules'

/** A photo of the nutrition table beside the food form (PROD-05). The
 *  Android app has no reader for text in a picture without a new native
 *  part (the ML Kit plugin it has reads barcodes only), so the photo is
 *  there to type from, kept in view while the figures are filled in. Where
 *  the browser can read text in a picture itself (the Shape Detection API's
 *  TextDetector), the figures it finds are filled in for the person to
 *  check. The label's text can also be pasted (Android can copy the text
 *  out of a photo), and the same reader fills the figures in. The photo
 *  stays on the device unless the person adds the product to Open Food
 *  Facts. */
export function FoodLabelPhoto({ onRead, onPhoto }: {
  /** Figures read from the photo or the pasted text. */
  onRead: (read: LabelRead, from: 'photo' | 'text') => void
  /** The photo made smaller, or null when taken off. */
  onPhoto: (blob: Blob | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [pasting, setPasting] = useState(false)
  const [text, setText] = useState('')
  const camera = useRef<HTMLInputElement>(null)
  const files = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  async function take(file: File | undefined) {
    if (!file) return
    setBusy(true); setSaid(null)
    try {
      const made = await makePhoto(file)
      if (!made.ok) { setSaid(made.message); return }
      setUrl(URL.createObjectURL(made.blob))
      onPhoto(made.blob)
      const read = await readPhoto(made.blob)
      if (read && read.found) { onRead(read, 'photo'); setSaid(`${read.found} figures read from the photo. Check each one.`) }
    } finally { setBusy(false) }
  }

  if (!open) {
    return <button type="button" className="slot-link fe-label-open" onClick={() => setOpen(true)}>Use a photo of the label</button>
  }
  return (
    <div className="fe-labelphoto" role="group" aria-label="Photo of the label">
      {url && (
        <div className="fe-ref">
          <img src={url} alt="The nutrition table, to type the figures from" />
        </div>
      )}
      <div className="fe-ref-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => camera.current?.click()}>{url ? 'Take another' : 'Take a photo'}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => files.current?.click()}>{url ? 'Choose another' : 'Choose a photo'}</button>
        {url && <button type="button" className="btn" onClick={() => { setUrl(null); onPhoto(null); setSaid(null) }}>Take it off</button>}
        {!pasting && <button type="button" className="slot-link" onClick={() => setPasting(true)}>Paste the label’s text</button>}
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void take(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={files} type="file" accept="image/*" hidden onChange={(e) => { void take(e.target.files?.[0]); e.target.value = '' }} />
      {pasting && (
        <div className="fe-paste">
          <textarea value={text} rows={4} aria-label="The label’s text" placeholder={'Energie 1520 kJ / 362 kcal\nVetten 12 g …'}
            onChange={(e) => setText(e.target.value)} />
          <button type="button" className="btn" disabled={!text.trim()} onClick={() => {
            const read = readLabelText(text)
            if (read.found) { onRead(read, 'text'); setSaid(`${read.found} figures read. Check each one.`) }
            else setSaid('No figures found in that text.')
          }}>Fill in the figures</button>
        </div>
      )}
      {busy && <p className="fe-note" role="status">Making the photo smaller…</p>}
      {said && <p className="fe-note" role="status">{said}</p>}
    </div>
  )
}

/** The text in a picture, where the browser can read it (TextDetector), as
 *  lines from top to bottom; null where it cannot. */
async function readPhoto(blob: Blob): Promise<LabelRead | null> {
  type Found = { rawValue: string; boundingBox: DOMRectReadOnly }
  const Detector = (window as unknown as { TextDetector?: new () => { detect: (i: ImageBitmap) => Promise<Found[]> } }).TextDetector
  if (!Detector) return null
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(blob)
    const found = await new Detector().detect(bitmap)
    return readLabelText(linesOf(found))
  } catch {
    return null
  } finally {
    bitmap?.close()
  }
}

/** Words found in a picture put back into lines: those at about the same
 *  height, left to right. */
function linesOf(found: { rawValue: string; boundingBox: DOMRectReadOnly }[]): string {
  const sorted = [...found].sort((a, b) => a.boundingBox.top - b.boundingBox.top)
  const lines: { top: number; height: number; parts: typeof found }[] = []
  for (const f of sorted) {
    const line = lines.find((l) => Math.abs(l.top - f.boundingBox.top) < Math.max(l.height, f.boundingBox.height) / 2)
    if (line) line.parts.push(f)
    else lines.push({ top: f.boundingBox.top, height: f.boundingBox.height, parts: [f] })
  }
  return lines.map((l) => l.parts.sort((a, b) => a.boundingBox.left - b.boundingBox.left).map((p) => p.rawValue).join(' ')).join('\n')
}
