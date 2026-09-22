import type { Task } from './types'

export function isQuiet(now: Date, from: string, to: string): boolean {
  const mins = now.getHours() * 60 + now.getMinutes()
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  const start = fh * 60 + fm
  const end = th * 60 + tm
  // Quiet hours normally run past midnight, so the window wraps.
  return start <= end ? mins >= start && mins < end : mins >= start || mins < end
}

/** Written the way a person would say it: what, when, and an offer you can
 *  decline. Never a status code. */
export function reminderText(task: Task, persona: string | null): { title: string; body: string } {
  const at = task.planned_time?.slice(0, 5)
  const who = persona ? `${persona}` : 'GetIt'
  if (task.push_count >= 3) {
    return { title: who, body: `${task.title} has moved ${task.push_count} times. Want a new time for it?` }
  }
  return { title: who, body: at ? `${task.title} at ${at}.` : `${task.title} is next.` }
}

