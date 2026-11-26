import { useEffect, useRef, useState, type RefObject } from 'react'

// layers that sit on top of the page (an open mail thread, sheets, overlays) scroll on their own: never pull there
const SKIP = '.mm-thread, .m-overlay, .m-sheet, .thread, .th-h, input, textarea'

/**
 * Pull down at the top of the phone screen to refresh. Apps installed on the iPhone home screen have no pull-to-refresh
 * of their own (only Safari does), so it is built here: past `threshold` px, letting go runs `onRefresh`.
 */
export function usePullToRefresh(ref: RefObject<HTMLElement | null>, onRefresh: () => void, threshold = 72) {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const st = useRef({ y0: 0, active: false, pull: 0 })
  const cb = useRef(onRefresh); cb.current = onRefresh
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const start = (e: TouchEvent) => { st.current.active = el.scrollTop <= 0 && e.touches.length === 1 && !(e.target as Element | null)?.closest?.(SKIP); st.current.y0 = e.touches[0].clientY; st.current.pull = 0 }
    const move = (e: TouchEvent) => {
      if (!st.current.active) return
      const dy = e.touches[0].clientY - st.current.y0
      if (dy <= 0 || el.scrollTop > 0) { if (st.current.pull) { st.current.pull = 0; setPull(0) } return }
      e.preventDefault() // our own pull instead of the rubber band
      const p = Math.min(120, dy * 0.5)
      st.current.pull = p; setPull(p)
    }
    const end = () => {
      if (!st.current.active) return
      st.current.active = false
      if (st.current.pull >= threshold) { setBusy(true); setPull(threshold); setTimeout(() => cb.current(), 350) }
      else setPull(0)
      st.current.pull = 0
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end) }
  }, [ref, threshold])
  return { pull, busy, ready: pull >= threshold }
}
