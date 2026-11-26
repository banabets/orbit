// GET /api/rewards: creators ranked by creator earnings across their coins, built on the server and cached at the
// edge for 5 minutes. Same numbers the app computed in the browser (pons' own totals, priced in USD today),
// but one download instead of ~200 requests from each visitor's phone.
const API = 'https://ponsfamily.com/api'
const PAGES = 5 // top 200 launches by market cap, like the app

async function get(path, tries = 3) {
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(API + path, { headers: { accept: 'application/json' } })
      if (r.ok) return await r.json()
      if (r.status === 404) return null
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 300 * (k + 1)))
  }
  return null
}

export default async function handler(req, res) {
  // no query strings: one cache entry for everyone
  if ((req.url || '').includes('?')) { res.setHeader('Cache-Control', 'public, s-maxage=3600'); return res.status(400).json({ error: 'use /api/rewards' }) }
  try {
    const list = []
    let cursor
    for (let p = 0; p < PAGES; p++) {
      const j = await get(`/launches?limit=40${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`)
      if (!j) break
      list.push(...(j.items || []))
      if (!j.nextCursor) break
      cursor = j.nextCursor
    }
    const seen = new Set()
    const tokens = list.filter((x) => (seen.has(x.address) ? false : (seen.add(x.address), true)))
    const earn = []
    const queue = [...tokens]
    await Promise.all(Array.from({ length: 12 }, async () => {
      while (queue.length) {
        const it = queue.shift()
        // same numbers as pons' token page: launches whose fees go to holders are not creator earnings;
        // v1 earnings are the sum of its payouts; v2 is pons' creator-earnings total (curve + pool fees)
        if (it.fees?.recipient === 'holders') continue
        let q = 0, e = null
        if (it.protocol === 'v1') { const pays = await get(`/launches/${it.address}?view=payouts`); q = Array.isArray(pays) ? pays.reduce((s, x) => s + (x.quoteAmount || 0), 0) : 0 }
        else { e = await get(`/launches/${it.address}?view=creator-earnings`); q = e?.quote ?? 0 }
        if (!(q > 0)) continue
        const usd = it.quote?.assetClass === 'stablecoin' ? q : q * (it.quoteUsd ?? 0)
        let claimed = false
        if (it.protocol === 'v2' && it.fees?.creatorRecipient && it.deployedBlock != null) {
          const qs = new URLSearchParams({ recipient: it.fees.creatorRecipient, token: it.quote?.isNative ? 'native' : it.quote?.address || '', from_block: String(it.deployedBlock) })
          try { const r = await fetch('https://balancesapi.ponsfamily.com/v1/escrow/claimed?' + qs, { headers: { accept: 'application/json' } }); if (r.ok) claimed = !!(await r.json()).claimed } catch { /* unknown: no check */ }
        }
        earn.push({ token: it, quote: q, usd, payouts: e?.credits, lastAt: e?.lastAt, claimed })
      }
    }))
    const by = new Map()
    for (const e of earn) {
      const a = String(e.token.deployer || '').toLowerCase()
      if (!a) continue
      const r = by.get(a) ?? { address: a, usd: 0, coins: [] }
      r.usd += e.usd; r.coins.push(e); by.set(a, r)
    }
    const rows = [...by.values()].filter((r) => r.usd > 0).map((r) => ({ ...r, coins: r.coins.sort((a, b) => b.usd - a.usd) })).sort((a, b) => b.usd - a.usd)
    if (!rows.length) throw new Error('empty')
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600')
    res.status(200).json({ at: Date.now(), rows, coins: tokens.length })
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(502).json({ error: 'rewards unavailable', detail: String(e?.message || e).slice(0, 120) })
  }
}
