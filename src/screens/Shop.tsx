import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format } from 'date-fns'
import { db } from '../lib/db'
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
  const foods = useLiveQuery(() => db.food.toArray(), [], [])

  return (
    <div className="page">
      <div className="page-inner">
        <header className="page-head">
          <h1 className="page-date">Shopping</h1>
          <p className="page-sub">Wednesday and Saturday trips, filled from the meal plan.</p>
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
              <span><b>{lines.length}</b> items · {foods.length} foods known</span>
            </div>
            <DataTable
              fields={[
                { name: 'name', label: 'Item', type: 'text', width: 220 },
                { name: 'needed_g', label: 'Needed', type: 'number', unit: 'g', width: 90 },
                { name: 'from_stock_g', label: 'In stock', type: 'number', unit: 'g', width: 90 },
                { name: 'pack_size_g', label: 'Pack', type: 'number', unit: 'g', width: 80 },
                { name: 'packs', label: 'Packs', type: 'formula', formula: 'ceil((needed_g - from_stock_g) / pack_size_g)', width: 70 },
                { name: 'checked', label: 'Got it', type: 'boolean', width: 70 },
              ]}
              priority={['name', 'needed_g', 'packs', 'checked']}
              rows={lines as never}
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
