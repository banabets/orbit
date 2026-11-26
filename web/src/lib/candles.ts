/**
 * Time candles for the token chart (desktop and phone). The interval is picked from the time span so there are
 * about `target` candles (1m … 1d). Intervals without trades are skipped (no flat dashes or gaps), each candle
 * opens at the previous close, and its wicks come from every trade inside it, so pumps and dumps show in full.
 */
export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number; up: boolean; tier: 0 | 1 | 2 }
export type Tick = { t: number; p: number; u?: number; whale?: boolean }

const STEPS = [60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3, 4 * 3600e3, 86400e3]

export function buildCandles(ticks: Tick[], target = 60): { candles: Candle[]; step: number } {
  const pts = ticks.filter((x) => Number.isFinite(x.p) && x.p > 0).sort((a, b) => a.t - b.t)
  if (pts.length < 2) return { candles: [], step: STEPS[0] }
  const span = Math.max(1, pts[pts.length - 1].t - pts[0].t)
  const step = STEPS.find((s) => span / s <= target) ?? STEPS[STEPS.length - 1]
  const candles: Candle[] = []
  let prevClose = pts[0].p
  let cur: Candle | null = null, key = -1
  for (const x of pts) {
    const k = Math.floor(x.t / step)
    if (k !== key) {
      if (cur) { cur.up = cur.c >= cur.o; candles.push(cur); prevClose = cur.c }
      key = k
      cur = { t: k * step, o: prevClose, h: Math.max(prevClose, x.p), l: Math.min(prevClose, x.p), c: x.p, v: 0, up: true, tier: 0 }
    }
    cur!.h = Math.max(cur!.h, x.p); cur!.l = Math.min(cur!.l, x.p); cur!.c = x.p
    cur!.v += x.u ?? 0
    if (x.whale) cur!.tier = Math.max(cur!.tier, (x.u ?? 0) >= 1000 ? 2 : 1) as 0 | 1 | 2
  }
  if (cur) { cur.up = cur.c >= cur.o; candles.push(cur) }
  return { candles, step }
}

/** "1m", "15m", "4h"… for the chart legend */
export const stepLabel = (step: number) => (step >= 86400e3 ? step / 86400e3 + 'd' : step >= 3600e3 ? step / 3600e3 + 'h' : step / 60e3 + 'm')

/**
 * Candles by trade count: every `k` trades make one candle. Used when a token's trading came in a short burst,
 * so time candles (pons' smallest is 1 minute) would only be a handful. Times are the trades' own (estimated).
 */
export function buildTradeCandles(ticks: Tick[], target = 48): { candles: Candle[]; per: number } {
  const pts = ticks.filter((x) => Number.isFinite(x.p) && x.p > 0)
  if (pts.length < 2) return { candles: [], per: 1 }
  const per = Math.max(1, Math.ceil(pts.length / target))
  const candles: Candle[] = []
  let prev = pts[0].p
  for (let i = 0; i < pts.length; i += per) {
    const g = pts.slice(i, i + per)
    const c: Candle = { t: g[0].t, o: prev, c: g[g.length - 1].p, h: Math.max(prev, ...g.map((x) => x.p)), l: Math.min(prev, ...g.map((x) => x.p)), v: g.reduce((s, x) => s + (x.u ?? 0), 0), up: true, tier: 0 }
    for (const x of g) if (x.whale) c.tier = Math.max(c.tier, (x.u ?? 0) >= 1000 ? 2 : 1) as 0 | 1 | 2
    c.up = c.c >= c.o
    candles.push(c); prev = c.c
  }
  return { candles, per }
}

/** how many distinct minutes a set of ticks covers */
export const minutesIn = (ticks: { t: number }[]) => new Set(ticks.map((x) => Math.floor(x.t / 60_000))).size
