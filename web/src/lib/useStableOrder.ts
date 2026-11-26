import { useRef } from 'react'

/**
 * Live lists re-sort on every data tick (~1.5 s), which makes rows swap places constantly and the screen look like it
 * flickers, worst on phones. This keeps the order that is on screen and only adopts the freshly sorted one every
 * `ms`, or right away when the list itself changes (another filter, first data). In between, rows that left the list
 * drop out and new ones are added at the end; the values inside each row stay live.
 */
export function useStableOrder<T>(list: T[], key: (x: T) => string, ms = 15_000, resetKey = ''): T[] {
  const ref = useRef<{ order: string[]; at: number; reset: string } | null>(null)
  const now = Date.now()
  const keys = list.map(key)
  const prev = ref.current
  if (!prev || prev.reset !== resetKey || now - prev.at >= ms || !prev.order.length) {
    ref.current = { order: keys, at: now, reset: resetKey }
    return list
  }
  const byKey = new Map(list.map((x, i) => [keys[i], x]))
  const kept = prev.order.filter((k) => byKey.has(k))
  const keptSet = new Set(kept)
  const order = [...kept, ...keys.filter((k) => !keptSet.has(k))]
  ref.current = { order, at: prev.at, reset: resetKey }
  return order.map((k) => byKey.get(k)!)
}
