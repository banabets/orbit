// Orbit Mail push notifications: a ping on the phone or computer when someone writes to your wallet, even with
// Orbit closed. Standard Web Push with VAPID and NO payload: the push only says "you have mail", the service
// worker shows a fixed text, and nothing about the message (sender, amount, text) ever leaves the chain or
// reaches a push service.
//
// GET  /api/push                                   -> { key }  VAPID public key for pushManager.subscribe
// POST /api/push { op:'sub', address, endpoint, ts, sig }  wallet-signed: this device gets that wallet's mail pings
// POST /api/push { op:'unsub', address, endpoint }          stop (the endpoint is a secret only the device knows)
// POST /api/push { op:'notify', tx }                        after a Mail transaction: the server reads the tx
//      receipt from Robinhood Chain itself and pings the recipients of its PaidInbox Message events. Nothing in
//      the request is trusted but the hash, and each tx is handled once.
//
// Storage: the same Upstash Redis as avatars. The VAPID key pair is created on first use and kept there.
import crypto from 'node:crypto'
import { verifyMessage, isAddress } from 'viem'
import { redis, hasRedis, limited, readBody } from './_redis.js'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const INBOX = '0xdc6f8bdff78411323e85d8bfc581eafe6c875fb9' // PaidInbox on Robinhood Chain (web/src/lib/mainnet.json)
const T_MESSAGE = '0x2096cd4806a6f9634720b2b28d359d46b7292c895b42c68040ffdc1a016268bf' // Message(uint256,address,address,uint256,bytes)
const SUBJECT = 'https://orbiteth.sbs'
const MAX_AGE_MS = 10 * 60_000
const MAX_DEVICES = 10
// only real browser push services: the server never calls an address a client picked
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /^push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/]


export const subMessage = (address, ts) => `Orbit notifications\nAddress: ${address.toLowerCase()}\nTime: ${ts}`

const b64u = (buf) => Buffer.from(buf).toString('base64url')
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 32)

/** the VAPID key pair: made once, kept in Redis */
async function vapid() {
  const have = await redis(['GET', 'push:vapid'])
  if (have) return JSON.parse(have)
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = privateKey.export({ format: 'jwk' })
  const pub = b64u(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]))
  await redis(['SET', 'push:vapid', JSON.stringify({ pub, jwk }), 'NX'])
  return JSON.parse(await redis(['GET', 'push:vapid'])) // whoever won the race
}

function goodEndpoint(e) {
  try { const u = new URL(e); return u.protocol === 'https:' && e.length < 1000 && PUSH_HOSTS.some((r) => r.test(u.hostname)) } catch { return false }
}

/** one empty push, signed with VAPID (RFC 8292). Returns the push service status. */
async function ping(endpoint, keys) {
  const aud = new URL(endpoint).origin
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT }))
  const key = crypto.createPrivateKey({ key: keys.jwk, format: 'jwk' })
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' })
  const r = await fetch(endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'high', 'Content-Length': '0', Authorization: `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.pub}` } })
  return r.status
}

async function receipt(tx) {
  // the RPC is load balanced and a node can lag a block or two behind the wallet that sent the tx
  for (let i = 0; i < 3; i++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [tx] }) }).then((x) => x.json()).catch(() => null)
    if (r?.result) return r.result
    await new Promise((ok) => setTimeout(ok, 1200))
  }
  return null
}


export default async function handler(req, res) {
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('Cache-Control', 'no-store')
  if (!hasRedis()) return res.status(503).json({ error: 'notifications are not enabled yet' })
  try {
    if (req.method === 'GET') return res.status(200).json({ key: (await vapid()).pub })
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'method not allowed' }) }
    const b = await readBody(req, 4096)
    // per-IP limits: a real user sends a handful of these; this stops floods of fake hashes or signups
    if (await limited(req, 'push-' + (b.op === 'notify' ? 'n' : 's'), b.op === 'notify' ? 30 : 10)) return res.status(429).json({ error: 'too many requests, wait a minute' })

    if (b.op === 'sub' || b.op === 'unsub') {
      const address = String(b.address || '').toLowerCase(), endpoint = String(b.endpoint || '')
      if (!isAddress(address) || !goodEndpoint(endpoint)) return res.status(400).json({ error: 'invalid subscription' })
      const k = 'push:s:' + address
      if (b.op === 'unsub') { await redis(['HDEL', k, hash(endpoint)]); return res.status(200).json({ ok: true }) }
      const ts = Number(b.ts), sig = String(b.sig || '')
      if (!(Math.abs(Date.now() - ts) < MAX_AGE_MS)) return res.status(400).json({ error: 'signature expired, try again' })
      // the wallet must have signed it: nobody can point someone else's mail pings at their own device
      const ok = await verifyMessage({ address, message: subMessage(address, ts), signature: sig }).catch(() => false)
      if (!ok) return res.status(401).json({ error: 'signature does not match this wallet' })
      await redis(['HSET', k, hash(endpoint), JSON.stringify({ e: endpoint, at: Date.now() })])
      // keep the newest devices only
      const all = await redis(['HGETALL', k]) || []
      const rows = []
      for (let i = 0; i < all.length; i += 2) { try { rows.push([all[i], JSON.parse(all[i + 1]).at || 0]) } catch { rows.push([all[i], 0]) } }
      if (rows.length > MAX_DEVICES) { rows.sort((x, y) => y[1] - x[1]); await redis(['HDEL', k, ...rows.slice(MAX_DEVICES).map((r) => r[0])]) }
      return res.status(200).json({ ok: true })
    }

    if (b.op === 'notify') {
      const tx = String(b.tx || '').toLowerCase()
      if (!/^0x[0-9a-f]{64}$/.test(tx)) return res.status(400).json({ error: 'invalid tx' })
      // each transaction pings once, whoever reports it and however often
      if ((await redis(['SET', 'push:tx:' + tx, '1', 'NX', 'EX', 172800])) !== 'OK') return res.status(200).json({ ok: true, sent: 0, seen: true })
      const r = await receipt(tx)
      if (!r) { await redis(['DEL', 'push:tx:' + tx]); return res.status(202).json({ ok: false, error: 'transaction not found yet' }) }
      if (r.status !== '0x1') return res.status(200).json({ ok: true, sent: 0 })
      const to = [...new Set((r.logs || [])
        .filter((l) => String(l.address).toLowerCase() === INBOX && l.topics?.[0] === T_MESSAGE && l.topics.length === 4)
        .map((l) => '0x' + l.topics[3].slice(26).toLowerCase()))].slice(0, 5)
      if (!to.length) return res.status(200).json({ ok: true, sent: 0 })
      const keys = await vapid()
      let sent = 0
      await Promise.all(to.map(async (a) => {
        const all = await redis(['HGETALL', 'push:s:' + a]) || []
        const gone = []
        await Promise.all(Array.from({ length: all.length / 2 }, async (_, i) => {
          let e; try { e = JSON.parse(all[2 * i + 1]).e } catch { return }
          if (!goodEndpoint(e)) return gone.push(all[2 * i])
          const st = await ping(e, keys).catch(() => 0)
          if (st >= 200 && st < 300) sent++
          else if (st === 404 || st === 410) gone.push(all[2 * i]) // the device unsubscribed or uninstalled
        }))
        if (gone.length) await redis(['HDEL', 'push:s:' + a, ...gone])
      }))
      return res.status(200).json({ ok: true, sent })
    }
    return res.status(400).json({ error: 'unknown op' })
  } catch {
    return res.status(500).json({ error: 'notifications are unavailable right now' })
  }
}
