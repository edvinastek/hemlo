/** The task sheet's pure parts (TSK-01, TSK-24, TSK-26): a duplicate to
 *  edit before saving, a task saved as a template and a new task started
 *  from one. No database, no React. */
import { fillTemplate, templateId, type NoteTemplate, type TaskTemplate } from './template-rules.ts'
import { afterDoneMarker } from './after-done-rules.ts'
import { cleanRule, type RuleConfig, type RuleKind } from './schedule-rules.ts'
import type { Task } from './types'

/** TSK-24: the task as a new one, everything kept so anything can be
 *  changed before saving: a fresh id, not done, no history, and no series
 *  (a duplicate of a repeating day is a one-off until it is given a repeat). */
export function duplicateOf(t: Task, id: string, now: string): Task {
  return {
    ...t, id, series_id: null, status: 'todo', push_count: 0, extension_count: 0, needs_review: false,
    completed_at: null, deleted_at: null, updated_at: now,
    // A task another part of the app made (a meal, a module's record) is
    // the person's own once duplicated.
    source: 'manual', source_ref: null,
  }
}

export interface RepeatLike { rule: RuleKind | null; rule_config: RuleConfig; end_date: string | null; count?: number | null }

/** TSK-26: a task kept as a template: its title, length, section, lock,
 *  note and repeat (the repeat's last day is not kept: it belongs to one
 *  run of it; a count of times is). */
export function templateOfTask(t: Pick<Task, 'title' | 'duration_min' | 'category' | 'locked' | 'notes'>, name: string, repeat: RepeatLike | null, taken: string[]): TaskTemplate {
  const clean = name.trim().slice(0, 60) || t.title.trim().slice(0, 60) || 'Task'
  const r = repeat?.rule ? cleanRule(repeat.rule, repeat.rule_config) : null
  return {
    id: templateId(clean, taken), name: clean, title: t.title.trim().slice(0, 200) || clean,
    minutes: t.duration_min ?? null, section: t.category ?? null, locked: !!t.locked,
    note_template_id: null, note: t.notes ?? null,
    ...(r?.rule ? { repeat: { rule: r.rule, rule_config: r.rule_config as Record<string, unknown>, count: repeat?.count ?? null } } : {}),
  }
}

/** A new task's draft from a template, on its day. A note template the
 *  template points to is filled in for that day (an "ask after done" one
 *  leaves its marker); otherwise the template's own note. */
export function applyTaskTemplate(draft: Task, tpl: TaskTemplate, notes: NoteTemplate[]): Task {
  const nt = tpl.note_template_id ? notes.find((n) => n.id === tpl.note_template_id) : undefined
  const day = draft.planned_date ?? new Date().toISOString().slice(0, 10)
  const note = nt ? (nt.after_done ? afterDoneMarker(nt.id) : fillTemplate(nt.body, { day, title: tpl.title, time: draft.planned_time })) : tpl.note
  return { ...draft, title: tpl.title, duration_min: tpl.minutes, category: tpl.section, locked: tpl.locked, notes: note || null }
}

/** The repeat a template brings, in the repeat control's shape, or none. */
export function templateRepeat(tpl: TaskTemplate): RepeatLike | null {
  if (!tpl.repeat) return null
  const r = cleanRule(tpl.repeat.rule, tpl.repeat.rule_config)
  if (!r.rule || r.rule === 'times_per_week') return null
  return { rule: r.rule, rule_config: r.rule_config, end_date: null, count: tpl.repeat.count ?? null }
}

/** Put a template in the list, replacing one with the same id. */
export function withTaskTemplate(list: TaskTemplate[], t: TaskTemplate): TaskTemplate[] {
  return list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t].slice(-100)
}
