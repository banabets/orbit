// Zoom and pan for the token charts. The visible window is a slice [a, b] of the full time span (0…1).
// Mouse: wheel zooms around the pointer, drag moves, double-click resets. Touch: one finger drags sideways
// (vertical swipes still scroll the page), two fingers pinch to zoom, double-tap resets.
import { useCallback, useEffect, useRef, useState } from 'react'

export function useChartWindow(minSpan: number, resetKey: unknown) {
  const [win, setWin] = useState<[number, number]>([0, 1])
  // a callback ref: the chart box can mount later (after its loading state), and the wheel listener follows it
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const drag = useRef<{ pts: Map<number, number>; startWin: [number, number]; startX: number; startDist: number; moved: boolean } | null>(null)
  const lastTap = useRef(0)
  const min = Math.min(1, Math.max(0.002, minSpan))

  useEffect(() => setWin([0, 1]), [resetKey])

  const clamp = useCallback((a: number, b: number): [number, number] => {
    let span = Math.min(1, Math.max(min, b - a))
    if (span >= 1) return [0, 1]
    a = Math.max(0, Math.min(1 - span, a)); span = Math.min(span, 1 - a)
    return [a, a + span]
  }, [min])

  const zoomAt = useCallback((factor: number, at: number) => setWin(([a, b]) => {
    const span = b - a, c = a + at * span, ns = span * factor
    return clamp(c - at * ns, c - at * ns + ns)
  }, ), [clamp])

  // wheel needs a non-passive listener to stop the page from scrolling while zooming
  useEffect(() => {
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) { // trackpad sideways swipe: pan
        e.preventDefault()
        const w = el.clientWidth || 1
        setWin(([a, b]) => clamp(a + (e.deltaX / w) * (b - a), b + (e.deltaX / w) * (b - a)))
        return
      }
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [el, clamp, zoomAt])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const d = drag.current ?? { pts: new Map(), startWin: win, startX: e.clientX, startDist: 0, moved: false }
    d.pts.set(e.pointerId, e.clientX)
    d.startWin = win; d.startX = e.clientX
    if (d.pts.size === 2) { const [x1, x2] = [...d.pts.values()]; d.startDist = Math.abs(x1 - x2) || 1 }
    drag.current = d
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !d.pts.has(e.pointerId)) return
    d.pts.set(e.pointerId, e.clientX)
    const w = el?.clientWidth || 1
    const [a0, b0] = d.startWin, span = b0 - a0
    if (d.pts.size >= 2) {
      const [x1, x2] = [...d.pts.values()], dist = Math.abs(x1 - x2) || 1
      const r = el!.getBoundingClientRect(), mid = ((x1 + x2) / 2 - r.left) / r.width
      const ns = span * (d.startDist / dist), c = a0 + mid * span
      setWin(clamp(c - mid * ns, c - mid * ns + ns)); d.moved = true
    } else {
      const dx = e.clientX - d.startX
      if (Math.abs(dx) > 3) d.moved = true
      const sh = (-dx / w) * span
      setWin(clamp(a0 + sh, b0 + sh))
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    d.pts.delete(e.pointerId)
    if (!d.pts.size) {
      if (!d.moved && e.pointerType !== 'mouse') { const now = Date.now(); if (now - lastTap.current < 300) setWin([0, 1]); lastTap.current = now }
      drag.current = null
    } else { d.startWin = win; d.startX = [...d.pts.values()][0]; d.startDist = 0 }
  }
  const dragging = () => !!drag.current?.moved

  return {
    ref: setEl, a: win[0], b: win[1], zoomed: win[0] > 0 || win[1] < 1, reset: () => setWin([0, 1]), dragging,
    zoomIn: () => zoomAt(1 / 1.6, 1), zoomOut: () => zoomAt(1.6, 1),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick: () => setWin([0, 1]) },
  }
}
