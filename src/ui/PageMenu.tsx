import type { ReactNode } from 'react'
import { MoreMenu, type MenuItem } from './MoreMenu'
import './page-menu.css'

/** The one ⋮ at the top right of a page (v17, CALM-03): everything a page
 *  can do that is not its main action lives here: views, sort, grouping,
 *  select, export, edit module, about. One place, the same icon on every
 *  page, so nothing needs to sit on the page itself. Items the page does
 *  not have are passed as null and left out. */
export function PageMenu({ label = 'More for this page', items, sheets }: {
  label?: string
  items: (MenuItem | null | false)[]
  /** Sheets the items open (useExport's sheet and the like). */
  sheets?: ReactNode
}) {
  const list = items.filter((x): x is MenuItem => !!x)
  if (!list.length) return <>{sheets}</>
  return (
    <>
      <MoreMenu className="page-menu" label={label} items={list} />
      {sheets}
    </>
  )
}
