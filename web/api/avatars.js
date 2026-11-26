// Orbit avatars: each wallet picks an animal and a colour from the Orbit collection (no uploads).
// GET  /api/avatars?a=0x..,0x..   -> { "0x..": { "n": "fox", "c": 1 }, ... }   (up to 60 addresses)
// POST /api/avatars  { address, n, c, ts, sig } -> saves the choice after checking the wallet signed it.
// Storage: Upstash Redis over REST (Vercel Storage). Without it, GET answers {} and POST answers 503.
import { verifyMessage, isAddress } from 'viem'
import { redis, hasRedis, limited, readBody } from './_redis.js'

// must match web/src/lib/avatars.ts
const NOUNS = ['bear', 'fox', 'owl', 'eagle', 'dolphin', 'wolf', 'tiger', 'crane', 'raven', 'lion', 'shark', 'falcon', 'bison', 'panda', 'whale']
const COLORS = 6
const MAX_AGE_MS = 10 * 60_000


export const message = (address, n, c, ts) => `Orbit avatar\nAddress: ${address.toLowerCase()}\nAvatar: ${n}-${c}\nTime: ${ts}`


export default async function handler(req, res) {
  res.setHeader('x-content-type-options', 'nosniff')
  try {
    if (req.method === 'GET') {
      const raw = new URL(req.url || '/', 'http://x').searchParams.get('a') || ''
      const addrs = [...new Set(raw.split(',').map((x) => x.trim().toLowerCase()).filter((x) => isAddress(x)))].slice(0, 60)
      if (!addrs.length) return res.status(400).json({ error: 'pass ?a=0x…,0x…' })
      if (!hasRedis()) { res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.status(200).json({}) }
      const vals = await redis(['MGET', ...addrs.map((a) => 'av:' + a)])
      const out = {}
      addrs.forEach((a, i) => { if (vals?.[i]) { try { const v = JSON.parse(vals[i]); if (NOUNS.includes(v.n) && v.c >= 0 && v.c < COLORS) out[a] = { n: v.n, c: v.c } } catch { /* skip */ } } })
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=300')
      return res.status(200).json(out)
    }
    if (req.method === 'POST') {
      res.setHeader('Cache-Control', 'no-store')
      if (!hasRedis()) return res.status(503).json({ error: 'avatars are not enabled yet' })
      if (await limited(req, 'avatar', 10)) return res.status(429).json({ error: 'too many changes, wait a minute' })
      const b = await readBody(req, 2048)
      const address = String(b.address || '').toLowerCase(), n = String(b.n || ''), c = Number(b.c), ts = Number(b.ts), sig = String(b.sig || '')
      if (!isAddress(address) || !NOUNS.includes(n) || !Number.isInteger(c) || c < 0 || c >= COLORS) return res.status(400).json({ error: 'invalid avatar' })
      if (!(Math.abs(Date.now() - ts) < MAX_AGE_MS)) return res.status(400).json({ error: 'signature expired, try again' })
      // the wallet must have signed exactly this text: nobody can change someone else's avatar
      const ok = await verifyMessage({ address, message: message(address, n, c, ts), signature: sig }).catch(() => false)
      if (!ok) return res.status(401).json({ error: 'signature does not match this wallet' })
      await redis(['SET', 'av:' + address, JSON.stringify({ n, c, at: Date.now() })])
      return res.status(200).json({ ok: true, n, c })
    }
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'method not allowed' })
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(502).json({ error: 'avatars unavailable' })
  }
}
