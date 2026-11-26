// GET /api/graduated: price and market cap of every graduated pons v2 token, from pons' own API.
// A graduated curve hands its reserves to a Uniswap v4 pool, so the curve itself reads 0; pons prices the pool.
// { at, c: { "<curve>": { p: priceQuote, m: marketCapUsd|null } } }. Cached at the edge for a minute.
const API = 'https://ponsfamily.com/api'

async function get(path) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API + path, { headers: { accept: 'application/json' } })
      if (r.ok) return await r.json()
    } catch { /* retry */ }
    await new Promise((ok) => setTimeout(ok, 400 * (i + 1)))
  }
  return null
}

export default async function handler(req, res) {
  res.setHeader('x-content-type-options', 'nosniff')
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'method not allowed' }) }
  // no query strings: they would skip the edge cache and make every visit call pons
  if ((req.url || '').includes('?')) { res.setHeader('Cache-Control', 'public, s-maxage=3600'); return res.status(400).json({ error: 'use /api/graduated' }) }
  const c = {}
  let cursor = '', pages = 0, complete = false
  while (pages < 40) {
    const j = await get(`/launches?limit=40&protocol=v2&stage=graduated${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`)
    if (!j) break
    pages++
    for (const it of j.items || []) {
      if (!it.curve || !(it.priceQuote > 0)) continue
      c[String(it.curve).toLowerCase()] = { p: it.priceQuote, m: typeof it.marketCapUsd === 'number' ? it.marketCapUsd : null }
    }
    cursor = j.nextCursor
    if (!cursor || !(j.items || []).length) { complete = true; break }
  }
  // an incomplete list (pons hiccup) is kept only briefly, so the next visitor gets a full one
  res.setHeader('Cache-Control', complete ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=600' : 'public, max-age=0, s-maxage=5')
  return res.status(200).json({ at: Date.now(), complete, c })
}
