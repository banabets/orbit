// GET /api/snapshot: everything Orbit needs for its first paint, built once on the server and cached at
// Vercel's edge, so a new visitor downloads one small file instead of making dozens of RPC calls.
// Same shapes as the browser cache in web/src/lib/usePons.ts (l, g, h, m) plus curve states (c).
// Default (hot): newest launches + names/logos + curves. ?part=all: every launch since pons v2 went live.
import { createPublicClient, defineChain, http, parseAbi, toHex } from 'viem'

const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
})
const rh = createPublicClient({ chain: robinhood, transport: http(undefined, { retryCount: 3, retryDelay: 400 }) })

const FACTORY = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
const FACTORY_START = 110_790_000n
const WIDE = 9_900_000n
const T_LAUNCH = '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607'
const T_GRAD = '0x308c390ed1ab5873392818e036cabdf408bc8ad042fbaead3108954ff75ba980'
const META_N = 400 // newest launches that get name / symbol / logo
const CURVE_N = 200 // newest launches whose curve state is included
const HOT_N = 1500 // launches sent for the first paint
const tokenAbi = parseAbi(['function name() view returns (string)', 'function symbol() view returns (string)', 'function logo() view returns (string)'])
const curveAbi = parseAbi([
  'function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)',
  'function phantomQuote() view returns (uint256)',
  'function graduationThreshold() view returns (uint256)',
  'function graduated() view returns (bool)',
])
const addr = (t) => ('0x' + t.slice(26)).toLowerCase()

async function multicall(contracts) {
  const out = []
  // small groups: one oversized or rate-limited call must not blank hundreds of tokens
  for (let i = 0; i < contracts.length; i += 150) out.push(...(await rh.multicall({ contracts: contracts.slice(i, i + 150), allowFailure: true, batchSize: 0 })))
  return out
}

export default async function handler(req, res) {
  // only two cacheable URLs exist: anything else would bypass the edge cache and hammer the RPC
  const q = new URL(req.url || '/', 'http://x').searchParams
  const keys = [...q.keys()]
  if (keys.some((k) => k !== 'part') || (q.has('part') && q.get('part') !== 'all')) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600')
    return res.status(400).json({ error: 'use /api/snapshot or /api/snapshot?part=all' })
  }
  try {
    const head = await rh.getBlockNumber()
    const ranges = []
    for (let a = FACTORY_START; a <= head; a += WIDE + 1n) ranges.push([a, a + WIDE > head ? head : a + WIDE])
    const logs = (await Promise.all(ranges.map(([a, b]) => rh.request({ method: 'eth_getLogs', params: [{ address: FACTORY, fromBlock: toHex(a), toBlock: toHex(b) }] })))).flat()

    const launches = [], grads = []
    for (const l of logs) {
      if (l.topics[0] === T_LAUNCH) launches.push([addr(l.topics[1]), addr(l.topics[2]), addr(l.topics[3]), BigInt(l.blockNumber).toString(), l.transactionHash, ('0x' + l.data.slice(26, 66)).toLowerCase()])
      else if (l.topics[0] === T_GRAD) grads.push([addr(l.topics[1]), BigInt(l.blockNumber).toString()])
    }
    launches.reverse() // newest first, like the app
    // keep the file small: launch tx hashes only for recent tokens, and '' for the ETH pair (most tokens)
    launches.forEach((l, i) => { if (i >= 500) l[4] = ''; if (l[5] === '0x0000000000000000000000000000000000000000') l[5] = '' })

    // ?part=all: the full launch history (big, changes slowly, cached longer), loaded after first paint
    const part = q.get('part')
    if (part === 'all') {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600')
      return res.status(200).json({ v: 1, part: 'all', at: Date.now(), h: head.toString(), l: launches })
    }

    const top = launches.slice(0, META_N)
    const metaRes = await multicall(top.flatMap(([token]) => ['name', 'symbol', 'logo'].map((functionName) => ({ address: token, abi: tokenAbi, functionName }))))
    const meta = {}
    top.forEach(([token], i) => {
      const [n, s, lg] = metaRes.slice(i * 3, i * 3 + 3)
      meta[token] = { name: n?.status === 'success' ? String(n.result) : '', symbol: s?.status === 'success' ? String(s.result) : '', logo: lg?.status === 'success' ? String(lg.result) : '', description: '' }
    })
    // second try for tokens that came back empty
    const missing = top.map(([t]) => t).filter((t) => !meta[t].name)
    if (missing.length) {
      const again = await multicall(missing.flatMap((token) => ['name', 'symbol', 'logo'].map((functionName) => ({ address: token, abi: tokenAbi, functionName })))).catch(() => [])
      missing.forEach((token, i) => {
        const [n, s, lg] = again.slice(i * 3, i * 3 + 3)
        if (n?.status === 'success') meta[token] = { name: String(n.result), symbol: s?.status === 'success' ? String(s.result) : '', logo: lg?.status === 'success' ? String(lg.result) : '', description: '' }
      })
    }
    const incomplete = top.filter(([t]) => !meta[t].name).length > top.length * 0.1

    const cTop = launches.slice(0, CURVE_N).map((l) => l[1])
    const cRes = await multicall(cTop.flatMap((c) => ['getReserves', 'phantomQuote', 'graduationThreshold', 'graduated'].map((functionName) => ({ address: c, abi: curveAbi, functionName }))))
    const curves = {}
    cTop.forEach((c, i) => {
      const [r, p, t, g] = cRes.slice(i * 4, i * 4 + 4)
      if (r?.status !== 'success') return
      const [quote, tokens] = r.result
      // bigints travel as {$b: "..."}, the format the browser cache already reads
      curves[c] = { key: c, quote: { $b: quote.toString() }, tokens: { $b: tokens.toString() }, phantom: { $b: (p?.status === 'success' ? p.result : 0n).toString() }, threshold: { $b: (t?.status === 'success' ? t.result : 0n).toString() }, graduated: g?.status === 'success' ? g.result : false, at: Date.now() }
    })

    // an incomplete snapshot is only cached for a few seconds, so the next visitor gets a fresh one
    res.setHeader('Cache-Control', incomplete ? 'public, max-age=0, s-maxage=5' : 'public, max-age=0, s-maxage=30, stale-while-revalidate=600')
    // first paint: the newest launches only; the app fetches ?part=all right after
    res.status(200).json({ v: 1, part: 'hot', at: Date.now(), h: head.toString(), l: launches.slice(0, HOT_N), g: grads, m: meta, c: curves })
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(502).json({ error: 'snapshot unavailable', detail: String(e?.shortMessage || e?.message || e).slice(0, 200) })
  }
}
