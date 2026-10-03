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

// ---------- moving and indenting checklist items (NOT-04) --------------------

const LIST_LINE = /^([ \t]*)[-*+] /
const indentWidth = (indent: string) => indent.replace(/\t/g, '  ').length

/** The list item on a line: how deep it sits, or null for any other line. */
function itemDepth(line: string | undefined): number | null {
  if (line === undefined) return null
  const m = LIST_LINE.exec(bare(line))
  return m ? depthOf(m[1]) : null
}

/** The lines an item covers: itself and the deeper items under it. */
export function itemSpan(note: string, line: number): [number, number] | null {
  const lines = note.split('\n')
  const depth = itemDepth(lines[line])
  if (depth === null) return null
  let end = line + 1
  while (end < lines.length) {
    const d = itemDepth(lines[end])
    if (d === null || d <= depth) break
    end++
  }
  return [line, end]
}

/** The item next to this one at the same depth, in the same list, above
 *  (dir -1) or below (dir 1); null at either end. */
function sibling(lines: string[], line: number, dir: -1 | 1): number | null {
  const depth = itemDepth(lines[line])
  if (depth === null) return null
  if (dir === 1) {
    const span = itemSpan(lines.join('\n'), line)!
    const next = span[1]
    return itemDepth(lines[next]) === depth ? next : null
  }
  for (let i = line - 1; i >= 0; i--) {
    const d = itemDepth(lines[i])
    if (d === null || d < depth) return null
    if (d === depth) return i
  }
  return null
}

/** Moves an item, with the items under it, one place up or down among the
 *  items at its depth. Returns the note and the item's new line, or null
 *  when it cannot move that way. */
export function moveItem(note: string, line: number, dir: -1 | 1): { text: string; line: number } | null {
  const lines = note.split('\n')
  const other = sibling(lines, line, dir)
  if (other === null) return null
  const [a0, a1] = itemSpan(note, Math.min(line, other))!
  const [b0, b1] = itemSpan(note, Math.max(line, other))!
  if (a1 !== b0) return null
  const first = lines.slice(a0, a1)
  const second = lines.slice(b0, b1)
  const out = [...lines.slice(0, a0), ...second, ...first, ...lines.slice(b1)]
  return { text: out.join('\n'), line: dir === -1 ? a0 : a0 + second.length }
}

/** Moves an item, with the items under it, to just before another item of
 *  the same list (or to the end of that list when `before` is null and
 *  `listEnd` names the list's last line). It takes the depth of the item it
 *  lands before, so a drag can also take it in or out a step. */
export function moveItemTo(note: string, from: number, before: number | null, listEnd?: number): { text: string; line: number } | null {
  const lines = note.split('\n')
  const span = itemSpan(note, from)
  if (!span) return null
  const [s0, s1] = span
  if (before !== null && before >= s0 && before < s1) return null
  const target = before ?? (listEnd != null ? listEnd + 1 : null)
  if (target === null || target === s0 || target === s1) return null
  const moving = lines.slice(s0, s1)
  const fromDepth = itemDepth(moving[0])!
  const toDepth = before !== null ? itemDepth(lines[before]) ?? fromDepth : fromDepth
  const shifted = shiftLines(moving, toDepth - fromDepth)
  const rest = [...lines.slice(0, s0), ...lines.slice(s1)]
  const at = target > s0 ? target - moving.length : target
  rest.splice(at, 0, ...shifted)
  return { text: rest.join('\n'), line: at }
}

/** Every line given in or out by `steps` levels (two spaces each), never
 *  past the left edge or deeper than three. */
function shiftLines(lines: string[], steps: number): string[] {
  if (!steps) return lines
  return lines.map((l) => {
    const m = /^([ \t]*)/.exec(l)!
    const width = indentWidth(m[1])
    const next = Math.max(0, Math.min(6, width + steps * 2))
    return ' '.repeat(next) + l.slice(m[1].length)
  })
}

/** Takes an item (and the items under it) in a step, or out a step. An item
 *  can go at most one step deeper than the item above it, so the list keeps
 *  its shape; the first item of a list stays at the edge. */
export function indentItem(note: string, line: number, dir: -1 | 1): { text: string; line: number } | null {
  const lines = note.split('\n')
  const depth = itemDepth(lines[line])
  if (depth === null) return null
  if (dir === -1 && depth === 0) return null
  if (dir === 1) {
    const above = itemDepth(lines[line - 1])
    if (above === null || depth + 1 > Math.min(3, above + 1)) return null
  }
  const [s0, s1] = itemSpan(note, line)!
  const out = [...lines.slice(0, s0), ...shiftLines(lines.slice(s0, s1), dir), ...lines.slice(s1)]
  return { text: out.join('\n'), line }
}

/** The toolbar's indent and outdent: every list line touched by the
 *  selection goes a step in or out. Other lines are left alone. */
export function indentSelection(text: string, start: number, end: number, dir: -1 | 1): Edit {
  if (start > end) [start, end] = [end, start]
  const from = text.lastIndexOf('\n', start - 1) + 1
  const stop = end > start && text[end - 1] === '\n' ? end - 1 : end
  const nl = text.indexOf('\n', stop)
  const to = nl === -1 ? text.length : nl
  const lines = text.slice(from, to).split('\n')
  const next = lines.map((l) => (LIST_LINE.test(bare(l)) ? shiftLines([l], dir)[0] : l))
  const out = text.slice(0, from) + next.join('\n') + text.slice(to)
  const firstDelta = next[0].length - lines[0].length
  const clamp = (n: number) => Math.max(from, Math.min(out.length, n))
  return { text: out, start: clamp(start + firstDelta), end: clamp(end + out.length - text.length) }
}

/** A list's items in the order to draw them. With "ticked last" on, ticked
 *  checklist items (with whatever sits under them) go below the rest, as on
 *  a paper list where the done things are crossed off at the bottom. The
 *  note's text keeps its own order; only the drawing changes. */
export function orderItems(items: Item[], tickedLast: boolean): Item[] {
  if (!tickedLast) return items
  const groups: Item[][] = []
  for (const it of items) {
    if (it.depth === 0 || !groups.length) groups.push([it])
    else groups[groups.length - 1].push(it)
  }
  const isDone = (g: Item[]) => g[0].kind === 'check' && g[0].done
  return [...groups.filter((g) => !isDone(g)), ...groups.filter(isDone)].flat()
}

// ---------- codes kept out of sight (NOT-17, NOT-21) ------------------------
// Two kinds of line carry a short code: the "ask after done" marker
// ({after-done:reading}) and a recipe's link line ("From recipe: Curry ·
// 4 portions {recipe:<id>}"). The editor shows the note without them: the
// marker as a sentence beside the box, the link line without its code.
// What the person types is put back together with the codes on save.

const MARKER_LINE = /^\{after-done:([a-z0-9-]{1,64})\}$/
const LINK_LINE = /^(From recipe: .+ · [\d.]+ portions?) \{recipe:([0-9a-f-]{36})\}$/

export interface Hidden {
  /** The template the note asks for once its task is done. */
  afterDone: string | null
  /** Each recipe link line as shown, with the recipe it points to. */
  links: { text: string; id: string }[]
}

/** The note as the editor shows it, and what was taken out. */
export function toEditable(note: string | null | undefined): { text: string; hidden: Hidden } {
  const hidden: Hidden = { afterDone: null, links: [] }
  const out: string[] = []
  for (const raw of (note ?? '').split('\n')) {
    const l = bare(raw)
    const marker = MARKER_LINE.exec(l)
    if (marker) { hidden.afterDone ??= marker[1]; continue }
    const link = LINK_LINE.exec(l)
    if (link) { hidden.links.push({ text: link[1], id: link[2] }); out.push(link[1]); continue }
    out.push(raw)
  }
  return { text: out.join('\n'), hidden }
}

/** The note to keep from what the editor shows: each link line still there
 *  gets its code back (a link line the person rewrote is just text now),
 *  and the marker goes back on a line of its own at the end. */
export function fromEditable(text: string, hidden: Hidden): string {
  const left = [...hidden.links]
  const lines = text.split('\n').map((raw) => {
    const i = left.findIndex((k) => k.text === bare(raw))
    if (i < 0) return raw
    const [k] = left.splice(i, 1)
    return `${k.text} {recipe:${k.id}}`
  })
  const body = lines.join('\n')
  if (!hidden.afterDone) return body
  const marker = `{after-done:${hidden.afterDone}}`
  return body === '' ? marker : `${body}\n${marker}`
}

/** A recipe link line, as the note page reads it ("From recipe: …"), or null. */
export function linkOnLine(line: string): { name: string; portions: number; id: string } | null {
  const m = /^From recipe: (.+) · ([\d.]+) portions? \{recipe:([0-9a-f-]{36})\}$/.exec(bare(line))
  return m ? { name: m[1], portions: Number(m[2]), id: m[3] } : null
}

/** Is this line the "ask after done" marker? Its template id, or null. */
export function markerOnLine(line: string): string | null {
  return MARKER_LINE.exec(bare(line))?.[1] ?? null
}
