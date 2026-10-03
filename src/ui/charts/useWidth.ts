import { useLayoutEffect, useState, type RefObject } from 'react'

/** The width an element is drawn at, kept up to date as the screen turns or
 *  the window is resized, so charts are drawn at their real size (text
 *  never stretched). 0 until it is known. */
export function useWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(Math.floor(el.getBoundingClientRect().width))
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0)
      setWidth((old) => (old === w ? old : w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}
