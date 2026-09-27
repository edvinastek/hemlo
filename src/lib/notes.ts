// A task's note is plain text with a little Markdown in it: "## " starts a
// heading, "- " a bullet, "- [ ] " a checklist item ("- [x] " once done), and
// **two stars** make words bold. Everything else is kept exactly as written.
// The note stays plain text in the database, so it syncs, exports and reads
// fine anywhere; this file turns it into a model the notes page draws with
// ordinary React elements, never as HTML, so nothing typed can become markup.
// Pure, so the checks can run it without a browser.

export interface Span { text: string; bold: boolean }

export interface Item {
  kind: 'bullet' | 'check'
  done: boolean
  /** How far in it sits: two spaces (or a tab) per step, at most three. */
  depth: number
  spans: Span[]
  /** Its line in the note, counted from 0, so a tick knows what to rewrite. */
  line: number
}

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; spans: Span[]; line: number }
  | { kind: 'text'; lines: { spans: Span[]; line: number }[] }
  | { kind: 'list'; items: Item[] }

const CHECK = /^([ \t]*)[-*+] \[([ xX])\](?: (.*))?$/
const BULLET = /^([ \t]*)[-*+] (.*)$/
const HEADING = /^(#{1,6})[ \t]+(.*)$/

type Line =
  | { kind: 'check'; indent: string; done: boolean; rest: string }
  | { kind: 'bullet'; indent: string; rest: string }
  | { kind: 'heading'; level: number; rest: string }
  | { kind: 'blank' }
  | { kind: 'text'; rest: string }

// A note written on Windows ends its lines with \r\n; the \r is not part of
// what the person wrote.
const bare = (line: string) => line.replace(/\r$/, '')

function readLine(raw: string): Line {
  const line = bare(raw)
  let m = CHECK.exec(line)
  if (m) return { kind: 'check', indent: m[1], done: m[2] !== ' ', rest: m[3] ?? '' }
  m = BULLET.exec(line)
  if (m) return { kind: 'bullet', indent: m[1], rest: m[2] }
  m = HEADING.exec(line)
  if (m) return { kind: 'heading', level: m[1].length, rest: m[2] }
  if (line.trim() === '') return { kind: 'blank' }
  return { kind: 'text', rest: line }
}

const depthOf = (indent: string) => Math.min(3, Math.floor(indent.replace(/\t/g, '  ').length / 2))

/** Bold where a pair of ** closes; a lone ** is left as it was typed. */
export function parseInline(text: string): Span[] {
  const out: Span[] = []
  const bold = /\*\*(.+?)\*\*/g
  let at = 0
  for (let m = bold.exec(text); m; m = bold.exec(text)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index), bold: false })
    out.push({ text: m[1], bold: true })
    at = m.index + m[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at), bold: false })
  return out
}

/** The note as blocks to draw: headings, runs of text, and lists. A blank
 *  line ends a run or a list; lines of text next to each other stay one
 *  paragraph with their line breaks, because that is how notes get typed. */
export function parseNote(note: string | null | undefined): Block[] {
  const blocks: Block[] = []
  const lines = (note ?? '').split('\n')
  let open: Block | null = null
  lines.forEach((raw, i) => {
    const l = readLine(raw)
    // A heading marker with nothing after it yet is half-typed, not a heading.
    if (l.kind === 'blank' || (l.kind === 'heading' && l.rest.trim() === '')) { open = null; return }
    if (l.kind === 'heading') {
      blocks.push({ kind: 'heading', level: Math.min(3, l.level) as 1 | 2 | 3, spans: parseInline(l.rest), line: i })
      open = null
      return
    }
    if (l.kind === 'check' || l.kind === 'bullet') {
      const item: Item = {
        kind: l.kind, done: l.kind === 'check' && l.done, depth: depthOf(l.indent), spans: parseInline(l.rest), line: i,
      }
      if (open?.kind === 'list') open.items.push(item)
      else { open = { kind: 'list', items: [item] }; blocks.push(open) }
      return
    }
    const row = { spans: parseInline(l.rest), line: i }
    if (open?.kind === 'text') open.lines.push(row)
    else { open = { kind: 'text', lines: [row] }; blocks.push(open) }
  })
  return blocks
}

/** Tick or untick the checklist item on this line. Only the character inside
 *  the brackets changes, so the rest of the note comes back byte for byte. */
export function toggleCheck(note: string, line: number): string {
  const lines = note.split('\n')
  const raw = lines[line]
  if (raw === undefined) return note
  const m = CHECK.exec(bare(raw))
  if (!m) return note
  const at = raw.indexOf('[', m[1].length) + 1
  lines[line] = raw.slice(0, at) + (m[2] === ' ' ? 'x' : ' ') + raw.slice(at + 1)
  return lines.join('\n')
}

/** How many checklist items there are and how many are ticked. */
export function checklistProgress(note: string | null | undefined): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const raw of (note ?? '').split('\n')) {
    const m = CHECK.exec(bare(raw))
    if (!m) continue
    total++
    if (m[2] !== ' ') done++
  }
  return { done, total }
}

/** Whether a note has anything in it worth showing. */
export const hasNote = (note: string | null | undefined) => !!note && note.trim() !== ''

// ---------- the toolbar ------------------------------------------------------

export type Tool = 'check' | 'bullet' | 'bold' | 'heading'

export interface Edit { text: string; start: number; end: number }

const PREFIX: Record<Exclude<Tool, 'bold'>, string> = { check: '- [ ] ', bullet: '- ', heading: '## ' }

/** A line split into its indent, the marker it starts with, and the words. */
function splitLine(line: string): { indent: string; kind: Exclude<Tool, 'bold'> | null; words: string } {
  const l = readLine(line)
  if (l.kind === 'check') return { indent: l.indent, kind: 'check', words: l.rest }
  if (l.kind === 'bullet') return { indent: l.indent, kind: 'bullet', words: l.rest }
  if (l.kind === 'heading') return { indent: '', kind: 'heading', words: l.rest }
  const indent = /^[ \t]*/.exec(line)?.[0] ?? ''
  return { indent, kind: null, words: line.slice(indent.length) }
}

/** What a toolbar button does to the text around the cursor or selection.
 *  Checklist, bullet and heading act on whole lines: they swap whatever marker
 *  a line had for theirs, or take theirs off again if every line already has
 *  it. Bold wraps the selection, or unwraps it, or leaves the cursor between a
 *  fresh pair of stars to type into. */
export function applyTool(text: string, start: number, end: number, tool: Tool): Edit {
  if (start > end) [start, end] = [end, start]
  if (tool === 'bold') return applyBold(text, start, end)

  const from = text.lastIndexOf('\n', start - 1) + 1
  // A selection that ends just after a line break does not take in the next line.
  const stop = end > start && text[end - 1] === '\n' ? end - 1 : end
  const nl = text.indexOf('\n', stop)
  const to = nl === -1 ? text.length : nl
  const lines = text.slice(from, to).split('\n')
  const parts = lines.map((l) => ({ ...splitLine(bare(l)), cr: l.endsWith('\r') ? '\r' : '' }))
  const off = parts.every((p) => p.kind === tool)
  const next = parts.map((p) => (off ? p.indent : tool === 'heading' ? '' : p.indent) + (off ? '' : PREFIX[tool]) + p.words + p.cr)
  const out = text.slice(0, from) + next.join('\n') + text.slice(to)

  const firstDelta = next[0].length - lines[0].length
  const totalDelta = out.length - text.length
  const clamp = (n: number) => Math.max(from, Math.min(out.length, n))
  return { text: out, start: clamp(start + firstDelta), end: clamp(end + totalDelta) }
}

function applyBold(text: string, start: number, end: number): Edit {
  if (start === end) return { text: text.slice(0, start) + '****' + text.slice(end), start: start + 2, end: start + 2 }
  // A phone's double-tap takes the space after a word too; the stars go round
  // the word, or they would not close.
  let s = start
  let e = end
  while (s < e && /\s/.test(text[s])) s++
  while (e > s && /\s/.test(text[e - 1])) e--
  if (s === e) return { text, start, end }
  if (text.slice(s - 2, s) === '**' && text.slice(e, e + 2) === '**') {
    return { text: text.slice(0, s - 2) + text.slice(s, e) + text.slice(e + 2), start: s - 2, end: e - 2 }
  }
  return { text: text.slice(0, s) + '**' + text.slice(s, e) + '**' + text.slice(e), start: s + 2, end: e + 2 }
}

/** Enter on a list line starts the next item, unticked; Enter on an empty
 *  item ends the list instead. Null means Enter should just be Enter. */
export function continueList(text: string, start: number, end: number): Edit | null {
  if (start !== end) return null
  const from = text.lastIndexOf('\n', start - 1) + 1
  const nl = text.indexOf('\n', start)
  const lineEnd = nl === -1 ? text.length : nl
  const p = splitLine(bare(text.slice(from, lineEnd)))
  if (p.kind !== 'check' && p.kind !== 'bullet') return null
  // The cursor still inside the marker: let Enter break the line as usual.
  const markerEnd = from + (bare(text.slice(from, lineEnd)).length - p.words.length)
  if (start < markerEnd) return null
  if (p.words.trim() === '') {
    const out = text.slice(0, from) + text.slice(lineEnd)
    return { text: out, start: from, end: from }
  }
  const insert = '\n' + p.indent + PREFIX[p.kind]
  const out = text.slice(0, start) + insert + text.slice(end)
  return { text: out, start: start + insert.length, end: start + insert.length }
}
