import { useRef } from 'react'
import { useApp } from '../lib/store'
import { StockPanel } from '../sections/Stock'
import { ShopList } from '../sections/ShopList'
import { Stores } from '../sections/Stores'
import { useDeviceChoice } from '../sections/shop-ui'

const SECTIONS = ['List', 'Stock', 'Stores'] as const
type Section = typeof SECTIONS[number]

/** Shopping: the household's list (what the planned meals need, less what
 *  is in the cupboard, and what anyone added by hand), the cupboard itself,
 *  and the shops with their aisles and prices. The round + adds to the tab
 *  that is open. */
export function Shop() {
  const profile = useApp((s) => s.profile)
  const [stored, setSection] = useDeviceChoice<string>('shop:tab', 'List')
  const section: Section = (SECTIONS as readonly string[]).includes(stored) ? stored as Section : 'List'
  const addRef = useRef<HTMLInputElement>(null)

  return (
    <div className="page">
      <div className="page-inner">
        <header className="page-head">
          <h1 className="page-date">Shopping</h1>
          <p className="page-sub">
            {section === 'List' ? 'What the planned meals need, less the cupboard, and what you add. Shared with your household.'
              : section === 'Stock' ? 'What is in the cupboard, fridge and freezer. Every list is worked out against it.'
                : 'Your shops, their aisle order and the prices you note.'}
          </p>
          <div className="tabs" role="tablist">
            {SECTIONS.map((s) => (
              <button key={s} role="tab" aria-selected={s === section} onClick={() => setSection(s)}>{s}</button>
            ))}
          </div>
        </header>

        {profile && section === 'List' && <ShopList profile={profile} addRef={addRef} />}
        {profile && section === 'Stock' && <StockPanel profile={profile} />}
        {profile && section === 'Stores' && <Stores profile={profile} addRef={addRef} />}
      </div>
      <button type="button" className="fab"
        aria-label={section === 'List' ? 'Add an item' : section === 'Stock' ? 'Add to stock' : 'Add a shop'}
        onClick={() => {
          // The add field of the tab that is open: the list's, the cupboard's
          // food search, or the shop name.
          const field = section === 'Stock' ? document.querySelector<HTMLInputElement>('.stock-add input') : addRef.current
          field?.scrollIntoView({ block: 'center', behavior: 'smooth' })
          field?.focus()
        }}>+</button>
    </div>
  )
}
