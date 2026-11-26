/*
 * ponsfamily.com's public API, through our same-origin proxy (/pons-api → https://ponsfamily.com/api).
 * Used only for what the chain can't give cheaply: creator earnings totals and the ranked token list.
 */
export type ApiLaunch = {
  address: string; name: string; symbol: string; protocol: 'v1' | 'v2'; stage: string; artwork?: string; deployer: string
  marketCapUsd?: number; volumeUsd?: number; quote: { symbol: string }; quoteUsd?: number; creatorTaxBps?: number; createdAt?: number
}
export type CreatorEarning = { token: ApiLaunch; quote: number; usd: number; payouts?: number; lastAt?: number; claimed?: boolean }
export type CreatorRow = { address: string; usd: number; coins: CreatorEarning[] }

async function get<T>(path: string, tries = 3): Promise<T | null> {
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch('/pons-api' + path, { headers: { accept: 'application/json' } })
      if (r.ok) return (await r.json()) as T
      if (r.status === 404) return null
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 500 * (k + 1)))
  }
  return null
}

/** Top launches on pons by market cap (both generations), 40 per page. */
export async function topLaunches(pages = 5): Promise<ApiLaunch[]> {
  const out: ApiLaunch[] = []
  let cursor: string | undefined
  for (let p = 0; p < pages; p++) {
    const j = await get<{ items: ApiLaunch[]; nextCursor?: string }>(`/launches?limit=40${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`)
    if (!j) break
    out.push(...j.items)
    if (!j.nextCursor) break
    cursor = j.nextCursor
  }
  const seen = new Set<string>()
  return out.filter((x) => (seen.has(x.address) ? false : (seen.add(x.address), true)))
}

let cache: { at: number; rows: CreatorRow[]; coins: number } | null = null
/** Creators ranked by total creator earnings across their coins (pons' own totals, priced in USD today). */
export async function creatorRewards(onProgress?: (done: number, total: number) => void): Promise<{ rows: CreatorRow[]; coins: number }> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache
  // built once on the server and cached at the edge (web/api/rewards.js): one download instead of ~200 requests
  try {
    const r = await fetch('/api/rewards')
    if (r.ok) {
      const j = (await r.json()) as { rows?: CreatorRow[]; coins?: number }
      if (j.rows?.length) { cache = { at: Date.now(), rows: j.rows, coins: j.coins ?? 0 }; onProgress?.(1, 1); return cache }
    }
  } catch { /* fall back to building it here */ }
  const list = await topLaunches(5)
  const earn: CreatorEarning[] = []
  let done = 0
  const queue = [...list]
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const it = queue.shift()!
      const e = await get<{ quote?: number; credits?: number; lastAt?: number }>(`/launches/${it.address}?view=creator-earnings`)
      const q = e?.quote ?? 0
      earn.push({ token: it, quote: q, usd: q * (it.quoteUsd ?? 0), payouts: e?.credits, lastAt: e?.lastAt })
      onProgress?.(++done, list.length)
    }
  }))
  const by = new Map<string, CreatorRow>()
  for (const e of earn) {
    const a = e.token.deployer.toLowerCase()
    const r = by.get(a) ?? { address: a, usd: 0, coins: [] }
    r.usd += e.usd; r.coins.push(e); by.set(a, r)
  }
  const rows = [...by.values()].filter((r) => r.usd > 0).map((r) => ({ ...r, coins: r.coins.sort((a, b) => b.usd - a.usd) })).sort((a, b) => b.usd - a.usd)
  cache = { at: Date.now(), rows, coins: list.length }
  return cache
}
