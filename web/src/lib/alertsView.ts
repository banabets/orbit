// Shared bits of the Alerts screens (desktop AlertsPage and phone MAlerts).
import { useState } from 'react'
import type { PriceTarget, AlertItem } from './alerts'

/** how far a price alert has come, 0…1, from the market cap when it was set to the target */
export function targetProgress(x: PriceTarget, now: number) {
  if (!now || !x.from || x.from === x.usd) return 0
  const p = x.dir === 'above' ? (now - x.from) / (x.usd - x.from) : (x.from - now) / (x.from - x.usd)
  return Math.max(0, Math.min(1, p))
}

export type FeedFilter = 'all' | 'whale' | 'grad' | 'target' | 'follow'
export const FILTER_KINDS: Record<FeedFilter, string[] | null> = {
  all: null, whale: ['whale'], grad: ['grad'], target: ['target'], follow: ['launch', 'near', 'devsell'],
}

/** alerts grouped by day, newest first: [["Today", items], ["Yesterday", items], ["Nov 20", items]] */
export function byDay(items: AlertItem[], t: (s: string) => string): [string, AlertItem[]][] {
  const out: [string, AlertItem[]][] = []
  const today = new Date(); today.setHours(0, 0, 0, 0)
  for (const it of items) {
    const d = new Date(it.at); d.setHours(0, 0, 0, 0)
    const diff = Math.round((today.getTime() - d.getTime()) / 86400000)
    const label = diff <= 0 ? t('Today') : diff === 1 ? t('Yesterday') : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const last = out[out.length - 1]
    if (last && last[0] === label) last[1].push(it); else out.push([label, [it]])
  }
  return out
}

/** the time of the previous visit to Alerts: anything newer gets a "new" dot */
export function useLastSeen() {
  const [since] = useState(() => {
    let v = 0
    try { v = Number(localStorage.getItem('orbit:alerts-seen')) || 0; localStorage.setItem('orbit:alerts-seen', String(Date.now())) } catch { /* private mode */ }
    return v
  })
  return since
}
