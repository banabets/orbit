import { navigate } from './nav'
import { useEffect, useRef, useState } from 'react'
import type { Live } from './usePons'
import { dexPaidInfo, onDexPaid, requestDexPaid } from './dexPaid'

export type AlertPrefs = { followedNear: boolean; followedGrad: boolean; creatorLaunch: boolean; devSell: boolean; whaleAny: boolean; whaleMin: number; anyGrad: boolean; dexPaid: boolean; mailSound: boolean; mailNotify: boolean }
export const DEFAULT_PREFS: AlertPrefs = { followedNear: true, followedGrad: true, creatorLaunch: true, devSell: true, whaleAny: false, whaleMin: 500, anyGrad: false, dexPaid: true, mailSound: true, mailNotify: true }
/** "Ping me when this token's market cap goes above/below X". One-shot: removed once it fires. */
export type PriceTarget = { id: string; curve: string; dir: 'above' | 'below'; usd: number; from: number; at: number }
export type AlertItem = { id: string; at: number; title: string; body: string; curve: string; kind: string }

const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d } catch { return d } }
const loadArr = <T,>(k: string): T[] => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T[]) : [] } catch { return [] } }
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }

export const notifySupported = typeof window !== 'undefined' && 'Notification' in window

/**
 * Watches the live pons stream and fires browser notifications for the user's rules.
 * Runs only while a Orbit tab is open: there is no server.
 */
export function useAlerts(live: Live, follows: Set<string>, creators: Set<string>, t: (en: string, vars?: Record<string, string | number>) => string = (x) => x) {
  const [prefs, setPrefs] = useState<AlertPrefs>(() => load('orbit:alerts', DEFAULT_PREFS))
  const [history, setHistory] = useState<AlertItem[]>(() => loadArr('orbit:alert-log'))
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(notifySupported ? Notification.permission : 'unsupported')
  const seen = useRef<Set<string> | null>(null)
  const seenTrades = useRef<Set<string> | null>(null)
  const [targets, setTargets] = useState<PriceTarget[]>(() => loadArr('orbit:targets'))
  useEffect(() => save('orbit:targets', targets), [targets])

  useEffect(() => save('orbit:alerts', prefs), [prefs])
  useEffect(() => save('orbit:alert-log', history.slice(0, 60)), [history])

  const sym = (curve: string) => { const l = live.byCurve.get(curve); return (l && live.meta[l.token.toLowerCase()]?.symbol) || 'token' }
  const fire = (items: AlertItem[]) => {
    if (!items.length) return
    setHistory((h) => [...items, ...h].slice(0, 60))
    if (notifySupported && Notification.permission === 'granted') {
      for (const it of items.slice(0, 4)) {
        const l = live.byCurve.get(it.curve), m = l ? live.meta[l.token.toLowerCase()] : undefined
        const logo = m?.logo?.startsWith('ipfs://') ? 'https://ipfs.filebase.io/ipfs/' + m.logo.slice(7) : m?.logo
        try {
          const n = new Notification(it.title, { body: it.body, icon: logo || undefined, tag: it.id })
          n.onclick = () => { window.focus(); navigate('/token/' + it.curve); n.close() }
        } catch { /* some browsers only allow notifications from a service worker */ }
      }
    }
  }

  // feed events: launches, graduations, whales, curve milestones
  useEffect(() => {
    if (!live.feed.length) return
    if (!seen.current) { seen.current = new Set(live.feed.map((f) => f.id)); return }
    const out: AlertItem[] = []
    for (const f of live.feed) {
      if (seen.current.has(f.id)) continue
      seen.current.add(f.id)
      const followed = follows.has(f.curve), s = sym(f.curve), l = live.byCurve.get(f.curve)
      if (f.kind === 'launch' && prefs.creatorLaunch && l && creators.has(l.creator.toLowerCase()))
        out.push({ id: f.id, at: Date.now(), kind: 'launch', curve: f.curve, title: t('New token from a creator you follow: ${s}', { s }), body: t('{a} just launched on pons', { a: l.creator.slice(0, 6) + '…' }) })
      if (f.kind === 'grad' && ((prefs.followedGrad && followed) || prefs.anyGrad))
        out.push({ id: f.id, at: Date.now(), kind: 'grad', curve: f.curve, title: t('${s} graduated', { s }), body: t('It completed its curve on pons') })
      if (f.kind === 'near' && prefs.followedNear && followed)
        out.push({ id: f.id, at: Date.now(), kind: 'near', curve: f.curve, title: t('${s} crossed {pct}% of its curve', { s, pct: f.pct }), body: t('On its way to graduation') })
      if (f.kind === 'whale' && ((prefs.whaleAny && f.usd >= prefs.whaleMin) || (followed && f.usd >= 100)))
        out.push({ id: f.id, at: Date.now(), kind: 'whale', curve: f.curve, title: t('{tier} buy of ${v} in ${s}', { tier: f.usd >= 1000 ? t('Whale') : t('Dolphin'), v: Math.round(f.usd).toLocaleString('en-US'), s }), body: `${f.trader.slice(0, 6)}…${f.trader.slice(-4)}` })
    }
    fire(out)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.feed])

  // a followed token gets Dex paid (its team pays for the DexScreener profile): re-checked every 3 minutes.
  // Only a change seen while Orbit is open fires; tokens already paid when first seen stay quiet.
  const dexWas = useRef<Map<string, boolean>>(new Map())
  const followTokens = [...follows].map((c) => live.byCurve.get(c)?.token.toLowerCase()).filter((x): x is string => !!x)
  const followKey = followTokens.join()
  useEffect(() => {
    if (!prefs.dexPaid || !followKey) return
    const toks = followKey.split(',')
    for (const tk of toks) { const i = dexPaidInfo(tk); if (i && !dexWas.current.has(tk)) dexWas.current.set(tk, i.paid) }
    const check = () => {
      const out: AlertItem[] = []
      for (const tk of toks) {
        const i = dexPaidInfo(tk); if (!i) continue
        const was = dexWas.current.get(tk)
        dexWas.current.set(tk, i.paid)
        if (was === false && i.paid) {
          const l = live.byToken.get(tk); if (!l) continue
          const curve = l.curve.toLowerCase()
          out.push({ id: 'dex-' + tk, at: Date.now(), kind: 'dexpaid', curve, title: t('${s} is Dex paid', { s: sym(curve) }), body: t('The team paid for its DexScreener profile') })
        }
      }
      fire(out)
    }
    const off = onDexPaid(check)
    requestDexPaid(toks, true)
    const id = setInterval(() => requestDexPaid(toks, true), 3 * 60_000)
    return () => { off(); clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.dexPaid, followKey])

  const tt = t
  // the creator selling a token the user follows
  useEffect(() => {
    if (!live.trades.length) return
    if (!seenTrades.current) { seenTrades.current = new Set(live.trades.map((t) => t.id)); return }
    const out: AlertItem[] = []
    for (const t of live.trades.slice(0, 200)) {
      if (seenTrades.current.has(t.id)) continue
      seenTrades.current.add(t.id)
      if (!prefs.devSell || t.side !== 'sell' || !follows.has(t.curve)) continue
      const l = live.byCurve.get(t.curve)
      if (l && l.creator.toLowerCase() === t.trader.toLowerCase()) {
        const u = live.tradeUsd(t)
        out.push({ id: 'dev-' + t.id, at: Date.now(), kind: 'devsell', curve: t.curve, title: tt('The creator of ${s} sold', { s: sym(t.curve) }), body: tt('Took out') + ` ${live.unit(t.curve, t.eth).toFixed(4)} ${live.pairOf(t.curve).symbol}${u !== null ? ` ($${Math.round(u).toLocaleString('en-US')})` : ''} ` + tt('from the curve') })
      }
    }
    fire(out)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.trades])

  // price targets: checked whenever a curve is re-read (every trade re-reads its curve)
  const targetCurves = targets.map((x) => x.curve).join()
  useEffect(() => { if (live.head.n && targets.length) live.refreshCurves(targets.map((x) => x.curve)) }, [!!live.head.n, targetCurves]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!targets.length) return
    const hit: { x: PriceTarget; m: number }[] = []
    for (const x of targets) {
      const c = live.curves[x.curve]; if (!c) continue
      const m = live.mcapUsd(c); if (!m) continue
      if (x.dir === 'above' ? m >= x.usd : m <= x.usd) hit.push({ x, m })
    }
    if (!hit.length) return
    setTargets((ts) => ts.filter((x) => !hit.some((h) => h.x.id === x.id)))
    const k = (v: number) => '$' + (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v.toFixed(0))
    fire(hit.map(({ x, m }) => ({
      id: 'tgt-' + x.id, at: Date.now(), kind: 'target', curve: x.curve,
      title: x.dir === 'above' ? t('${s} is above {v} market cap', { s: sym(x.curve), v: k(x.usd) }) : t('${s} dropped below {v} market cap', { s: sym(x.curve), v: k(x.usd) }),
      body: x.from > 0 ? (m >= x.from ? t('{x}× since you set the alert', { x: (m / x.from).toFixed(1) }) : t('{p}% since you set the alert', { p: '−' + ((1 - m / x.from) * 100).toFixed(0) })) : '',
    })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.curves])
  const addTarget = (curve: string, dir: 'above' | 'below', usd: number, from: number) =>
    setTargets((ts) => [...ts, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), curve: curve.toLowerCase(), dir, usd, from, at: Date.now() }])
  const removeTarget = (id: string) => setTargets((ts) => ts.filter((x) => x.id !== id))

  const ask = async () => { if (notifySupported) setPerm(await Notification.requestPermission()) }
  const test = () => fire([{ id: 'test-' + Date.now(), at: Date.now(), kind: 'test', curve: live.launches[0]?.curve.toLowerCase() ?? '', title: t('Orbit alerts are on'), body: t('This is how we will ping you while Orbit is open') }])
  return { prefs, setPrefs, history, clear: () => setHistory([]), perm, ask, test, targets, addTarget, removeTarget }
}
export type Alerts = ReturnType<typeof useAlerts>
