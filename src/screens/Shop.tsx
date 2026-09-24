import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format } from 'date-fns'
import { getMeta, setMeta } from '../lib/db'
import { useApp } from '../lib/store'
import { DataTable } from '../ui/DataTable'
import { tripFromPlan, type TripLine } from '../lib/shopping'

const SECTIONS = ['Trip', 'Stock', 'Stores']

/** What the plan needs up to the next trip, less what is already in the
 *  cupboard, rounded up to whole packs. Nothing here is typed by hand. */
export function Shop() {
  const [section, setSection] = useState('Trip')
  const profile = useApp((s) => s.profile)
  const today = format(new Date(), 'yyyy-MM-dd')
  const until = format(addDays(new Date(), 3), 'yyyy-MM-dd')

  const lines = useLiveQuery(
    async () => (profile ? tripFromPlan(profile.id, today, until) : []),
    [profile?.id, today], [] as TripLine[],
  )

  // What has gone in the basket is remembered on this device for the trip, so
  // a phone that locks mid-aisle does not lose the ticks.
  const tripKey = `shop:checked:${today}`
  const checked = useLiveQuery(() => getMeta<string[]>(tripKey, []), [tripKey], [] as string[])
  const rows = lines.map((l) => ({ ...l, checked: checked.includes(l.id) }))
  async function tick(row: TripLine, _field: string, value: unknown) {
    const next = value ? [...new Set([...checked, row.id])] : checked.filter((id) => id !== row.id)
    await setMeta(tripKey, next)
  }

  return (
    <div className="page">
      <div className="page-inner">
        <header className="page-head">
          <h1 className="page-date">Shopping</h1>
          <p className="page-sub">Everything the next four days of meals need, in the weights a shop sells.</p>
          <div className="tabs" role="tablist">
            {SECTIONS.map((s) => (
              <button key={s} role="tab" aria-selected={s === section} onClick={() => setSection(s)}>{s}</button>
            ))}
          </div>
        </header>

        {section === 'Trip' && (
          <>
            <div className="totals">
              <span>Covering {format(new Date(), 'd MMM')} to {format(addDays(new Date(), 3), 'd MMM')}</span>
              <span><b>{lines.length - checked.filter((id) => lines.some((l) => l.id === id)).length}</b> of {lines.length} left</span>
            </div>
            <DataTable
              // Pack columns appear only once foods have pack sizes; a column of
              // dashes tells a shopper nothing.
              fields={[
                { name: 'name', label: 'Item', type: 'text', width: 220 },
                { name: 'needed_g', label: 'Needed', type: 'number', unit: 'g', width: 90 },
                ...(rows.some((r) => r.pack_size_g) ? [
                  { name: 'pack_size_g', label: 'Pack', type: 'number' as const, unit: 'g', width: 80 },
                  { name: 'packs', label: 'Packs', type: 'formula' as const, formula: 'ceil((needed_g - from_stock_g) / pack_size_g)', width: 70 },
                ] : []),
                { name: 'checked', label: 'Got it', type: 'boolean', width: 70 },
              ]}
              priority={['name', 'needed_g', 'checked']}
              rows={rows as never}
              editable={['checked']}
              onChange={(row, field, value) => void tick(row as never, field, value)}
              emptyNote="No trip planned. Plan some meals first and the list fills itself."
            />
          </>
        )}

        {section === 'Stock' && (
          <p className="empty">
            Stock is what is in the cupboard now. It is subtracted from every trip, which is
            why the list never tells you to buy rice you already have.
          </p>
        )}

        {section === 'Stores' && (
          <p className="empty">
            Stores hold pack sizes and prices. Start with the ones you actually use and type
            a price when you notice it; nothing here needs a shop's catalogue to work.
          </p>
        )}
      </div>
    </div>
  )
}
