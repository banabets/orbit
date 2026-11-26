import { useEffect, useState } from 'react'

/**
 * "Dex paid": the token's team paid for its DexScreener profile (an approved `tokenProfile` order).
 * Read from DexScreener's public orders API (CORS open, ~60 requests/min): one queued request at a time,
 * results cached in memory and on this device. A paid profile never goes back, so "paid" is kept for good;
 * "not paid" is re-checked after a while.
 */
export type DexInfo = { paid: boolean; at: number | null; checked: number }

const API = 'https://api.dexscreener.com/orders/v1/robinhood/'
export const dexUrl = (token: string) => `https://dexscreener.com/robinhood/${token.toLowerCase()}`
const KEY = 'orbit:dexpaid:v1'
const RECHECK_MS = 10 * 60_000
const GAP_MS = 1100 // stays under DexScreener's 60 requests per minute

const cache: Map<string, DexInfo> = (() => {
  try { return new Map(Object.entries(JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, DexInfo>)) } catch { return new Map() }
})()
let saveId = 0
const persist = () => {
  clearTimeout(saveId)
  saveId = window.setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries([...cache].slice(-3000)))) } catch { /* full or blocked */ } }, 1500)
}

const listeners = new Set<() => void>()
const queue: string[] = []
const queued = new Set<string>()
let running = false

const fresh = (i?: DexInfo) => !!i && (i.paid || Date.now() - i.checked < RECHECK_MS)

async function fetchOne(token: string): Promise<DexInfo | null> {
  try {
    const r = await fetch(API + token, { headers: { accept: 'application/json' } })
    if (!r.ok) return null
    const j = (await r.json()) as { orders?: { type: string; status: string; paymentTimestamp?: number }[] }
    const o = (j.orders ?? []).find((x) => x.type === 'tokenProfile' && x.status === 'approved')
    return { paid: !!o, at: o?.paymentTimestamp ?? null, checked: Date.now() }
  } catch { return null }
}

async function pump() {
  if (running) return
  running = true
  while (queue.length) {
    const token = queue.shift()!
    queued.delete(token)
    if (fresh(cache.get(token))) continue
    const info = await fetchOne(token)
    if (info) { cache.set(token, info); persist(); listeners.forEach((f) => f()) }
    await new Promise((r) => setTimeout(r, GAP_MS))
  }
  running = false
}

/** Ask for these tokens (no-op for ones already known); `force` re-checks even a fresh "not paid". */
export function requestDexPaid(tokens: string[], force = false) {
  let added = false
  for (const raw of tokens) {
    const t = raw.toLowerCase()
    if (queued.has(t)) continue
    const c = cache.get(t)
    if (c?.paid || (!force && fresh(c))) continue
    if (force && c) cache.set(t, { ...c, checked: 0 })
    queue.push(t); queued.add(t); added = true
  }
  if (added) void pump()
}

export const dexPaidInfo = (token?: string | null) => (token ? cache.get(token.toLowerCase()) : undefined)
export function onDexPaid(f: () => void) { listeners.add(f); return () => { listeners.delete(f) } }

/** Re-renders when any of these tokens' Dex paid status arrives. */
export function useDexPaid(tokens: string[]) {
  const [, bump] = useState(0)
  const key = tokens.map((t) => t.toLowerCase()).join()
  useEffect(() => onDexPaid(() => bump((n) => n + 1)), [])
  useEffect(() => { if (key) requestDexPaid(key.split(',')) }, [key])
  return (token?: string | null) => !!dexPaidInfo(token)?.paid
}
