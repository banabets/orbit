import { createPublicClient, defineChain, http, parseAbi, toHex, type Hex, type Log } from 'viem'

/** Robinhood Chain mainnet, read directly from the public RPC (CORS open). */
export const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Etherscan', url: 'https://robin.etherscan.io' } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
})

export const rh = createPublicClient({ chain: robinhood, transport: http(undefined, { batch: true }) })
/** Unbatched client for log scans: batched getLogs responses exceed the RPC's size limit. */
const rl = createPublicClient({ chain: robinhood, transport: http(undefined, { retryCount: 0 }) })
/** A multicall whose transport failed reports every call as failed instead of throwing; turn that into an error so `retry` kicks in. */
async function multicallAll<T extends { status: string; error?: unknown }>(run: () => Promise<T[]>): Promise<T[]> {
  return retry(async () => {
    const res = await run()
    if (res.length && res.every((x) => x.status !== 'success')) {
      const e = res[0].error as { details?: string; shortMessage?: string; message?: string } | undefined
      const msg = e?.details ?? e?.shortMessage ?? e?.message ?? ''
      if (/fetch|429|Too Many|HTTP request failed|timeout/i.test(msg)) throw new Error('Failed to fetch (multicall)')
    }
    return res
  })
}
/** A new client per multicall: concurrent multicalls on one shared client returned wrong (empty) results in testing. */
const fresh = () => createPublicClient({ chain: robinhood, transport: http(undefined, { retryCount: 0 }) })
/** Runs async jobs with at most `n` in flight. */
async function pool<T>(jobs: (() => Promise<T>)[], n = 3): Promise<T[]> {
  const out: T[] = new Array(jobs.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => { while (i < jobs.length) { const k = i++; out[k] = await jobs[k]() } }))
  return out
}
/** Retries a call that failed from rate limiting or a dropped connection. */
async function retry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let k = 0; ; k++) {
    try { return await fn() } catch (e) {
      const m = (e as { details?: string; message: string }).details ?? (e as Error).message
      if (k >= tries || !/fetch|429|Too Many|timeout|timed out|network|beyond current head|header not found|unknown block/i.test(m)) throw e
      await new Promise((r) => setTimeout(r, 600 * 2 ** k + Math.random() * 400))
    }
  }
}
/** The RPC rate-limits bursts; a 429 reaches the browser as "Failed to fetch" (no CORS headers), so retry with backoff.
 *  Its nodes sit behind a load balancer and some lag a few blocks ("block range extends beyond current head"): retried too. */
async function getLogsRaw(p: Record<string, unknown>): Promise<Log[]> {
  for (let k = 0; ; k++) {
    try { return (await rl.request({ method: 'eth_getLogs', params: [p] } as never)) as Log[] } catch (e) {
      const m = (e as { details?: string; message: string }).details ?? (e as Error).message
      if (k >= 6 || !/fetch|429|Too Many|timeout|timed out|network|beyond current head|header not found|unknown block/i.test(m)) throw e
      await new Promise((r) => setTimeout(r, 600 * 2 ** k + Math.random() * 400))
    }
  }
}

/** pons v2 contracts and event topics, verified against live logs. */
export const PONS_FACTORY = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e' as const
const T_LAUNCH = '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607'
const T_GRAD = '0x308c390ed1ab5873392818e036cabdf408bc8ad042fbaead3108954ff75ba980'
const T_BUY = '0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455'
const T_SELL = '0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df'

const tokenAbi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function logo() view returns (string)',
  'function description() view returns (string)',
])

/** pair: what the curve is bought with. 0x0 = ETH; otherwise an ERC-20 such as USDG or a Robinhood stock token. */
export type Launch = { token: Hex; curve: Hex; creator: Hex; block: bigint; tx: Hex; pair: Hex }
export type Meta = { name: string; symbol: string; logo: string; description: string }
export type Trade = {
  id: string
  side: 'buy' | 'sell'
  curve: Hex
  trader: Hex
  eth: bigint
  tokens: bigint
  /** protocol fee, in the pair currency */
  fee: bigint
  /** creator tax (creatorTaxBps of the trade), paid to the creator, in the pair currency */
  tax: bigint
  block: bigint
  tx: Hex
}

const addr = (topic: Hex) => ('0x' + topic.slice(26)) as Hex
const word = (data: Hex, i: number) => BigInt('0x' + (data.slice(2 + i * 64, 2 + i * 64 + 64) || '0'))

/** ~0.118 s per block on Robinhood Chain */
export const SECONDS_PER_BLOCK = 0.118

/** First block with pons v2 factory activity (verified: first TokenLaunched at 110,794,437). */
/** The PONS token on Robinhood Chain. */
export const REAL_PONS = '0x39dBED3a2bd333467115dE45665cC57F813C4571' as Hex

export const FACTORY_START = 110_790_000n
/** RPC limits: address + single topic per position: 10M blocks; topic arrays: 100k; no address: 30k. */
const WIDE = 9_900_000n

/** Every launch and graduation since pons v2 went live. */
export async function loadLaunches(from: bigint = FACTORY_START) {
  const head = await rh.getBlockNumber()
  const ranges: [bigint, bigint][] = []
  for (let a = from; a <= head; a += WIDE + 1n) ranges.push([a, a + WIDE > head ? head : a + WIDE])
  const logs = (await Promise.all(ranges.map(([a, b]) => getLogsRaw({ address: PONS_FACTORY, fromBlock: toHex(a), toBlock: toHex(b) })))).flat()
  const launches: Launch[] = []
  const graduated = new Map<string, bigint>()
  for (const l of logs) {
    if (l.topics[0] === T_LAUNCH)
      launches.push({ token: addr(l.topics[1]!), curve: addr(l.topics[2]!), creator: addr(l.topics[3]!), block: BigInt(l.blockNumber as unknown as string), tx: l.transactionHash!, pair: ('0x' + l.data.slice(26, 66)).toLowerCase() as Hex })
    if (l.topics[0] === T_GRAD) graduated.set(addr(l.topics[1]!).toLowerCase(), BigInt(l.blockNumber as unknown as string))
  }
  launches.reverse()
  return { head, launches, graduated }
}

export async function loadMeta(tokens: Hex[]): Promise<Record<string, Meta>> {
  const out: Record<string, Meta> = {}
  const calls = tokens.flatMap((t) =>
    (['name', 'symbol', 'logo', 'description'] as const).map((fn) => ({ address: t, abi: tokenAbi, functionName: fn })),
  )
  for (let i = 0; i < calls.length; i += 400) {
    const res = await multicallAll(() => fresh().multicall({ contracts: calls.slice(i, i + 400), allowFailure: true, batchSize: 0 }))
    res.forEach((r, j) => {
      const k = i + j
      const t = tokens[Math.floor(k / 4)].toLowerCase()
      out[t] ??= { name: '', symbol: '', logo: '', description: '' }
      const key = (['name', 'symbol', 'logo', 'description'] as const)[k % 4]
      if (r.status === 'success') out[t][key] = String(r.result)
    })
  }
  return out
}

function parseTrade(l: Log): Trade | null {
  const t0 = l.topics[0]
  if (t0 !== T_BUY && t0 !== T_SELL) return null
  const buy = t0 === T_BUY
  return {
    id: `${l.transactionHash}-${l.logIndex}`,
    side: buy ? 'buy' : 'sell',
    curve: l.address.toLowerCase() as Hex,
    trader: addr(l.topics[2] as Hex),
    eth: buy ? word(l.data, 0) : word(l.data, 1),
    tokens: buy ? word(l.data, 1) : word(l.data, 0),
    fee: word(l.data, 2),
    tax: word(l.data, 3),
    block: BigInt(l.blockNumber as unknown as string),
    tx: l.transactionHash as Hex,
  }
}

/** Every buy and sell on every pons curve in a block range (the RPC caps queries without an address at 30k blocks). */
export async function loadTrades(from: bigint, to: bigint): Promise<Trade[]> {
  const out: Trade[] = []
  const STEP = 29_000n
  const ranges: [bigint, bigint][] = []
  for (let a = from; a <= to; a += STEP + 1n) ranges.push([a, a + STEP > to ? to : a + STEP])
  const results = await pool(ranges.map(([a, b]) => () => getLogsRaw({ fromBlock: toHex(a), toBlock: toHex(b), topics: [[T_BUY, T_SELL]] })))
  for (const logs of results) for (const l of logs) { const t = parseTrade(l); if (t) out.push(t) }
  return out
}

export const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4)
export const fmtEth = (wei: bigint, d = 4) => {
  const n = Number(wei) / 1e18
  if (n === 0) return '0'
  if (n < 0.0001) return '<0.0001'
  return n.toLocaleString('en-US', { maximumFractionDigits: d })
}
export const ago = (blocks: bigint) => {
  const s = Number(blocks) * SECONDS_PER_BLOCK
  if (s < 60) return `${Math.max(1, Math.round(s))} s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  if (s < 86400) return `${Math.round(s / 3600)} h`
  return `${Math.round(s / 86400)} d`
}

/* ---------- logos: pons stores most as ipfs:// ---------- */
const GATEWAYS = ['https://ipfs.filebase.io/ipfs/', 'https://w3s.link/ipfs/', 'https://gateway.pinata.cloud/ipfs/', 'https://ipfs.io/ipfs/']
/** Ordered candidate URLs for a logo; the image component falls through them on error. */
/** pons' own artwork service (what ponsfamily.com uses): small webp thumbnails of IPFS images. */
const PONS_ART = 'https://dbk-vercel.vercel.app/api/ipfs/content/'
const PONS_PROXY = 'https://ponsfamily.com/api/artwork?src='
/** Image URLs to try for a token logo, best first. Gateway links are reduced to their CID so pons' fast service can serve them. */
export function logoCandidates(raw?: string): string[] {
  if (!raw) return []
  const s = raw.trim()
  const m = s.match(/^ipfs:\/\/(?:ipfs\/)?(.+)$/i) || s.match(/^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{50,})(\/.*)?$/)
  if (m) { const path = m[1] ?? s; return [PONS_ART + path + '?variant=card', ...GATEWAYS.map((g) => g + path)] }
  const inPath = s.match(/^https?:\/\/[^/]+\/ipfs\/([^?#]+)/i)
  if (inPath) return [PONS_ART + inPath[1] + '?variant=card', s, ...GATEWAYS.map((g) => g + inPath[1])]
  if (/^https?:\/\//i.test(s)) return [PONS_PROXY + encodeURIComponent(s), s]
  if (s.startsWith('data:image')) return [s]
  return []
}

/* ---------- bonding curve state (same numbers pons shows) ---------- */
const curveAbi = parseAbi([
  'function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)',
  'function phantomQuote() view returns (uint256)',
  'function graduationThreshold() view returns (uint256)',
  'function graduated() view returns (bool)',
])
export type Curve = { key: string; quote: bigint; tokens: bigint; phantom: bigint; threshold: bigint; graduated: boolean; at: number }
export const SUPPLY = 1_000_000_000n * 10n ** 18n

export async function loadCurves(curves: string[]): Promise<Record<string, Curve>> {
  const out: Record<string, Curve> = {}
  const fns = ['getReserves', 'phantomQuote', 'graduationThreshold', 'graduated'] as const
  const calls = curves.flatMap((c) => fns.map((fn) => ({ address: c as Hex, abi: curveAbi, functionName: fn })))
  for (let i = 0; i < calls.length; i += 400) {
    const res = await multicallAll(() => fresh().multicall({ contracts: calls.slice(i, i + 400), allowFailure: true, batchSize: 0 }))
    for (let j = 0; j < res.length; j += 4) {
      const c = curves[(i + j) / 4].toLowerCase()
      const [r, p, t, g] = res.slice(j, j + 4)
      if (r.status !== 'success') continue
      const [quote, tokens] = r.result as readonly [bigint, bigint]
      out[c] = { key: c, quote, tokens, phantom: p.status === 'success' ? (p.result as bigint) : 0n, threshold: t.status === 'success' ? (t.result as bigint) : 0n, graduated: g.status === 'success' ? (g.result as boolean) : false, at: Date.now() }
    }
  }
  return out
}
/** ETH per whole token from virtual reserves. */
export const priceEth = (c: Curve) => (c.tokens > 0n ? Number(c.quote) / Number(c.tokens) : 0)
export const mcapEth = (c: Curve) => priceEth(c) * 1e9
/** Real ETH raised on the curve vs. graduation threshold (0..1). */
export const progress = (c: Curve) => {
  if (c.graduated) return 1
  if (c.threshold === 0n) return 0
  const raised = c.quote > c.phantom ? c.quote - c.phantom : 0n
  return Math.min(1, Number(raised) / Number(c.threshold))
}
export const raisedEth = (c: Curve) => Number(c.quote > c.phantom ? c.quote - c.phantom : 0n) / 1e18

export async function ethUsd(): Promise<number | null> {
  try { const r = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot'); const j = await r.json(); const v = Number(j.data.amount); if (v > 0) return v } catch { /* blocked or offline: try our server */ }
  // some phone browsers (wallet in-app browsers, privacy blockers) refuse Coinbase: our server asks for them
  try { const r = await fetch('/api/price'); const j = await r.json(); const v = Number(j.eth); if (v > 0) return v } catch { /* offline */ }
  return null
}
export const usd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(n < 10 ? 2 : 0)}`

const socialsAbi = parseAbi(['function socials() view returns (string,string,string,string,string)'])
export async function loadSocials(token: Hex): Promise<string[]> {
  try { const r = await rh.readContract({ address: token, abi: socialsAbi, functionName: 'socials' }); return (r as readonly string[]).filter((s) => { try { const u = new URL(s); return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname } catch { return false } }) } catch { return [] }
}

/** Splits [from, to] into chunks the RPC accepts for single-address, single-topic queries. */
function wide(from: bigint, to: bigint) {
  const r: [bigint, bigint][] = []
  for (let a = from; a <= to; a += WIDE + 1n) r.push([a, a + WIDE > to ? to : a + WIDE])
  return r
}
const pad = (a: string) => ('0x' + a.slice(2).toLowerCase().padStart(64, '0')) as Hex

/** Every trade on one curve in a block range. Buys and sells are asked separately: one topic per query allows 10M blocks. */
export async function loadCurveTrades(curve: string, fromBlock: bigint, toBlock: bigint, trader?: string): Promise<Trade[]> {
  // the whole life of a curve fits in a few 10M-block windows
  const q = (topic: Hex, a: bigint, b: bigint) => () => getLogsRaw({ address: curve as Hex, fromBlock: toHex(a), toBlock: toHex(b), topics: trader ? [topic, null, pad(trader)] : [topic] })
  const logs = (await pool(wide(fromBlock, toBlock).flatMap(([a, b]) => [q(T_BUY, a, b), q(T_SELL, a, b)]), 2)).flat()
  return (logs.map(parseTrade).filter(Boolean) as Trade[]).sort((x, y) => Number(x.block - y.block))
}

/** One wallet's trades on many curves (each curve from its own launch block). Runs in small parallel batches. */
export async function loadWalletTrades(trader: string, launches: { curve: string; block: bigint }[], head: bigint, onProgress?: (done: number) => void): Promise<Trade[]> {
  const out: Trade[] = []
  const BATCH = 4
  for (let i = 0; i < launches.length; i += BATCH) {
    const part = await Promise.all(launches.slice(i, i + BATCH).map((l) => loadCurveTrades(l.curve, l.block, head, trader).catch(() => [] as Trade[])))
    part.forEach((p) => out.push(...p))
    onProgress?.(Math.min(launches.length, i + BATCH))
  }
  return out
}

/** Which addresses are contracts (routers, bots) rather than people. */
const codeCache = new Map<string, boolean>()
export async function areContracts(addrs: string[]): Promise<Map<string, boolean>> {
  const need = [...new Set(addrs.map((a) => a.toLowerCase()))].filter((a) => !codeCache.has(a))
  for (let i = 0; i < need.length; i += 20) {
    const part = need.slice(i, i + 20)
    const codes = await Promise.all(part.map((a) => rh.getCode({ address: a as Hex }).catch(() => undefined)))
    part.forEach((a, j) => { if (codes[j] !== undefined) codeCache.set(a, !!codes[j] && codes[j] !== '0x') })
  }
  return new Map(addrs.map((a) => [a.toLowerCase(), codeCache.get(a.toLowerCase()) ?? false]))
}

const balAbi = parseAbi(['function balanceOf(address) view returns (uint256)'])
/** balanceOf(owner) for every token, via multicall. Returns only non-zero balances. */
export async function tokenBalance(token: Hex, owner: Hex): Promise<bigint> {
  return (await retry(() => rh.readContract({ address: token, abi: balAbi, functionName: 'balanceOf', args: [owner] }))) as bigint
}
export async function loadBalances(owner: Hex, tokens: Hex[], onProgress?: (done: number) => void): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>()
  const STEP = 2000
  const chunks: Hex[][] = []
  for (let i = 0; i < tokens.length; i += STEP) chunks.push(tokens.slice(i, i + STEP))
  let done = 0
  // a client of its own: concurrent multicalls from other code on a shared client gave intermittent empty results in testing
  const rb = fresh()
  await pool(chunks.map((part) => async () => {
    // batchSize 0: one eth_call per chunk (viem's default splits into hundreds of tiny calls)
    const res = await multicallAll(() => rb.multicall({ contracts: part.map((t) => ({ address: t, abi: balAbi, functionName: 'balanceOf', args: [owner] })), allowFailure: true, batchSize: 0 }))
    res.forEach((r, j) => { if (r.status === 'success' && (r.result as bigint) > 0n) out.set(part[j].toLowerCase(), r.result as bigint) })
    done += part.length; onProgress?.(done)
  }), 4)
  return out
}

export const T_LAUNCH_TOPIC = T_LAUNCH
export const T_GRAD_TOPIC = T_GRAD

/* ---------- pair currencies ---------- */
export const ETH_PAIR = '0x0000000000000000000000000000000000000000' as Hex
export type Pair = { symbol: string; decimals: number; usd: number | null; source?: 'pons' }
const pairAbi = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)'])
const STABLE = /^(USDG|USDC|USDT|DAI|USD)$/i
/** symbol + decimals of every quote token; USD price only where we can be sure (ETH from Coinbase, stablecoins = $1). */
export async function loadPairs(pairs: string[]): Promise<Record<string, Pair>> {
  const out: Record<string, Pair> = {}
  const list = [...new Set(pairs.map((p) => p.toLowerCase()))].filter((p) => p !== ETH_PAIR)
  const res = await rh.multicall({ contracts: list.flatMap((p) => [{ address: p as Hex, abi: pairAbi, functionName: 'symbol' }, { address: p as Hex, abi: pairAbi, functionName: 'decimals' }]), allowFailure: true })
  list.forEach((p, i) => {
    const sym = res[i * 2].status === 'success' ? String(res[i * 2].result) : '?'
    const dec = res[i * 2 + 1].status === 'success' ? Number(res[i * 2 + 1].result) : 18
    out[p] = { symbol: sym, decimals: dec, usd: STABLE.test(sym) ? 1 : null }
  })
  return out
}
