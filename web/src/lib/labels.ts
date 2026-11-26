import { useCallback, useMemo } from 'react'
import type { Live } from './usePons'
import { BLOCKS_PER_MIN } from './usePons'
import type { Trade } from './pons'

/**
 * What a wallet does on pons, read from real trades:
 * - sniper: bought in the first minute after the token launched
 * - bot: traded 12+ different tokens (or 60+ times) in the last hour
 * - creator: launched this token, or 2+ tokens
 * - whale: bought $1,000+ in the last hour
 * - diamond: bought this token 6h+ ago and never sold any of it (needs the token's full history)
 */
export type WalletLabel = 'sniper' | 'bot' | 'creator' | 'whale' | 'diamond'
export const LABELS: Record<WalletLabel, { icon: string; text: string; tone: 'g' | 'y' | 'r' | 'v' | 'b' }> = {
  sniper: { icon: '🎯', text: 'Sniper', tone: 'y' },
  bot: { icon: '🤖', text: 'Bot', tone: 'r' },
  creator: { icon: '🛠', text: 'Creator', tone: 'v' },
  whale: { icon: '🐋', text: 'Whale', tone: 'b' },
  diamond: { icon: '💎', text: 'Diamond hands', tone: 'g' },
}
const SNIPE = BLOCKS_PER_MIN // one minute of blocks
const DIAMOND_AGE = 6n * 60n * BLOCKS_PER_MIN

/** Per-token holder facts from its full trade history (for the diamond-hands label). */
export function holderFacts(hist: Trade[]) {
  const sold = new Set<string>(), firstBuy = new Map<string, bigint>()
  for (const t of hist) {
    const a = t.trader.toLowerCase()
    if (t.side === 'sell') sold.add(a)
    else if (!firstBuy.has(a)) firstBuy.set(a, t.block)
  }
  return { sold, firstBuy }
}

export function useLabels(live: Live) {
  const lastHour = useMemo(() => {
    const m = new Map<string, { curves: Set<string>; n: number; buyUsd: number }>()
    for (const t of live.trades) {
      const a = t.trader.toLowerCase()
      const x = m.get(a) ?? { curves: new Set<string>(), n: 0, buyUsd: 0 }
      x.curves.add(t.curve); x.n++
      if (t.side === 'buy') x.buyUsd += live.tradeUsd(t) ?? 0
      m.set(a, x)
    }
    return m
  }, [live.trades, live.tradeUsd])
  const launchesBy = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of live.launches) { const a = l.creator.toLowerCase(); m.set(a, (m.get(a) ?? 0) + 1) }
    return m
  }, [live.launches])

  return useCallback((trader: string, o: { curve?: string; trade?: Trade; facts?: ReturnType<typeof holderFacts> } = {}): WalletLabel[] => {
    const a = trader.toLowerCase(), out: WalletLabel[] = []
    const h = lastHour.get(a)
    const l = o.curve ? live.byCurve.get(o.curve) : undefined
    if (h && (h.curves.size >= 12 || h.n >= 60)) out.push('bot')
    if ((l && l.creator.toLowerCase() === a) || (launchesBy.get(a) ?? 0) >= 2) out.push('creator')
    if (o.trade && l && o.trade.side === 'buy' && o.trade.block - l.block <= SNIPE && l.creator.toLowerCase() !== a) out.push('sniper')
    if (h && h.buyUsd >= 1000) out.push('whale')
    if (o.facts && live.head.n) {
      const fb = o.facts.firstBuy.get(a)
      if (fb !== undefined && !o.facts.sold.has(a) && live.head.n - fb >= DIAMOND_AGE) out.push('diamond')
    }
    return out
  }, [lastHour, launchesBy, live.byCurve, live.head.n])
}
