import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Hex } from 'viem'
import { usd as usdFmt } from './format'
import {
  rh, loadLaunches, loadMeta, loadTrades, loadCurves, ethUsd, loadPairs, PONS_FACTORY, SECONDS_PER_BLOCK, ETH_PAIR,
  T_LAUNCH_TOPIC, T_GRAD_TOPIC, progress, type Launch, type Meta, type Trade, type Curve, type Pair,
} from './pons'

export const BLOCKS_PER_MIN = BigInt(Math.round(60 / SECONDS_PER_BLOCK))
export const WINDOW_MIN = 60n
const BIG_KEY = 'orbit:bigbuys', DAY_MS = 86_400_000
/** a buy of $250+ (dolphin) or $1,000+ (whale); `at` is its time in ms */
export type BigBuy = { id: string; curve: string; usd: number; trader: Hex; tx: Hex; at: number }
const WHALE_USD = 250 // smallest "big buy" (dolphin); whales start at $1,000 (see Home.tierOf)

export type FeedItem =
  | { id: string; kind: 'launch'; curve: string; block: bigint }
  | { id: string; kind: 'grad'; curve: string; block: bigint }
  | { id: string; kind: 'whale'; curve: string; block: bigint; usd: number; trader: Hex; tx: Hex }
  | { id: string; kind: 'near'; curve: string; block: bigint; pct: number }

/** vol is in USD; trades in pairs without a known USD price count as 0. */
export type TokenStats = { vol: number; buys: number; sells: number; traders: Set<string>; first?: Trade; last?: Trade }

/* ---------- local cache: last visit's launches + names/logos, so the page paints instantly ---------- */
const CACHE_KEY = 'orbit:cache:v1'
type CacheShape = { launches: Launch[]; graduated: Map<string, bigint>; head: bigint; meta: Record<string, Meta> }
function readCache(): CacheShape | null {
  try {
    const s = localStorage.getItem(CACHE_KEY); if (!s) return null
    const j = JSON.parse(s) as { l: [string, string, string, string, string, string][]; g: [string, string][]; h: string; m: Record<string, Meta> }
    return {
      launches: j.l.map(([token, curve, creator, block, tx, pair]) => ({ token: token as Hex, curve: curve as Hex, creator: creator as Hex, block: BigInt(block), tx: tx as Hex, pair: pair as Hex })),
      graduated: new Map(j.g.map(([k, b]) => [k, BigInt(b)])), head: BigInt(j.h), meta: j.m,
    }
  } catch { return null }
}
const LIVE_KEY = 'orbit:live:v1'
type LiveCache = { curves: Record<string, Curve>; pairs: Record<string, Pair> }
const big = (_: string, v: unknown) => (typeof v === 'bigint' ? { $b: v.toString() } : v)
const unbig = (_: string, v: unknown) => (v && typeof v === 'object' && '$b' in (v as object) ? BigInt((v as { $b: string }).$b) : v)
function readLive(): LiveCache | null { try { const s = localStorage.getItem(LIVE_KEY); return s ? (JSON.parse(s, unbig) as LiveCache) : null } catch { return null } }
function writeLive(curves: Record<string, Curve>, pairs: Record<string, Pair>, keep: string[]) {
  try { const c: Record<string, Curve> = {}; for (const k of keep) if (curves[k]) c[k] = curves[k]; localStorage.setItem(LIVE_KEY, JSON.stringify({ curves: c, pairs }, big)) } catch { /* storage full or blocked */ }
}
/* ---------- server snapshot: first paint for a new visitor in one small download (api/snapshot.js) ---------- */
type SnapRow = [string, string, string, string, string, string]
type Snap = { h: string; l: SnapRow[]; g?: [string, string][]; m?: Record<string, Meta>; c?: Record<string, unknown> }
async function fetchSnap(all: boolean): Promise<Snap> {
  const ctl = new AbortController(), id = setTimeout(() => ctl.abort(), 12_000)
  try {
    const r = await fetch('/api/snapshot' + (all ? '?part=all' : ''), { signal: ctl.signal })
    if (!r.ok) throw new Error('snapshot ' + r.status)
    const j = (await r.json()) as Snap
    if (!j || !Array.isArray(j.l) || !j.h) throw new Error('snapshot shape')
    return j
  } finally { clearTimeout(id) }
}
const rowsToLaunches = (rows: SnapRow[]): Launch[] => rows.map(([token, curve, creator, block, tx, pair]) => ({ token: token as Hex, curve: curve as Hex, creator: creator as Hex, block: BigInt(block), tx: tx as Hex, pair: (pair || ETH_PAIR) as Hex }))
const newestFirst = (a: Launch[]) => {
  const seen = new Set<string>(), out: Launch[] = []
  for (const l of a) { const k = l.token.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(l) } }
  return out.sort((x, y) => (y.block > x.block ? 1 : y.block < x.block ? -1 : 0))
}
function writeCache(launches: Launch[], graduated: Map<string, bigint>, head: bigint, meta: Record<string, Meta>) {
  try {
    // descriptions are long and not needed for the first paint
    const m: Record<string, Meta> = {}
    for (const [k, v] of Object.entries(meta)) m[k] = { ...v, description: '' }
    localStorage.setItem(CACHE_KEY, JSON.stringify({ l: launches.map((x) => [x.token, x.curve, x.creator, x.block.toString(), x.tx, x.pair]), g: [...graduated].map(([k, b]) => [k, b.toString()]), h: head.toString(), m }))
  } catch { /* storage full or blocked: skip the cache */ }
}

/** Single live source for the whole app: pons v2 on Robinhood Chain mainnet. */
export function usePons() {
  const [launches, setLaunches] = useState<Launch[]>([])
  const [grads, setGrads] = useState<Map<string, bigint>>(new Map())
  const [meta, setMeta] = useState<Record<string, Meta>>({})
  const [curves, setCurves] = useState<Record<string, Curve>>({})
  const [trades, setTrades] = useState<Trade[]>([])
  const [head, setHead] = useState<{ n: bigint; at: number }>({ n: 0n, at: Date.now() })
  const [eth, setEth] = useState<number | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [lastEvent, setLastEvent] = useState<number | null>(null)
  const [nearMarks, setNearMarks] = useState<FeedItem[]>([])
  const [pairs, setPairs] = useState<Record<string, Pair>>({})
  const last = useRef(0n)
  const metaReq = useRef(new Set<string>())
  const crossed = useRef(new Map<string, number>())
  /** curves created by the pons v2 factory: other contracts emit the same trade events and must be ignored */
  const known = useRef(new Set<string>())

  const ensureMeta = useCallback(async (tokens: Hex[], force = false) => {
    const need = force ? tokens : tokens.filter((t) => !metaReq.current.has(t.toLowerCase()))
    if (!need.length) return
    need.forEach((t) => metaReq.current.add(t.toLowerCase()))
    const m = await loadMeta(need)
    setMeta((p) => ({ ...p, ...m }))
  }, [])
  const refreshCurves = useCallback(async (cs: string[]) => {
    if (!cs.length) return
    const c = await loadCurves([...new Set(cs.map((x) => x.toLowerCase()))])
    setCurves((p) => ({ ...p, ...c }))
  }, [])

  // save the market caps and pair prices at most every 10s, so the next visit paints them instantly
  const keepRef = useRef<string[]>([])
  const savedAt = useRef(0)
  useEffect(() => {
    if (!keepRef.current.length) return
    const wait = Math.max(0, savedAt.current + 10_000 - Date.now())
    const id = setTimeout(() => { savedAt.current = Date.now(); writeLive(curves, pairs, keepRef.current) }, wait)
    return () => clearTimeout(id)
  }, [curves, pairs])

  // initial load
  useEffect(() => {
    let dead = false
    // instant first paint from the last visit (launches, names, logos), then refresh from the chain
    let cached = readCache()
    const paint = (c: CacheShape) => {
      c.launches.forEach((l) => known.current.add(l.curve.toLowerCase()))
      setLaunches(c.launches); setGrads(c.graduated); setMeta((p) => ({ ...c.meta, ...p })); setHead({ n: c.head, at: Date.now() })
      // tokens that arrived without a name are left to ensureMeta, which asks the chain again
      Object.entries(c.meta).forEach(([k, m]) => { if (m.name) metaReq.current.add(k) })
    }
    if (cached) {
      paint(cached)
      const lc = readLive()
      if (lc) { setCurves((p) => ({ ...lc.curves, ...p })); setPairs((p) => ({ ...lc.pairs, ...p })) }
    }
    ;(async () => {
      try {
        // first visit on this device: paint from the server snapshot (newest launches, names, logos, curves),
        // and take the full launch history from it too, so the chain is only asked for what came after
        if (!cached) {
          const allP = fetchSnap(true).catch(() => null)
          const hot = await fetchSnap(false).catch(() => null)
          if (dead) return
          if (hot) {
            const base: CacheShape = { launches: rowsToLaunches(hot.l), graduated: new Map((hot.g ?? []).map(([k, b]) => [k, BigInt(b)])), head: BigInt(hot.h), meta: hot.m ?? {} }
            paint(base)
            if (hot.c) { const c = JSON.parse(JSON.stringify(hot.c), unbig) as Record<string, Curve>; setCurves((p) => ({ ...c, ...p })) }
            const all = await allP
            if (dead) return
            if (all) {
              base.launches = newestFirst([...base.launches, ...rowsToLaunches(all.l)])
              paint(base)
              cached = base
            }
          }
        }
        // launches and the last hour of trades load at the same time
        const headNow = await rh.getBlockNumber()
        const tradesP = loadTrades(headNow - WINDOW_MIN * BLOCKS_PER_MIN, headNow)
        // with a cache, only the blocks since the last visit are scanned (instead of ~10M blocks every time)
        const inc = await loadLaunches(cached ? cached.head + 1n : undefined)
        if (dead) return
        const r = cached ? (() => {
          const seen = new Set(inc.launches.map((l) => l.token.toLowerCase()))
          return { head: inc.head, launches: [...inc.launches, ...cached.launches.filter((l) => !seen.has(l.token.toLowerCase()))], graduated: new Map([...cached.graduated, ...inc.graduated]) }
        })() : inc
        r.launches.forEach((l) => known.current.add(l.curve.toLowerCase()))
        setLaunches(r.launches); setGrads(r.graduated); setHead({ n: r.head, at: Date.now() })
        loadPairs(r.launches.map((l) => l.pair)).then(async (p) => {
          if (dead) return
          setPairs(p)
          // stock-token pairs (TTWO, NVDA…) have no on-chain USD price here: use the quote price pons publishes for a token on that pair
          const need = Object.entries(p).filter(([, v]) => v.usd === null)
          const priced = await Promise.all(need.map(async ([pair]) => {
            const l = r.launches.find((x) => x.pair === pair)
            if (!l) return null
            try { const j = await (await fetch(`/pons-api/launches/${l.token}`)).json(); return typeof j?.quoteUsd === 'number' && j.quoteUsd > 0 ? [pair, j.quoteUsd] as const : null } catch { return null }
          }))
          if (dead) return
          setPairs((cur) => { const n = { ...cur }; for (const x of priced) if (x) n[x[0]] = { ...n[x[0]], usd: x[1], source: 'pons' }; return n })
        }).catch(() => {})
        const t = (await tradesP).filter((x) => known.current.has(x.curve))
        if (dead) return
        t.sort((a, b) => Number(b.block - a.block))
        setTrades(t); last.current = headNow > r.head ? headNow : r.head; setLastEvent(Date.now())
        const traded = [...new Set(t.map((x) => x.curve))]
        const byCurve = new Map(r.launches.map((l) => [l.curve.toLowerCase(), l.token]))
        await Promise.all([
          refreshCurves([...traded, ...r.launches.slice(0, 150).map((l) => l.curve)]),
          ensureMeta([...(traded.map((c) => byCurve.get(c)).filter(Boolean) as Hex[]), ...r.launches.slice(0, 150).map((l) => l.token)]),
        ])
        if (!dead) setMeta((m) => { writeCache(r.launches, r.graduated, r.head, m); return m })
        keepRef.current = [...new Set([...traded, ...r.launches.slice(0, 150).map((l) => l.curve.toLowerCase())])]
      } catch (e) { setError((e as Error).message) }
    })()
    // keep trying every 5 s until the first price arrives (then the 30 s refresh takes over)
    const firstEth = () => ethUsd().then((v) => { if (dead) return; if (v) setEth(v); else setTimeout(firstEth, 5000) })
    firstEth()
    return () => { dead = true }
  }, [ensureMeta, refreshCurves])

  // live: poll new blocks
  useEffect(() => {
    let busy = false
    const id = setInterval(async () => {
      if (!last.current || busy) return
      busy = true
      try {
        const h = await rh.getBlockNumber()
        if (h <= last.current) return
        const from = last.current + 1n
        setHead({ n: h, at: Date.now() })
        const [nt0, fl] = await Promise.all([loadTrades(from, h), rh.getLogs({ address: PONS_FACTORY, fromBlock: from, toBlock: h })])
        // only now is the range read: if a lagging node failed it, the next poll asks for it again
        last.current = h
        const a = (x?: Hex) => ('0x' + x!.slice(26)) as Hex
        const nl: Launch[] = []
        const ng: [string, bigint][] = []
        for (const l of fl) {
          if (l.topics[0] === T_LAUNCH_TOPIC) nl.push({ token: a(l.topics[1]), curve: a(l.topics[2]), creator: a(l.topics[3]), block: l.blockNumber!, tx: l.transactionHash!, pair: ('0x' + l.data.slice(26, 66)).toLowerCase() as Hex })
          if (l.topics[0] === T_GRAD_TOPIC) ng.push([a(l.topics[1]).toLowerCase(), l.blockNumber!])
        }
        nl.forEach((l) => known.current.add(l.curve.toLowerCase()))
        const nt = nt0.filter((x) => known.current.has(x.curve))
        if (nl.length) { nl.reverse(); setLaunches((p) => [...nl, ...p]); ensureMeta(nl.map((l) => l.token)); refreshCurves(nl.map((l) => l.curve)) }
        if (ng.length) setGrads((p) => new Map([...p, ...ng]))
        if (nt.length || nl.length || ng.length) setLastEvent(Date.now())
        if (nt.length) {
          nt.sort((x, y) => Number(y.block - x.block))
          setTrades((p) => [...nt, ...p].slice(0, 6000))
          setFresh(new Set([...nt.map((t) => t.id), ...nt.map((t) => t.curve)]))
          refreshCurves([...new Set(nt.map((t) => t.curve))])
        }
      } catch { /* transient RPC error or lagging node: the same range is retried on the next tick */ } finally { busy = false }
    }, 1500)
    const p = setInterval(() => ethUsd().then((v) => v && setEth(v)), 30000)
    return () => { clearInterval(id); clearInterval(p) }
  }, [ensureMeta, refreshCurves])

  const byCurve = useMemo(() => new Map(launches.map((l) => [l.curve.toLowerCase(), l])), [launches])
  const byToken = useMemo(() => new Map(launches.map((l) => [l.token.toLowerCase(), l])), [launches])

  /** What a curve is priced in, and its USD rate when we know it (ETH via Coinbase, stablecoins at $1). */
  const pairOf = useCallback((curve: string): Pair => {
    const l = byCurve.get(curve.toLowerCase())
    if (!l) return { symbol: '?', decimals: 18, usd: null }
    const p = l.pair
    if (p === ETH_PAIR) return { symbol: 'ETH', decimals: 18, usd: eth }
    return pairs[p] ?? { symbol: '…', decimals: 18, usd: null }
  }, [byCurve, pairs, eth])
  /** raw quote amount → units of the pair currency */
  const unit = useCallback((curve: string, raw: bigint) => Number(raw) / 10 ** pairOf(curve).decimals, [pairOf])
  /** raw quote amount → USD, or null when the pair has no reliable USD price */
  const toUsd = useCallback((curve: string, raw: bigint) => { const p = pairOf(curve); return p.usd === null ? null : (Number(raw) / 10 ** p.decimals) * p.usd }, [pairOf])
  const tradeUsd = useCallback((t: Trade) => toUsd(t.curve, t.eth), [toUsd])
  /** price of one token in pair units */
  // a graduated curve is emptied into the pool, so its own price reads 0: use the newest trade we have instead
  const lastTradePair = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of trades) { const k = t.curve.toLowerCase(); if (!m.has(k) && t.tokens > 0n) m.set(k, unit(t.curve, t.eth) / (Number(t.tokens) / 1e18)) } // trades are newest first
    return m
  }, [trades, unit])
  // graduated tokens trade on a Uniswap v4 pool: pons prices it (api/graduated.js), refreshed every minute
  const [gradPx, setGradPx] = useState<Record<string, { p: number; m: number | null }>>({})
  useEffect(() => {
    let dead = false
    const load = () => fetch('/api/graduated').then((r) => (r.ok ? r.json() : null)).then((j) => { if (!dead && j?.c) setGradPx(j.c) }).catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    return () => { dead = true; clearInterval(id) }
  }, [])
  const pricePair = useCallback((c: Curve) => {
    const own = c.tokens > 0n && !c.graduated ? unit(c.key, c.quote) / (Number(c.tokens) / 1e18) : 0
    return own > 0 ? own : gradPx[c.key.toLowerCase()]?.p ?? lastTradePair.get(c.key.toLowerCase()) ?? 0
  }, [unit, lastTradePair, gradPx])
  const priceUsd = useCallback((c?: Curve) => { if (!c) return null; const p = pairOf(c.key); return p.usd === null ? null : pricePair(c) * p.usd }, [pairOf, pricePair])
  /** for sorting: 0 when unknown */
  const mcapUsd = useCallback((c?: Curve) => (priceUsd(c) ?? 0) * 1e9, [priceUsd])
  /** market cap as text: USD when known, else in the pair currency */
  const fmtMcap = useCallback((c?: Curve) => {
    if (!c) return '…'
    const u = priceUsd(c)
    if (u !== null) return usdFmt(u * 1e9)
    const v = pricePair(c) * 1e9
    return `${v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : v.toFixed(1)} ${pairOf(c.key).symbol}`
  }, [priceUsd, pricePair, pairOf])
  const raised = useCallback((c: Curve) => unit(c.key, c.quote > c.phantom ? c.quote - c.phantom : 0n), [unit])
  const goal = useCallback((c: Curve) => unit(c.key, c.threshold), [unit])

  // progress milestones crossed while watching (50 / 75 / 90 %)
  useEffect(() => {
    const marks: FeedItem[] = []
    for (const [c, cv] of Object.entries(curves)) {
      if (cv.graduated) continue
      const p = progress(cv), prev = crossed.current.get(c) ?? -1
      const step = p >= 0.9 ? 90 : p >= 0.75 ? 75 : p >= 0.5 ? 50 : 0
      if (step && step > prev) {
        crossed.current.set(c, step)
        // only announce real crossings seen live, not the state found on first load
        if (prev >= 0) marks.push({ id: `near-${c}-${step}`, kind: 'near', curve: c, block: head.n, pct: step })
      } else if (!crossed.current.has(c)) crossed.current.set(c, step)
    }
    if (marks.length) setNearMarks((m) => [...marks, ...m].slice(0, 40))
  }, [curves, head.n])

  const stats = useMemo(() => {
    const per: Record<string, TokenStats> = {}
    for (const t of trades) {
      const s = (per[t.curve] ??= { vol: 0, buys: 0, sells: 0, traders: new Set() })
      s.vol += tradeUsd(t) ?? 0
      if (t.side === 'buy') s.buys++; else s.sells++
      s.traders.add(t.trader.toLowerCase())
      if (!s.last) s.last = t
      s.first = t
    }
    return per
  }, [trades, tradeUsd])

  const feed = useMemo(() => {
    const items: FeedItem[] = []
    const win = head.n - WINDOW_MIN * BLOCKS_PER_MIN
    for (const l of launches) { if (l.block < win) break; items.push({ id: 'l-' + l.token, kind: 'launch', curve: l.curve.toLowerCase(), block: l.block }) }
    for (const [tok, b] of grads) { if (b < win) continue; const l = byToken.get(tok); if (l) items.push({ id: 'g-' + tok, kind: 'grad', curve: l.curve.toLowerCase(), block: b }) }
    for (const t of trades) { const u = tradeUsd(t) ?? 0; if (t.side === 'buy' && u >= WHALE_USD) items.push({ id: 'w-' + t.id, kind: 'whale', curve: t.curve, block: t.block, usd: u, trader: t.trader, tx: t.tx }) }
    items.push(...nearMarks)
    return items.filter((i) => byCurve.has(i.curve)).sort((a, b) => Number(b.block - a.block)).slice(0, 120)
  }, [launches, grads, trades, tradeUsd, nearMarks, byCurve, byToken, head.n])

  const blockTime = useCallback((b: bigint) => head.at - Number(head.n - b) * SECONDS_PER_BLOCK * 1000, [head])

  // big buys of the last 24 hours, kept on this device: they show the moment Orbit opens and don't vanish
  // when they get older than the hour of trades that is read live
  const [savedBig] = useState<BigBuy[]>(() => {
    try { return (JSON.parse(localStorage.getItem(BIG_KEY) || '[]') as BigBuy[]).filter((x) => x && typeof x.at === 'number' && Date.now() - x.at < DAY_MS && typeof x.usd === 'number') } catch { return [] }
  })
  const bigBuys = useMemo(() => {
    const m = new Map(savedBig.map((x) => [x.id, x]))
    if (head.n) for (const f of feed) if (f.kind === 'whale') m.set(f.id, { id: f.id, curve: f.curve, usd: f.usd, trader: f.trader, tx: f.tx, at: blockTime(f.block) })
    return [...m.values()].filter((x) => Date.now() - x.at < DAY_MS).sort((a, b) => b.at - a.at).slice(0, 200)
  }, [savedBig, feed, blockTime, head.n])
  useEffect(() => {
    const id = setTimeout(() => { try { localStorage.setItem(BIG_KEY, JSON.stringify(bigBuys)) } catch { /* full or private */ } }, 2000)
    return () => clearTimeout(id)
  }, [bigBuys])

  return { launches, grads, meta, curves, trades, head, eth, fresh, error, lastEvent, stats, feed, bigBuys, byCurve, byToken, blockTime, mcapUsd, fmtMcap, priceUsd, pricePair, pairOf, unit, toUsd, tradeUsd, raised, goal, ensureMeta, refreshCurves }
}
export type Live = ReturnType<typeof usePons>
