import { useEffect, useState } from 'react'

/** The sheet is the right shape on a desktop and the wrong one on a phone:
 *  seven columns at 390 px clips the names it exists to show. Screens ask this
 *  and drop to the columns that matter. */
export function useNarrow(maxWidth = 700): boolean {
  const [narrow, setNarrow] = useState(
    typeof window === 'undefined' ? false : window.innerWidth <= maxWidth,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [maxWidth])
  return narrow
}
