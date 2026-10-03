// Checks the two-stage hold (TOD-10): a tap opens, a short hold then a move
// drags, a longer still hold expands, moving early is a scroll, and rows that
// cannot be dragged only expand. Times are the defaults: 350 ms and 800 ms.
import { holdStep, nextAt, cleanHold, IDLE, SLOP, DEFAULT_HOLD, seconds } from '../lib/hold-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

const T = DEFAULT_HOLD
/** Runs events from idle; gives the actions in order and the last phase. */
function run(events, { canDrag = true, canExpand = true } = {}) {
  let s = IDLE
  const actions = []
  for (const e of [{ type: 'down', x: 100, y: 100, t: 0, canDrag, canExpand }, ...events]) {
    const r = holdStep(s, e, T)
    s = r.state
    if (r.action !== 'none') actions.push(r.action)
  }
  return { actions, phase: s.phase }
}

is('a quick tap is a tap', run([{ type: 'up' }]), { actions: ['tap'], phase: 'idle' })
is('a small wobble during a tap is still a tap', run([{ type: 'move', x: 104, y: 103 }, { type: 'up' }]), { actions: ['tap'], phase: 'idle' })
is('moving before the short hold is a scroll, never a drag',
  run([{ type: 'move', x: 100, y: 100 + SLOP + 1 }, { type: 'time', t: 400 }, { type: 'move', x: 100, y: 200 }, { type: 'up' }]),
  { actions: ['forget'], phase: 'idle' })
is('the short hold arms the drag (one buzz)', run([{ type: 'time', t: 350 }]), { actions: ['arm'], phase: 'armed' })
is('not yet at 349 ms', run([{ type: 'time', t: 349 }]), { actions: [], phase: 'pressing' })
is('armed, then a move drags',
  run([{ type: 'time', t: 350 }, { type: 'move', x: 100, y: 120 }, { type: 'move', x: 100, y: 160 }, { type: 'up' }]),
  { actions: ['arm', 'drag', 'drag-move', 'drop'], phase: 'idle' })
is('armed, a tiny move does not start the drag', run([{ type: 'time', t: 350 }, { type: 'move', x: 103, y: 104 }]), { actions: ['arm'], phase: 'armed' })
is('held still to the long hold expands (second buzz)',
  run([{ type: 'time', t: 350 }, { type: 'time', t: 800 }, { type: 'up' }]),
  { actions: ['arm', 'expand', 'quiet'], phase: 'idle' })
is('letting go between the stages does nothing (no surprise open)',
  run([{ type: 'time', t: 350 }, { type: 'up' }]), { actions: ['arm', 'quiet'], phase: 'idle' })
is('once dragging, the long hold never expands',
  run([{ type: 'time', t: 350 }, { type: 'move', x: 100, y: 130 }, { type: 'time', t: 900 }, { type: 'up' }]),
  { actions: ['arm', 'drag', 'drop'], phase: 'idle' })
is('a late clock tick that skipped the first stage still expands',
  run([{ type: 'time', t: 900 }]), { actions: ['expand'], phase: 'expanded' })
is('cancelled mid-drag puts it back',
  run([{ type: 'time', t: 350 }, { type: 'move', x: 100, y: 130 }, { type: 'cancel' }]),
  { actions: ['arm', 'drag', 'cancel-drag'], phase: 'idle' })
is('cancelled before anything is forgotten', run([{ type: 'cancel' }]), { actions: ['forget'], phase: 'idle' })

// Rows that cannot be dragged: only the long hold.
const still = { canDrag: false }
is('no drag: no buzz at the short hold', run([{ type: 'time', t: 350 }], still), { actions: [], phase: 'pressing' })
is('no drag: the long hold expands', run([{ type: 'time', t: 800 }, { type: 'up' }], still), { actions: ['expand', 'quiet'], phase: 'idle' })
is('no drag: moving is a scroll', run([{ type: 'move', x: 140, y: 100 }], still), { actions: ['forget'], phase: 'idle' })
is('drag only (old lists): no expand, ever', run([{ type: 'time', t: 350 }, { type: 'time', t: 5000 }], { canExpand: false }), { actions: ['arm'], phase: 'armed' })

// When the clock matters next.
const pressing = holdStep(IDLE, { type: 'down', x: 0, y: 0, t: 1000, canDrag: true, canExpand: true }, T).state
is('next tick at the short hold', nextAt(pressing, T), 1350)
is('then at the long hold', nextAt({ ...pressing, phase: 'armed' }, T), 1800)
is('a row that only expands waits for the long hold', nextAt({ ...pressing, canDrag: false }, T), 1800)
is('a drag-only row stops the clock once armed', nextAt({ ...pressing, phase: 'armed', canExpand: false }, T), null)
is('nothing while dragging', nextAt({ ...pressing, phase: 'dragging' }, T), null)
is('a second down while held is ignored', holdStep(pressing, { type: 'down', x: 5, y: 5, t: 1100, canDrag: true, canExpand: true }, T).state, pressing)

// The settings, kept sane.
is('defaults', cleanHold(undefined), { drag_ms: 350, expand_ms: 800 })
is('expand is kept 200 ms after drag', cleanHold({ drag_ms: 700, expand_ms: 750 }), { drag_ms: 700, expand_ms: 900 })
is('limits', cleanHold({ drag_ms: 20, expand_ms: 99999 }), { drag_ms: 150, expand_ms: 3000 })
is('nonsense falls back', cleanHold({ drag_ms: 'x', expand_ms: null }), { drag_ms: 350, expand_ms: 800 })
is('custom times step with the clock', holdStep({ ...pressing, t: 0 }, { type: 'time', t: 500 }, { drag_ms: 500, expand_ms: 1200 }).action, 'arm')
is('seconds', [seconds(350), seconds(800), seconds(1000), seconds(1250)], ['0.35 s', '0.8 s', '1 s', '1.25 s'])

if (fail) { console.error(`\n${fail} failed`); process.exit(1) }
console.log('\nhold: all good')
