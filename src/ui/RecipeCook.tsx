import { useEffect, useId, useState } from 'react'
import { clockText, durationText, isDue, splitSteps, stepTimers, timeLeft, type RunningTimer } from '../lib/cook-rules'
import { offerAction } from './Undo'
import {
  clearRungTimers, keepScreenOn, whenTimerRings, pauseCookTimer, primeSound, resumeCookTimer, startCookTimer, stopCookTimer, useCookTimers,
} from '../lib/recipe-cook'
import { useBackClose } from './useBackClose'
import type { Recipe } from '../lib/types'
import './recipes.css'

// A timer that ends while cook mode is closed says so in the bar at the foot.
whenTimerRings((t) => offerAction(`Timer done: ${t.label}`, 'OK', () => undefined))

export interface CookLine { id: string; name: string; amount: string }

/** Cook mode (REC-12): the recipe's steps one at a time in big type, with
 *  Back and Next, the screen kept on while it is open, and a timer button
 *  for every time a step mentions ("simmer 20 min"). The ingredients for
 *  the portions shown come first, when there are any. Timers keep running
 *  from step to step and when cook mode is closed (recipe-cook.ts). */
export function RecipeCook({ recipe, lines, portions, onClose }: { recipe: Recipe; lines: CookLine[]; portions: number; onClose: () => void }) {
  const titleId = useId()
  const steps = splitSteps(recipe.steps)
  const pages = lines.length ? ['ingredients', ...steps.map((_, i) => i)] : steps.map((_, i) => i)
  const [page, setPage] = useState(0)
  const timers = useCookTimers((s) => s.timers)
  const now = useCookTimers((s) => s.now)
  const close = () => { clearRungTimers(); onClose() }
  useBackClose(close)

  // The screen stays on while cooking.
  useEffect(() => keepScreenOn(), [])
  // The arrow keys turn the page, as Back and Next do.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') setPage((p) => Math.min(pages.length - 1, p + 1))
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [pages.length])

  const current = pages[page]
  const stepIndex = typeof current === 'number' ? current : null
  const step = stepIndex !== null ? steps[stepIndex] : null
  const found = step ? stepTimers(step) : []
  const idOf = (i: number) => `${recipe.id}:${stepIndex}:${i}`
  // Timers of other steps still going, so they are never out of sight.
  const elsewhere = timers.filter((t) => t.id.startsWith(`${recipe.id}:`) && !found.some((_, i) => idOf(i) === t.id))
  const last = page === pages.length - 1
  const position = stepIndex !== null ? `Step ${stepIndex + 1} of ${steps.length}` : 'Ingredients'

  return (
    <>
      <div className="sheet-scrim" onClick={close} />
      <div className="bottom-sheet cook" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="cook-head">
          <h2 id={titleId}>{recipe.name}</h2>
          <button type="button" className="slot-link cook-close" onClick={close}>Close</button>
        </div>
        <p className="cook-where" aria-live="polite">{position}</p>

        {elsewhere.length > 0 && (
          <ul className="cook-others" aria-label="Other timers">
            {elsewhere.map((t) => <li key={t.id}><TimerRow timer={t} now={now} compact /></li>)}
          </ul>
        )}

        <div className="cook-page">
          {current === 'ingredients' ? (
            <>
              <p className="cook-sub">For {portions} {portions === 1 ? 'portion' : 'portions'}</p>
              <ul className="cook-lines">
                {lines.map((l) => <li key={l.id}><span>{l.name}</span><span className="cook-amount">{l.amount}</span></li>)}
              </ul>
            </>
          ) : (
            <p className="cook-step">{step}</p>
          )}
        </div>

        {found.length > 0 && (
          <div className="cook-timers">
            {found.map((f, i) => {
              const running = timers.find((t) => t.id === idOf(i))
              return running ? <TimerRow key={i} timer={running} now={now} /> : (
                <button key={i} type="button" className="btn cook-start"
                  onClick={() => { primeSound(); startCookTimer(idOf(i), `${durationText(f.seconds)} · ${clip(step!)}`, f.seconds) }}>
                  Start {durationText(f.seconds)}
                </button>
              )
            })}
          </div>
        )}

        <div className="cook-nav">
          <button type="button" className="btn cook-big" disabled={page === 0} onClick={() => setPage(page - 1)}>Back</button>
          {last
            ? <button type="button" className="btn btn-primary cook-big" onClick={close}>Done</button>
            : <button type="button" className="btn btn-primary cook-big" onClick={() => setPage(page + 1)}>Next</button>}
        </div>
      </div>
    </>
  )
}

const clip = (s: string) => (s.length > 40 ? `${s.slice(0, 39).trimEnd()}…` : s)

/** One running timer: its clock, and Pause or Resume and Stop. */
function TimerRow({ timer, now, compact = false }: { timer: RunningTimer; now: number; compact?: boolean }) {
  const left = timeLeft(timer, now)
  const done = timer.rang || isDue(timer, now)
  return (
    <div className={`cook-timer${done ? ' is-done' : ''}${compact ? ' is-compact' : ''}`} role="timer" aria-live={done ? 'assertive' : 'off'}>
      <span className="cook-clock">{done ? 'Done' : clockText(left)}</span>
      {compact && <span className="cook-label">{timer.label}</span>}
      {!done && (timer.pausedLeft !== null
        ? <button type="button" className="btn" onClick={() => resumeCookTimer(timer.id)}>Resume</button>
        : <button type="button" className="btn" onClick={() => pauseCookTimer(timer.id)}>Pause</button>)}
      <button type="button" className="btn" onClick={() => stopCookTimer(timer.id)}>{done ? 'OK' : 'Stop'}</button>
    </div>
  )
}
