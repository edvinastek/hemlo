import { useEffect, useRef } from 'react'

/** Back (the phone's back button or gesture, the browser's Back) and Escape
 *  close the sheet on top, and only that one (TSK-09).
 *
 *  An open sheet adds a step to the page's history. Back takes that step
 *  away, which closes the sheet instead of leaving the page. A sheet closed
 *  any other way (Cancel, Save, a tap on the dimmed page) takes its own
 *  step back, so history never fills with dead steps. Sheets opened on top
 *  of each other close one at a time, the top one first. */

interface Entry { id: number; close: () => void }
const stack: Entry[] = []
let nextId = 1
/** Steps back this code took itself, which must not close anything. */
let ownBacks = 0
let listening = false

function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('popstate', () => {
    if (ownBacks > 0) { ownBacks--; return }
    stack.pop()?.close()
  })
  window.addEventListener('keydown', (e) => {
    // A dropdown or menu inside the sheet closes itself first.
    if (e.key !== 'Escape' || e.defaultPrevented || stack.length === 0) return
    e.preventDefault()
    const top = stack[stack.length - 1]
    top.close()
  })
}

/** Close on Back and Escape while `active`. */
export function useBackClose(onClose: () => void, active = true) {
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!active) return
    listen()
    const id = nextId++
    let pushed = false
    let gone = false
    const entry: Entry = {
      id,
      close: () => {
        // Closed by Back: its history step is already gone.
        gone = true
        const i = stack.indexOf(entry)
        if (i >= 0) stack.splice(i, 1)
        if (pushed && history.state?.hemloSheet === id) {
          ownBacks++
          history.back()
        }
        pushed = false
        close.current()
      },
    }
    stack.push(entry)
    // The step is added a moment later, so a sheet that opens and closes in
    // the same instant (React's development double run) leaves none behind.
    const timer = window.setTimeout(() => {
      if (gone) return
      history.pushState({ ...(history.state ?? {}), hemloSheet: id }, '')
      pushed = true
    }, 0)
    return () => {
      window.clearTimeout(timer)
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      // Closed some other way: take back the step it added, unless the page
      // has moved on since (then the step is the page's, not the sheet's).
      if (!gone && pushed && history.state?.hemloSheet === id) {
        ownBacks++
        history.back()
      }
      gone = true
    }
  }, [active])
}
