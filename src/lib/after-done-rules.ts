/** "Ask after done" note templates (NOT-14, NOT-15, LRN-04). A task made with
 *  such a template does not get its body straight away: its note carries a
 *  marker line instead, and ticking the task opens the template (Fill in /
 *  Later / Skip). Pure: the note text in, the note text out.
 *
 *  The marker is one line of its own, `{after-done:<template id>}`. The note
 *  editor shows it in plain words ("Asks for Reading reflection when done",
 *  NOT-17); anywhere else it reads as a short code that does no harm. */

const MARKER = /^\{after-done:([a-z0-9-]{1,64})\}$/m
const MARKER_ALL = /^\{after-done:[a-z0-9-]{1,64}\}\n?/gm

/** The line to put in a note. */
export const afterDoneMarker = (templateId: string) => `{after-done:${templateId}}`

/** The template a note is waiting for once its task is done, if any. */
export function pendingAfterDone(note: string | null | undefined): string | null {
  if (!note) return null
  return note.match(MARKER)?.[1] ?? null
}

/** Adds the marker to a note (once). */
export function withAfterDone(note: string | null | undefined, templateId: string): string {
  const body = removeMarkers(note ?? '')
  return body ? `${body}\n${afterDoneMarker(templateId)}` : afterDoneMarker(templateId)
}

/** What the person chose when the template opened:
 *  - 'fill': the marker is replaced by what they wrote (the filled template);
 *  - 'skip': the marker is removed and nothing is added;
 *  - 'later': the note is left as it is, so it asks again next time the task
 *    is opened or ticked. */
export function resolveAfterDone(note: string | null | undefined, choice: 'fill' | 'skip' | 'later', filled?: string): string {
  const text = note ?? ''
  if (choice === 'later') return text
  if (choice === 'skip') return removeMarkers(text)
  const add = (filled ?? '').trim()
  if (!MARKER.test(text)) return add ? (text.trim() ? `${text.trimEnd()}\n\n${add}` : add) : text
  return text.replace(MARKER, add).replace(MARKER_ALL, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** The note without any marker line, for showing or copying. */
export function removeMarkers(note: string): string {
  return note.replace(MARKER_ALL, '').replace(/\n{3,}/g, '\n\n').trim()
}
