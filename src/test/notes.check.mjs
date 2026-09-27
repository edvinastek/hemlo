// Checks the note's little Markdown: what the notes page draws, ticking a
// checklist line, the progress on Today, and what the toolbar buttons write.
import { parseNote, parseInline, toggleCheck, checklistProgress, hasNote, applyTool, continueList } from '../lib/notes.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// ---------- reading ----------------------------------------------------------
is('bold between pairs of stars', parseInline('a **b** c'), [{ text: 'a ', bold: false }, { text: 'b', bold: true }, { text: ' c', bold: false }])
is('a lone pair of stars stays as typed', parseInline('2 ** 3'), [{ text: '2 ** 3', bold: false }])
is('empty stars are not bold', parseInline('****'), [{ text: '****', bold: false }])
is('markup-looking text is only text', parseInline('<b>hi</b> & <script>'), [{ text: '<b>hi</b> & <script>', bold: false }])

const note = [
  '## Before the call',  // 0
  '- [ ] Print the **contract**', // 1
  '- [x] Book the room', // 2
  '  - [ ] Check the projector', // 3
  '- Bring water', // 4
  '', // 5
  'Ask about the', // 6
  'second site.', // 7
  '#notaheading', // 8
].join('\n')
const blocks = parseNote(note)
is('three blocks: heading, list, paragraph', blocks.map((b) => b.kind), ['heading', 'list', 'text'])
is('the heading keeps its level and line', [blocks[0].level, blocks[0].line, blocks[0].spans[0].text], [2, 0, 'Before the call'])
const items = blocks[1].items
is('list items in order with their kind', items.map((i) => `${i.kind}:${i.done}:${i.line}`), ['check:false:1', 'check:true:2', 'check:false:3', 'bullet:false:4'])
is('bold inside an item', items[0].spans, [{ text: 'Print the ', bold: false }, { text: 'contract', bold: true }])
is('an indented item sits one step in', items[2].depth, 1)
is('lines of text stay one paragraph, # without a space is text', blocks[2].lines.map((l) => l.spans[0].text), ['Ask about the', 'second site.', '#notaheading'])
is('a blank line ends a list', parseNote('- a\n\n- b').map((b) => b.kind), ['list', 'list'])
is('a heading marker with nothing after it is not drawn', parseNote('## \ntext').map((b) => b.kind), ['text'])
is('no note, nothing to draw', [parseNote(null), parseNote('')], [[], []])
is('* and + start items too, X ticks', parseNote('* [X] a\n+ b').at(0).items.map((i) => `${i.kind}:${i.done}`), ['check:true', 'bullet:false'])
is('Windows line ends are not part of the words', parseNote('- [ ] a\r\n- b\r\n').at(0).items.map((i) => i.spans[0].text), ['a', 'b'])

// ---------- ticking ----------------------------------------------------------
is('ticking a line changes only its box', toggleCheck(note, 1).split('\n')[1], '- [x] Print the **contract**')
is('and nothing else', toggleCheck(note, 1).split('\n').filter((l, i) => i !== 1), note.split('\n').filter((l, i) => i !== 1))
is('unticking', toggleCheck(note, 2).split('\n')[2], '- [ ] Book the room')
is('an indented line', toggleCheck(note, 3).split('\n')[3], '  - [x] Check the projector')
is('ticking twice gives the note back', toggleCheck(toggleCheck(note, 3), 3), note)
is('a line that is not a checklist item is left alone', [toggleCheck(note, 4), toggleCheck(note, 0), toggleCheck(note, 99)], [note, note, note])
is('Windows line ends survive a tick', toggleCheck('- [ ] a\r\n- [ ] b', 1), '- [ ] a\r\n- [x] b')
is('an item with no words yet can be ticked', toggleCheck('- [ ]', 0), '- [x]')

// ---------- progress ---------------------------------------------------------
is('progress counts every checklist item', checklistProgress(note), { done: 1, total: 3 })
is('bullets are not counted', checklistProgress('- a\n- b'), { done: 0, total: 0 })
is('no note, no progress', checklistProgress(null), { done: 0, total: 0 })
is('whether there is a note at all', [hasNote(null), hasNote(''), hasNote('  \n'), hasNote('x')], [false, false, false, true])

// ---------- toolbar ----------------------------------------------------------
const at = (text, start, end, tool) => applyTool(text, start, end ?? start, tool)
is('checklist on an empty note', at('', 0, 0, 'check'), { text: '- [ ] ', start: 6, end: 6 })
is('checklist on a line puts the box at its start', at('buy milk', 3, 3, 'check'), { text: '- [ ] buy milk', start: 9, end: 9 })
is('checklist again takes it off', at('- [ ] buy milk', 9, 9, 'check'), { text: 'buy milk', start: 3, end: 3 })
is('checklist turns a bullet into a box', at('- buy milk', 4, 4, 'check').text, '- [ ] buy milk')
is('bullet turns a box into a bullet', at('- [x] buy milk', 8, 8, 'bullet').text, '- buy milk')
is('only the cursor’s line changes', at('one\ntwo\nthree', 5, 5, 'bullet').text, 'one\n- two\nthree')
is('a selection over lines marks each', at('one\ntwo\nthree', 1, 9, 'check').text, '- [ ] one\n- [ ] two\n- [ ] three')
is('a selection ending at a line break stops there', at('one\ntwo', 0, 4, 'bullet').text, '- one\ntwo')
is('an indent is kept', at('  sub', 3, 3, 'check').text, '  - [ ] sub')
is('heading', at('Plan', 0, 0, 'heading'), { text: '## Plan', start: 3, end: 3 })
is('heading again takes it off', at('## Plan', 7, 7, 'heading').text, 'Plan')
is('heading replaces a list marker', at('- Plan', 2, 2, 'heading').text, '## Plan')
is('bold with nothing selected', at('ab', 1, 1, 'bold'), { text: 'a****b', start: 3, end: 3 })
is('bold wraps the selection and keeps it selected', at('say hello now', 4, 9, 'bold'), { text: 'say **hello** now', start: 6, end: 11 })
is('a trailing space from a double-tap stays outside', at('say hello now', 4, 10, 'bold').text, 'say **hello** now')
is('bold on bold words takes it off', at('say **hello** now', 6, 11, 'bold'), { text: 'say hello now', start: 4, end: 9 })
is('a backwards selection works', at('say hello now', 9, 4, 'bold').text, 'say **hello** now')

// ---------- Enter in a list --------------------------------------------------
is('Enter after an item starts the next, unticked', continueList('- [x] one', 9, 9), { text: '- [x] one\n- [ ] ', start: 16, end: 16 })
is('Enter after a bullet starts a bullet at the same indent', continueList('  - one', 7, 7), { text: '  - one\n  - ', start: 12, end: 12 })
is('Enter on an empty item ends the list', continueList('- [ ] one\n- [ ] ', 16, 16), { text: '- [ ] one\n', start: 10, end: 10 })
is('Enter on plain text is just Enter', continueList('hello', 5, 5), null)
is('Enter inside the marker is just Enter', continueList('- [ ] one', 2, 2), null)
is('Enter over a selection is just Enter', continueList('- one', 2, 5), null)

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
