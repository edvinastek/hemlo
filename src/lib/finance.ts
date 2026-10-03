import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { edit } from './write'
import { queueChange } from './sync'
import type { ModuleRecord } from './types'
import { describeSchedule } from './schedule-rules'
import {
  entryForPayment, financeSeries, paidEntry, paymentMeta, readFinanceSettings, readPayment, type Category, type FinanceSettings, type Kind, type Payment,
} from './finance-rules'
import type { PaymentSource } from './day-items-rules'
import { ensureInstance, instanceFor } from '../modules/defs'

/** Finance on the device. Entries and planned payments are Finance records
 *  (module_record: entity 'entry' and 'payment'), so they sync like every
 *  module's records and an entry's fields can still be shaped in Edit
 *  module; the category list, budgets and currency are the module's own
 *  settings for the profile. The arithmetic is in finance-rules.ts. */

const now = () => new Date().toISOString()
const MODULE = 'finance'

/* ---------- settings ---------------------------------------------------------- */

export function useFinanceSettings(profileId: string | null | undefined): FinanceSettings | undefined {
  return useLiveQuery(async () => (profileId ? readFinanceSettings((await instanceFor(profileId, MODULE))?.settings) : undefined), [profileId])
}

/** Change some of Finance's settings (the list, budgets, currency); the rest stay. */
export async function saveFinanceSettings(profileId: string, change: Partial<FinanceSettings>): Promise<void> {
  const inst = await ensureInstance(profileId, MODULE, true)
  const current = (await db.module_instance.get(inst.id)) ?? inst
  const s = readFinanceSettings(current.settings)
  await edit('module_instance', current, { settings: { ...(current.settings ?? {}), ...s, ...change } })
}

export const saveCategories = (profileId: string, categories: Category[]) => saveFinanceSettings(profileId, { categories })

/** A month's own budget for a category (null takes it back to the standing one). */
export async function setMonthBudget(profileId: string, month: string, category: string, amount: number | null): Promise<void> {
  const inst = await instanceFor(profileId, MODULE)
  const s = readFinanceSettings(inst?.settings)
  const row = { ...(s.months[month] ?? {}) }
  if (amount == null) delete row[category]
  else row[category] = amount
  const months = { ...s.months, [month]: row }
  if (!Object.keys(row).length) delete months[month]
  await saveFinanceSettings(profileId, { months })
}

/** Rename a category in the list and in every entry and payment that uses
 *  it, so the history follows the new name. */
export async function renameCategoryEverywhere(profileId: string, from: string, to: string): Promise<void> {
  if (from === to) return
  const rows = await db.module_record.where('[profile_id+module_key]').equals([profileId, MODULE]).toArray()
  for (const r of rows) {
    if (r.deleted_at || typeof r.data?.category !== 'string') continue
    if (r.data.category.trim().toLowerCase() === from.trim().toLowerCase()) await edit('module_record', r, { data: { ...r.data, category: to } })
  }
}

/* ---------- entries ------------------------------------------------------------- */

export function useEntries(profileId: string | null | undefined): ModuleRecord[] | undefined {
  return useLiveQuery(async () => profileId
    ? (await db.module_record.where('[profile_id+module_key]').equals([profileId, MODULE]).toArray()).filter((r) => !r.deleted_at && r.entity === 'entry')
    : [], [profileId])
}

export interface EntryDraft { entry_date: string; kind: Kind; amount: number; category: string | null; note: string | null }

async function putRecord(profileId: string, entity: 'entry' | 'payment', data: Record<string, unknown>, recordDate: string | null, existing?: ModuleRecord): Promise<ModuleRecord> {
  if (existing) {
    const current = (await db.module_record.get(existing.id)) ?? existing
    return edit<ModuleRecord>('module_record', current, { data: { ...current.data, ...data }, record_date: recordDate, deleted_at: null })
  }
  const row: ModuleRecord = {
    id: crypto.randomUUID(), profile_id: profileId, module_key: MODULE, entity, data, record_date: recordDate,
    created_at: now(), updated_at: now(), deleted_at: null,
  }
  await db.module_record.put(row)
  await queueChange('module_record', row, ['profile_id', 'module_key', 'entity', 'data', 'record_date', 'deleted_at'])
  return row
}

export async function saveEntry(profileId: string, d: EntryDraft, existing?: ModuleRecord): Promise<ModuleRecord> {
  const data = { entry_date: d.entry_date, kind: d.kind, amount: d.amount, category: d.category, note: d.note?.trim() || null }
  return putRecord(profileId, 'entry', data, d.entry_date, existing)
}

export async function deleteRecordRow(r: ModuleRecord): Promise<void> {
  await edit('module_record', (await db.module_record.get(r.id)) ?? r, { deleted_at: now() })
}
export async function restoreRecordRow(r: ModuleRecord): Promise<void> {
  await edit('module_record', (await db.module_record.get(r.id)) ?? r, { deleted_at: null })
}

/* ---------- planned payments (FIN-04) --------------------------------------------- */

export function usePayments(profileId: string | null | undefined): { row: ModuleRecord; payment: Payment }[] | undefined {
  return useLiveQuery(async () => profileId
    ? (await db.module_record.where('[profile_id+module_key]').equals([profileId, MODULE]).toArray())
      .filter((r) => !r.deleted_at && r.entity === 'payment').map((row) => ({ row, payment: readPayment(row) }))
      .sort((a, b) => a.payment.name.localeCompare(b.payment.name))
    : [], [profileId])
}

export type PaymentDraft = Omit<Payment, 'id' | 'deleted_at'>

export async function savePayment(profileId: string, d: PaymentDraft, existing?: ModuleRecord): Promise<ModuleRecord> {
  const data = {
    name: d.name.trim(), amount: d.amount, kind: d.kind, category: d.category, rule: d.rule, rule_config: d.rule_config,
    start_date: d.start_date, end_date: d.end_date, time: d.time, note: d.note?.trim() || null, active: d.active,
  }
  // No record date: a payment is shown by its schedule, not as a dated record.
  return putRecord(profileId, 'payment', data, null, existing)
}

/** Mark a payment's day paid (it writes the entry) or not paid (the entry
 *  goes). Returns the entry made or removed, for Undo. For Today, Plan and
 *  the widget when a "… due" item is ticked. */
export async function togglePaid(profileId: string, paymentId: string, day: string, today: string): Promise<{ made?: ModuleRecord; removed?: ModuleRecord }> {
  const rows = await db.module_record.where('[profile_id+module_key]').equals([profileId, MODULE]).toArray()
  const entries = rows.filter((r) => r.entity === 'entry' && !r.deleted_at)
  const had = paidEntry(entries, paymentId, day)
  if (had) { await deleteRecordRow(had as ModuleRecord); return { removed: had as ModuleRecord } }
  const row = rows.find((r) => r.id === paymentId)
  if (!row) return {}
  const data = entryForPayment(readPayment(row), day, day <= today ? day : today)
  return { made: await putRecord(profileId, 'entry', data, data.entry_date as string) }
}

/** What the day list needs from Finance for a range (day-items-rules.ts):
 *  the planned payments with their line, and which days are paid. Nothing
 *  while Finance is off. */
export async function financeDaySources(profileId: string, from: string, to: string): Promise<{ payments: PaymentSource[]; paidPayments: { payment_id: string; due_date: string; entry_id: string }[] }> {
  const inst = await instanceFor(profileId, MODULE)
  if (!inst?.enabled) return { payments: [], paidPayments: [] }
  const s = readFinanceSettings(inst.settings)
  const rows = await db.module_record.where('[profile_id+module_key]').equals([profileId, MODULE]).toArray()
  const payments: PaymentSource[] = rows.filter((r) => r.entity === 'payment' && !r.deleted_at).map(readPayment)
    .filter((p) => p.active && p.start_date && p.start_date <= to)
    .map((p) => ({
      ...p,
      meta: paymentMeta(p, s.currency, p.rule && p.start_date
        ? describeSchedule({ rule: p.rule, rule_config: p.rule_config, start_date: p.start_date, end_date: p.end_date }).toLowerCase()
        : 'once'),
    }))
  const paidPayments = rows.filter((r) => r.entity === 'entry' && !r.deleted_at && typeof r.data?.payment_id === 'string'
    && typeof r.data?.due_date === 'string' && r.data.due_date >= from && r.data.due_date <= to)
    .map((r) => ({ payment_id: r.data.payment_id as string, due_date: r.data.due_date as string, entry_id: r.id }))
  return { payments, paidPayments }
}

/** A value per day for one of Finance's measures (FINANCE_MEASURES in
 *  finance-rules.ts), for the stats builder, optionally for one category. */
export async function loadFinanceSeries(profileId: string, measure: 'expense' | 'income' | 'net', from: string, to: string, category?: string): Promise<Record<string, number>> {
  const s = readFinanceSettings((await instanceFor(profileId, MODULE))?.settings)
  const entries = (await db.module_record.where('[profile_id+module_key]').equals([profileId, MODULE]).toArray())
    .filter((r) => r.entity === 'entry' && !r.deleted_at)
  const all = financeSeries(entries, measure, s.categories, category)
  return Object.fromEntries(Object.entries(all).filter(([d]) => d >= from && d <= to))
}
