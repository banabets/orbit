// pons' candles for a token, with real trade times (the chain's block numbers don't map to clock time evenly).
// Used for every candle chart, and after graduation for the pool trades the curve's events don't show.
// Prices are per token in the pair currency.
import { useEffect, useState } from 'react'

export type PoolTick = { t: number; p: number; v: number; up: boolean }
type ApiCandle = { time: number; open: number; high: number; low: number; close: number; volumeQuote?: number }
type Part = { iv: string; step: number; limit: number }

// finest first: 1-minute detail for the recent part, coarser candles for anything older than that
const PLAN: Record<string, Part[]> = {
  '15m': [{ iv: '1m', step: 60e3, limit: 120 }],
  '1h': [{ iv: '1m', step: 60e3, limit: 240 }],
  '24h': [{ iv: '1m', step: 60e3, limit: 1000 }, { iv: '5m', step: 300e3, limit: 300 }],
  all: [{ iv: '1m', step: 60e3, limit: 1000 }, { iv: '1h', step: 3600e3, limit: 1000 }],
}

/** each candle becomes four ticks inside its interval (open, high/low in the order the move went, close), so the
 *  chart can regroup them into candles of any size without losing a wick */
function toTicks(cs: ApiCandle[], step: number): PoolTick[] {
  const out: PoolTick[] = []
  for (const c of cs) {
    if (!(c.open > 0 && c.close > 0)) continue
    const t = c.time * 1000, up = c.close >= c.open
    const [m1, m2] = up ? [c.low, c.high] : [c.high, c.low]
    out.push({ t, p: c.open, v: 0, up }, { t: t + step * 0.3, p: m1, v: 0, up }, { t: t + step * 0.6, p: m2, v: 0, up }, { t: t + step * 0.9, p: c.close, v: c.volumeQuote ?? 0, up })
  }
  return out
}

const get = (token: string, p: Part) => fetch(`/pons-api/launches/${token}?view=candles&interval=${p.iv}&limit=${p.limit}`, { headers: { accept: 'application/json' } })
  .then((r) => (r.ok ? r.json() : null)).then((j: ApiCandle[] | null) => (Array.isArray(j) ? j : [])).catch(() => [] as ApiCandle[])

export function usePoolTicks(token: string | undefined, enabled: boolean, range: string): PoolTick[] {
  const [ticks, setTicks] = useState<PoolTick[]>([])
  useEffect(() => {
    if (!token || !enabled) { setTicks([]); return }
    const plan = PLAN[range] ?? PLAN['24h']
    let dead = false
    const load = async () => {
      const parts = await Promise.all(plan.map((p) => get(token, p)))
      if (dead) return
      // fine candles where we have them, coarse ones only before the first fine candle
      let out: PoolTick[] = []
      let firstT = Infinity
      parts.forEach((cs, i) => {
        const keep = cs.filter((c) => c.time * 1000 < firstT)
        if (!keep.length) return
        out = [...toTicks(keep, plan[i].step), ...out]
        firstT = Math.min(firstT, keep[0].time * 1000)
      })
      if (out.length) setTicks(out.sort((a, b) => a.t - b.t))
    }
    load()
    const id = setInterval(load, 30_000)
    return () => { dead = true; clearInterval(id) }
  }, [token, enabled, range])
  return ticks
}
