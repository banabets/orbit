// Shared by the API functions (files starting with "_" are not functions on Vercel).
// Upstash Redis over REST, plus a small per-IP rate limit so nobody can flood writes or chain lookups.
export const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
export const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
export const hasRedis = () => !!(REDIS_URL && REDIS_TOKEN)

export async function redis(cmd) {
  const r = await fetch(REDIS_URL, { method: 'POST', headers: { authorization: `Bearer ${REDIS_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(cmd) })
  if (!r.ok) throw new Error('storage ' + r.status)
  return (await r.json()).result
}

/** the caller's IP as Vercel sees it */
export function ipOf(req) {
  const h = req.headers || {}
  const v = h['x-real-ip'] || h['x-vercel-forwarded-for'] || h['x-forwarded-for'] || ''
  return String(Array.isArray(v) ? v[0] : v).split(',')[0].trim().slice(0, 64) || 'unknown'
}

/** true when this IP made more than `max` calls to `bucket` in the current minute */
export async function limited(req, bucket, max) {
  if (!hasRedis()) return false
  try {
    const k = `rl:${bucket}:${ipOf(req)}:${Math.floor(Date.now() / 60_000)}`
    const n = await redis(['INCR', k])
    if (n === 1) await redis(['EXPIRE', k, 70])
    return n > max
  } catch { return false } // storage hiccup: don't lock people out
}

export async function readBody(req, maxBytes = 8192) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') { if (req.body.length > maxBytes) throw new Error('too large'); return JSON.parse(req.body) }
  const chunks = []
  let size = 0
  for await (const ch of req) { size += ch.length; if (size > maxBytes) throw new Error('too large'); chunks.push(ch) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}
