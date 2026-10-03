import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PageMenu } from '../ui/PageMenu'
import type { MenuItem } from '../ui/MoreMenu'

/** Where the Food page's one ⋮ sits: a spot at the top right of its header,
 *  level with the title (CALM-03). Each tab knows what its menu holds (the
 *  Day's copy and export, the books and select of Recipes and Foods), so the
 *  tab draws the menu and it is carried up into the header from here. */
const Slot = createContext<HTMLElement | null>(null)

export const FoodMenuSlot = Slot.Provider

/** The tab's page menu, drawn in the header's spot. Its sheets stay with
 *  the tab. */
export function FoodPageMenu({ items, sheets }: { items: (MenuItem | null | false)[]; sheets?: ReactNode }) {
  const slot = useContext(Slot)
  return (
    <>
      {slot && createPortal(<PageMenu label="More for Food" items={items} />, slot)}
      {sheets}
    </>
  )
}
