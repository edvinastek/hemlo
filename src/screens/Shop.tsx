import { useState } from 'react'
import { useApp } from '../lib/store'
import { StockPanel } from '../sections/Stock'
import { ShopList } from '../sections/ShopList'
import { Stores } from '../sections/Stores'
import { useDeviceChoice } from '../sections/shop-ui'

const SECTIONS = ['List', 'Stock', 'Stores'] as const
type Section = typeof SECTIONS[number]

/** Shopping: the household's list (what the planned meals need, less what
 *  is in the cupboard, and what anyone added by hand), the cupboard itself,
 *  and the shops with their aisles and prices.
 *
 *  Calm (v17): no subtitle and no round +; each tab's add field is its main
 *  action (CALM-01). Whatever else a tab can do sits in the one ⋮ by the
 *  title (CALM-03), which the open tab fills in through `menuSlot`. */
export function Shop() {
  const profile = useApp((s) => s.profile)
  const [stored, setSection] = useDeviceChoice<string>('shop:tab', 'List')
  const section: Section = (SECTIONS as readonly string[]).includes(stored) ? stored as Section : 'List'
  // Where the open tab puts its ⋮: level with the title.
  const [menuSlot, setMenuSlot] = useState<HTMLElement | null>(null)

  return (
    <div className="page">
      <div className="page-inner">
        <header className="page-head">
          <div className="shop-title">
            <h1 className="page-date">Shopping</h1>
            <span ref={setMenuSlot} className="shop-menu-slot" />
          </div>
          <div className="tabs" role="tablist">
            {SECTIONS.map((s) => (
              <button key={s} role="tab" aria-selected={s === section} onClick={() => setSection(s)}>{s}</button>
            ))}
          </div>
        </header>

        {profile && section === 'List' && <ShopList profile={profile} menuSlot={menuSlot} />}
        {profile && section === 'Stock' && <StockPanel profile={profile} menuSlot={menuSlot} />}
        {profile && section === 'Stores' && <Stores profile={profile} menuSlot={menuSlot} />}
      </div>
    </div>
  )
}
