// GET /api/price: the ETH price in USD, fetched on the server and cached for 30 s. Fallback for phones whose
// browser blocks direct requests to Coinbase (privacy blockers, wallet in-app browsers).
export default async function handler(req, res) {
  if ((req.url || '').includes('?')) { res.setHeader('Cache-Control', 'public, s-maxage=3600'); return res.status(400).json({ error: 'use /api/price' }) }
  const sources = [
    async () => Number((await (await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')).json()).data.amount),
    async () => Number((await (await fetch('https://api.kraken.com/0/public/Ticker?pair=ETHUSD')).json()).result.XETHZUSD.c[0]),
  ]
  for (const s of sources) {
    try {
      const eth = await s()
      if (eth > 0) {
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=300')
        return res.status(200).json({ eth, at: Date.now() })
      }
    } catch { /* next source */ }
  }
  res.setHeader('Cache-Control', 'no-store')
  res.status(502).json({ error: 'price unavailable' })
}
