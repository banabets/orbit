import { useDexPaid } from '../lib/dexPaid'
import { useStableOrder } from '../lib/useStableOrder'
import { usePullToRefresh } from '../lib/usePullToRefresh'
import { DexPaidTag } from './DexPaid'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { OfficialNotice } from './OrbitCoin'
import { Verified } from './Verified'
import { isOfficialToken, ORBIT_TOKEN, ORBIT_SYMBOL, orbitBuyUrl } from '../lib/official'
import type { Hex } from 'viem'
import type { Live } from '../lib/usePons'
import { BLOCKS_PER_MIN } from '../lib/usePons'
import { loadCurveTrades, progress, SECONDS_PER_BLOCK, type Launch, type Trade, type Curve } from '../lib/pons'
import { creatorRewards, type CreatorRow } from '../lib/ponsApi'
import { usd, pct, agoMs, ageMin, short } from '../lib/format'
import { useT, LANGS } from '../lib/i18n'
import { useNames } from '../lib/names'
import type { Wallet } from '../lib/wallet'
import { TokenImg } from './TokenImg'
import { GIcon, Avatar, type Concept } from './Icon'
import { EthLogo } from './EthLogo'
import { OrbitMark } from './OrbitMark'
import { changeOf, tierOf, WHALE_USD } from './Home'
import { MPortfolio, MAlerts } from './MobileScreens'
import type { Alerts } from '../lib/alerts'
import { XIcon, X_URL, X_HANDLE } from './XLink'
import { useLabels, holderFacts, LABELS, type WalletLabel } from '../lib/labels'
import { buildCandles, buildTradeCandles, minutesIn } from '../lib/candles'
import { usePoolTicks } from '../lib/poolTicks'
import { useChartWindow } from '../lib/useChartWindow'
import { useCreatorFees } from '../lib/creatorFees'
import { ClaimedBadge } from './ClaimedBadge'
import '../mobile.css'
import '../mobile-screens.css'
import '../mobile-features.css'

export type MView = 'home' | 'live' | 'token' | 'ranking' | 'me' | 'wallet' | 'alerts' | 'other'
type Props = {
  live: Live; view: MView; curve?: string; go: (h: string) => void; openToken: (c: string) => void
  wallet: Wallet; follows: Set<string>; toggleFollow: (c: string) => void; writeCreator: (creator: Hex, symbol: string, curve: string) => void
  other: ReactNode; mail: ReactNode; showMail: boolean
  addr?: string; alerts: Alerts; creators: Set<string>; mailUnread?: number
}

const hueOf = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h }

/** The phone version of Orbit: an app-style shell with a bottom tab bar. Desktop never renders this. */
export function MobileApp(p: Props) {
  const { t } = useT()
  const [search, setSearch] = useState(false)
  const [sheet, setSheet] = useState(false)
  useEffect(() => { const open = () => setSheet(true); addEventListener('orbit:connect', open); return () => removeEventListener('orbit:connect', open) }, [])
  useEffect(() => { document.querySelector('.m-scroll')?.scrollTo?.(0, 0) }, [p.view, p.curve])
  useEffect(() => { if (p.wallet.address) setSheet(false) }, [p.wallet.address])
  const tab = p.view === 'wallet' || p.view === 'alerts' ? 'me' : p.view === 'token' || p.view === 'other' ? null : p.view
  // pull down to refresh: reloads the app (data is cached on the phone, so it is quick, and it picks up a new version)
  const scrollRef = useRef<HTMLDivElement>(null)
  const ptr = usePullToRefresh(scrollRef, () => location.reload())
  return (
    <div className="mapp">
      {p.view !== 'token' && <AppBar live={p.live} wallet={p.wallet} onSearch={() => setSearch(true)} onWallet={() => (p.wallet.address ? p.go('/me') : setSheet(true))} />}
      <div className={'m-ptr' + (ptr.busy ? ' busy' : ptr.ready ? ' ready' : '')} style={{ transform: `translate(-50%, ${ptr.pull - 56}px)`, opacity: Math.min(1, ptr.pull / 40) }} aria-hidden={!ptr.pull}>
        <span style={{ transform: `rotate(${ptr.pull * 3}deg)` }}><OrbitMark size={26} /></span>
      </div>
      <div className="m-scroll" ref={scrollRef} style={ptr.pull ? { transform: `translateY(${ptr.pull * 0.6}px)`, transition: 'none' } : undefined}>
        {p.view === 'home' && <MRadar live={p.live} follows={p.follows} openToken={p.openToken} />}
        {p.view === 'live' && <MLive live={p.live} follows={p.follows} openToken={p.openToken} />}
        {p.view === 'token' && p.curve && <MToken key={p.curve} live={p.live} curve={p.curve} back={() => history.length > 1 ? history.back() : p.go('/')} following={p.follows.has(p.curve)} toggleFollow={() => p.toggleFollow(p.curve!)} writeCreator={p.writeCreator} alerts={p.alerts} />}
        {p.view === 'ranking' && <MRanks />}
        {p.view === 'me' && <MMe live={p.live} wallet={p.wallet} follows={p.follows} go={p.go} openToken={p.openToken} connect={() => setSheet(true)} />}
        {p.view === 'wallet' && <MPortfolio key={p.addr ?? 'me'} live={p.live} addr={p.addr ?? null} me={p.wallet.address} connect={() => setSheet(true)} />}
        {p.view === 'alerts' && <MAlerts live={p.live} alerts={p.alerts} follows={p.follows} creators={p.creators} wallet={p.wallet} />}
        {p.view === 'other' && !p.showMail && <div className="m-other">{p.other}</div>}
        <div className="m-mail" style={{ display: p.showMail ? 'block' : 'none' }}>{p.mail}</div>
      </div>
      {p.view === 'token' ? null : (
        <nav className="m-nav" aria-label={t('Navigation')}>
          {([['home', 'Radar', 'radar', '/'], ['live', 'Live', 'hot', '/live']] as const).map(([k, l, ic, h]) => <a key={k} className={tab === k ? 'on' : ''} href={'#' + h}><GIcon name={ic} size={24} plain />{t(l)}</a>)}
          <a className={'center' + (p.showMail ? ' on' : '')} href="/mail" aria-label={t('Mail')}><span className="m-mailic"><GIcon name="mail" size={22} color="#fff" />{!!p.mailUnread && <i className="m-badge">{Math.min(99, p.mailUnread)}</i>}</span>{t('Mail')}</a>
          {([['ranking', 'Ranks', 'trophy', '/leaderboard'], ['me', 'Me', 'wallet', '/me']] as const).map(([k, l, ic, h]) => <a key={k} className={tab === k ? 'on' : ''} href={'#' + h}><GIcon name={ic} size={24} plain />{t(l)}</a>)}
        </nav>
      )}
      {search && <MSearch live={p.live} close={() => setSearch(false)} openToken={(c) => { setSearch(false); p.openToken(c) }} />}
      {sheet && <ConnectSheet wallet={p.wallet} close={() => setSheet(false)} />}
    </div>
  )
}

function AppBar({ live, wallet, onWallet, onSearch }: { live: Live; wallet: Wallet; onWallet: () => void; onSearch: () => void }) {
  const { t } = useT()
  const nameOf = useNames(wallet.address ? [wallet.address] : [])
  return (
    <header className="m-bar">
      <a className="m-brand" href="/"><OrbitMark size={24} /><span className="word">orbit</span></a>
      <span className="sp" />
      <button className="m-searchbtn" onClick={onSearch} aria-label={t('Search')}><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="7" cy="7" r="5" /><path d="M14 14l-3.2-3.2" /></svg></button>
      <span className="m-pill"><EthLogo size={16} />{live.eth ? '$' + Math.round(live.eth).toLocaleString('en-US') : '—'}</span>
      <button className="m-wallet" onClick={onWallet}>
        {wallet.address ? <><Avatar address={wallet.address} size={26} /><span>{nameOf(wallet.address).slice(0, 10)}</span></> : <><span className="m-wdot"><GIcon name="wallet" size={15} color="#fff" /></span>{t('Connect')}</>}
      </button>
    </header>
  )
}

/* ---------------- Radar ---------------- */
type MFilter = 'hot' | 'new' | 'near' | 'grad' | 'follow'
function MRadar({ live, follows, openToken }: { live: Live; follows: Set<string>; openToken: (c: string) => void }) {
  const { t } = useT()
  const [f, setF] = useState<MFilter>('hot')
  const { launches, curves, stats, meta, head, grads } = live
  const name = (l: Launch) => meta[l.token.toLowerCase()]
  const mins = (b: bigint) => (Number(head.n - b) * SECONDS_PER_BLOCK) / 60
  const day3 = head.n - 3n * 24n * 60n * BLOCKS_PER_MIN
  const launches3d = useMemo(() => launches.filter((l) => l.block >= day3).length, [launches, day3])
  const big = useMemo(() => live.feed.filter((x): x is Extract<typeof x, { kind: 'whale' }> => x.kind === 'whale'), [live.feed])
  const whales = big.filter((x) => x.usd >= WHALE_USD).length
  const stories = useMemo(() => {
    const top = launches.filter((l) => stats[l.curve.toLowerCase()]).sort((a, b) => stats[b.curve.toLowerCase()].vol - stats[a.curve.toLowerCase()].vol)
    const list = [...launches.slice(0, 5), ...top.filter((x) => !launches.slice(0, 5).includes(x)).slice(0, 12)]
    // the official coin always leads
    const nx = launches.find((x) => isOfficialToken(x.token))
    return nx ? [nx, ...list.filter((x) => x !== nx)] : list
  }, [launches, stats])
  const [more, setMore] = useState(20)
  useEffect(() => setMore(20), [f])
  const all = useMemo(() => {
    const withCurve = launches.filter((l) => curves[l.curve.toLowerCase()])
    const vol = (l: Launch) => stats[l.curve.toLowerCase()]?.vol ?? 0
    const nx = launches.find((x) => isOfficialToken(x.token))
    const pin = (list: Launch[]) => (nx ? [nx, ...list.filter((x) => x !== nx)] : list)
    if (f === 'new') return pin(launches)
    if (f === 'near') return withCurve.filter((l) => { const c = curves[l.curve.toLowerCase()]; return !c.graduated && progress(c) >= 0.5 }).sort((a, b) => progress(curves[b.curve.toLowerCase()]) - progress(curves[a.curve.toLowerCase()]))
    if (f === 'grad') return launches.filter((l) => curves[l.curve.toLowerCase()]?.graduated || grads.has(l.token.toLowerCase())).sort((a, b) => vol(b) - vol(a) || Number((grads.get(b.token.toLowerCase()) ?? 0n) - (grads.get(a.token.toLowerCase()) ?? 0n)))
    if (f === 'follow') return withCurve.filter((l) => follows.has(l.curve.toLowerCase()))
    return pin(withCurve.filter((l) => stats[l.curve.toLowerCase()]).sort((a, b) => vol(b) - vol(a)))
  }, [launches, curves, stats, f, follows, grads])
  // keep rows in place between re-sorts: re-sorting every tick made the list jump and look like it flickered
  const stableAll = useStableOrder(all, (l) => l.curve, 15_000, f)
  const list = stableAll.slice(0, more)
  const stableStories = useStableOrder(stories, (l) => l.token, 15_000)
  const fresh5 = useMemo(() => new Set(launches.slice(0, 5).map((x) => x.token)), [launches])
  const listKey = list.map((l) => l.curve).join()
  useEffect(() => {
    const missing = list.filter((l) => !curves[l.curve.toLowerCase()]).map((l) => l.curve)
    if (missing.length) live.refreshCurves(missing)
    live.ensureMeta(list.map((l) => l.token))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey])

  return (
    <>
      <Ticker live={live} openToken={openToken} />
      <div className="m-stories">
        {stableStories.map((l) => { const k = fresh5.has(l.token) ? 0 : 99, c = l.curve.toLowerCase(), ch = changeOf(live, c), m = name(l); return (
          <button key={l.token} className="m-story" onClick={() => openToken(c)}>
            <span className={'ring ' + (k < 5 ? 'new' : ch >= 0 ? 'up' : '')}><TokenImg src={m?.logo} seed={l.token} label={m?.symbol} className="fill" /></span>
            {k < 5 && <em>{t('NEW')}</em>}
            <b>{m?.symbol || short(l.token)}{isOfficialToken(l.token) && <Verified size={11} coin />}</b>
            <small className={'mono ' + (ch >= 0 ? 'up' : 'dn')}>{stats[c] ? pct(ch) : ageMin(mins(l.block))}</small>
          </button>) })}
      </div>
      <div className="m-chips">
        <div className="m-stat"><GIcon name="trades" size={22} /><div><b className="mono">{live.trades.length ? live.trades.length.toLocaleString('en-US') : '…'}</b><small>{t('trades / 1h')}</small></div></div>
        <div className="m-stat"><GIcon name="launch" size={22} /><div><b className="mono">{launches.length ? launches3d.toLocaleString('en-US') : '…'}</b><small>{t('launches / 3d')}</small></div></div>
        <div className="m-stat"><GIcon name="whale" size={24} /><div><b className="mono">{big.length}</b><small>{t('big buys')} · {whales} 🐋</small></div></div>
      </div>
      {ORBIT_TOKEN && <a className="m-orbit" href={orbitBuyUrl()} target="_blank" rel="noreferrer"><Verified size={20} coin /><span><b>${ORBIT_SYMBOL}</b><small>{t('The official Orbit coin')}</small></span><em>{t('Buy on pons')}</em></a>}
      <div className="m-tabs">
        {([['hot', '🔥 Hot'], ['new', 'New'], ['near', 'Near grad'], ['grad', 'Graduated'], ['follow', 'Following']] as const).map(([k, l]) => <button key={k} className={'m-tab' + (f === k ? ' on' : '')} onClick={() => setF(k)}>{t(l)}</button>)}
      </div>
      <div className="m-list">
        {!list.length && <div className="m-empty">{launches.length ? (f === 'follow' ? t('Follow tokens from their page.') : t('Nothing here with this filter yet.')) : t('Reading pons on Robinhood Chain…')}</div>}
        {list.map((l) => <TokenCard key={l.token} live={live} l={l} openToken={openToken} />)}
        {all.length > list.length && <button className="m-more" onClick={() => setMore((n) => n + 20)}>{t('Show more')} · {(all.length - list.length).toLocaleString('en-US')}</button>}
      </div>
    </>
  )
}

function TokenCard({ live, l, openToken }: { live: Live; l: Launch; openToken: (c: string) => void }) {
  const { t } = useT()
  const c = l.curve.toLowerCase(), cv = live.curves[c], m = live.meta[l.token.toLowerCase()], s = live.stats[c], ch = changeOf(live, c), p = cv ? progress(cv) : 0, pr = live.pairOf(c)
  const grad = !!cv?.graduated || live.grads.has(l.token.toLowerCase())
  useDexPaid([l.token])
  const mins = (Number(live.head.n - l.block) * SECONDS_PER_BLOCK) / 60
  return (
    <button className={'m-card' + (live.fresh.has(c) ? ' flash' : '')} onClick={() => openToken(c)}>
      <span className="glow" style={{ background: `radial-gradient(closest-side, hsl(${hueOf(l.token.toLowerCase())} 80% 55% / .9), hsl(${hueOf(l.token.toLowerCase())} 80% 55% / .35) 45%, transparent)` }} />
      <TokenImg src={m?.logo} seed={l.token} label={m?.symbol} className="r52" />
      <span className="n"><b>{isOfficialToken(l.token) && <Verified size={14} coin pre />}{m?.name || short(l.token)}</b><small>${m?.symbol} · {pr.symbol === 'ETH' ? <EthLogo size={12} /> : pr.symbol} · {ageMin(mins)}<DexPaidTag token={l.token} small /></small></span>
      <span className="r"><span className="mc mono">{cv && (live.mcapUsd(cv) > 0 || live.pricePair(cv) > 0) ? live.fmtMcap(cv) : cv ? '—' : '…'}</span>{s ? <span className={'chg ' + (ch >= 0 ? 'up' : 'dn')}>{pct(ch)}</span> : null}</span>
      {grad ? <span className="meta"><span><GIcon name="graduated" size={13} /> {t('Graduated')}</span><span>{s ? t('vol 1h') + ' ' + usd(s.vol) : ''}</span></span> : <>
        <span className="bar"><i style={{ width: `${Math.max(3, p * 100)}%` }} /></span>
        <span className="meta"><span>{t('{pct}% to graduation', { pct: (p * 100).toFixed(0) })}</span><span>{s ? t('vol 1h') + ' ' + usd(s.vol) : ''}</span></span>
      </>}
    </button>
  )
}

function Ticker({ live, openToken }: { live: Live; openToken: (c: string) => void }) {
  const latest = useMemo(() => live.trades.filter((x) => x.side === 'buy' && live.byCurve.has(x.curve)).slice(0, 14), [live.trades, live.byCurve])
  // the marquee scrolls half its own width: changing its content every tick made it jump. Refresh it every 12 s instead.
  const [items, setItems] = useState(latest)
  const latestRef = useRef(latest); latestRef.current = latest
  useEffect(() => { if (!items.length && latest.length) setItems(latest) }, [latest, items.length])
  useEffect(() => { const id = setInterval(() => setItems(latestRef.current), 12_000); return () => clearInterval(id) }, [])
  if (!items.length) return null
  const row = (copy: string) => items.map((x) => { const l = live.byCurve.get(x.curve)!, m = live.meta[l.token.toLowerCase()], u = live.tradeUsd(x); return (
    <button key={copy + x.id} onClick={() => openToken(x.curve)} tabIndex={copy === 'b' ? -1 : undefined} aria-hidden={copy === 'b' || undefined}><TokenImg src={m?.logo} seed={l.token} label={m?.symbol} className="r18" /><b className="mono">+{u !== null ? usd(u) : '…'}</b>${m?.symbol || short(l.token)}</button>) })
  return <div className="m-ticker"><div className="run">{row('a')}{row('b')}</div></div>
}

/* ---------------- Live buys ---------------- */
function MLive({ live, follows, openToken }: { live: Live; follows: Set<string>; openToken: (c: string) => void }) {
  const { t } = useT()
  const [f, setF] = useState<'all' | 'whale' | 'dolphin' | 'follow'>('all')
  const [hideBots, setHideBots] = useState(() => { try { return localStorage.getItem('orbit:hide-bots') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('orbit:hide-bots', hideBots ? '1' : '0') } catch { /* ignore */ } }, [hideBots])
  const labels = useLabels(live)
  const buys = useMemo(() => live.trades.filter((x) => x.side === 'buy' && live.byCurve.has(x.curve)).map((x) => ({ x, u: live.tradeUsd(x), labs: labels(x.trader, { curve: x.curve, trade: x }) }))
    .filter(({ x, u, labs }) => (f === 'all' || (f === 'follow' ? follows.has(x.curve) : tierOf(u) === f)) && !(hideBots && labs.includes('bot'))).slice(0, 50), [live.trades, live.byCurve, f, follows, live, labels, hideBots])
  const nameOf = useNames(buys.map((b) => b.x.trader))
  return (
    <>
      <div className="m-head"><span className="m-pulse" /><h2>{t('Live buys')}</h2></div>
      <div className="m-tabs">
        {([['all', 'All'], ['whale', '🐋 Whales'], ['dolphin', '🐬 Dolphins'], ['follow', 'Following']] as const).map(([k, l]) => <button key={k} className={'m-tab' + (f === k ? ' on' : '')} onClick={() => setF(k)}>{t(l)}</button>)}
        <button className={'m-tab' + (hideBots ? ' on' : '')} aria-pressed={hideBots} onClick={() => setHideBots((v) => !v)}>🤖 {t('Hide bots')}</button>
      </div>
      <div className="m-feed">
        {!buys.length && <div className="m-empty">{f === 'whale' || f === 'dolphin' ? t('No big buys in the last hour.') : t('Reading pons on Robinhood Chain…')}</div>}
        {buys.map(({ x, u, labs }) => { const l = live.byCurve.get(x.curve)!, m = live.meta[l.token.toLowerCase()], tier = tierOf(u); return (
          <button key={x.id} className={'m-buy ' + (tier ?? '') + (live.fresh.has(x.id) ? ' flash' : '')} onClick={() => openToken(x.curve)}>
            <span className="coin"><TokenImg src={m?.logo} seed={l.token} label={m?.symbol} className="r56" />{tier && <span className="tier"><GIcon name={tier} size={18} /></span>}</span>
            <span className="n"><b>${m?.symbol || short(l.token)}</b><small><Avatar address={x.trader} size={18} />{nameOf(x.trader)}</small>{labs.length > 0 && <span className="m-labs"><Labs list={labs} /></span>}</span>
            <span className="usd mono">+{u !== null ? usd(u) : `${live.unit(x.curve, x.eth).toFixed(2)} ${live.pairOf(x.curve).symbol}`}<small>{agoMs(live.blockTime(x.block))}</small></span>
          </button>) })}
      </div>
    </>
  )
}

/* ---------------- Token ---------------- */
function MToken({ live, curve, back, following, toggleFollow, writeCreator, alerts }: { live: Live; curve: string; back: () => void; following: boolean; toggleFollow: () => void; writeCreator: (creator: Hex, symbol: string, curve: string) => void; alerts: Alerts }) {
  const { t } = useT()
  const [alertOpen, setAlertOpen] = useState(false)
  const labels = useLabels(live)
  const l = live.byCurve.get(curve), cv = live.curves[curve], m = l ? live.meta[l.token.toLowerCase()] : undefined
  const [hist, setHist] = useState<Trade[] | null>(null)
  const [full, setFull] = useState(false)
  const [range, setRange] = useState<'1h' | '24h' | 'all'>('24h')
  const [kind, setKind] = useState<'line' | 'candles'>(() => { try { return localStorage.getItem('orbit:m-chart') === 'line' ? 'line' : 'candles' } catch { return 'candles' } })
  useEffect(() => { try { localStorage.setItem('orbit:m-chart', kind) } catch { /* ignore */ } }, [kind])
  const [shown, setShown] = useState(15)
  useEffect(() => {
    if (!l) return
    let dead = false
    // last 24h first (fast, enough for the default chart), the whole history right after
    const head = live.head.n, day = head - 1440n * BLOCKS_PER_MIN, from = l.block > day ? l.block : day
    let fullDone = false
    loadCurveTrades(curve, from, head).then((x) => { if (dead || fullDone) return; setHist(x); if (from === l.block) { fullDone = true; setFull(true) } }).catch(() => !dead && !fullDone && setHist([]))
    if (from !== l.block) loadCurveTrades(curve, l.block, head).then((x) => { if (dead) return; fullDone = true; setHist(x); setFull(true) }).catch(() => {})
    live.refreshCurves([curve]); live.ensureMeta([l.token])
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curve, l?.token])
  const all = useMemo(() => { const map = new Map<string, Trade>(); for (const x of hist ?? []) map.set(x.id, x); for (const x of live.trades) if (x.curve === curve) map.set(x.id, x); return [...map.values()].sort((a, b) => Number(a.block - b.block)) }, [hist, live.trades, curve])
  const recent = useMemo(() => [...all].reverse().slice(0, shown), [all, shown])
  // graduated: the pool's candles from pons continue the chart; drag / pinch to move and zoom it
  const pool = usePoolTicks(l?.token, !!cv?.graduated || kind === 'candles', range)
  const view = useChartWindow(0.02, `${range}:${kind}:${curve}`)
  const fees = useCreatorFees(l?.token)
  const facts = useMemo(() => (full ? holderFacts(all) : undefined), [full, all])
  const nameOf = useNames([...(l ? [l.creator] : []), ...recent.map((x) => x.trader)])
  // the token's story: key moments read from its full history
  const story = useMemo(() => {
    if (!full || !l) return []
    const rate = live.pairOf(curve).usd ?? 0
    const creator = l.creator.toLowerCase(), u = (x: Trade) => live.tradeUsd(x)
    const ev: { b: bigint; tone: string; title: string; sub: string }[] = [{ b: l.block, tone: '#60A5FA', title: t('Launched'), sub: t('by {name}', { name: nameOf(l.creator) }) }]
    const fb = all.find((x) => x.side === 'buy' && x.trader.toLowerCase() !== creator)
    if (fb) ev.push({ b: fb.block, tone: '#3BE38F', title: t('First buy') + (u(fb) !== null ? ' · ' + usd(u(fb)!) : ''), sub: nameOf(fb.trader) })
    const fw = all.find((x) => x.side === 'buy' && (u(x) ?? 0) >= 1000)
    if (fw) ev.push({ b: fw.block, tone: '#FFC53D', title: t('First whale') + ' · ' + usd(u(fw)!), sub: nameOf(fw.trader) })
    let ath = 0, athB = 0n
    if (rate) for (const x of all) if (x.tokens > 0n) { const v = (live.unit(curve, x.eth) / (Number(x.tokens) / 1e18)) * 1e9 * rate; if (v > ath) { ath = v; athB = x.block } }
    if (ath > 0 && all.length > 3) ev.push({ b: athB, tone: '#F472B6', title: t('All-time high') + ' · ' + usd(ath), sub: t('market cap') })
    const cs = all.find((x) => x.side === 'sell' && x.trader.toLowerCase() === creator)
    if (cs) ev.push({ b: cs.block, tone: '#FF5D6C', title: t('Creator sold') + (u(cs) !== null ? ' · ' + usd(u(cs)!) : ''), sub: t('first sell by the creator') })
    const gb = live.grads.get(l.token.toLowerCase())
    if (gb) ev.push({ b: gb, tone: '#A78BFA', title: t('Graduated') + ' 🎓', sub: t('moved to a Uniswap pool') })
    ev.sort((a, b) => Number(a.b - b.b))
    return ev.map((e) => ({ ...e, ath }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, all, curve, live.grads, live.pairOf])
  useDexPaid(l ? [l.token] : [])
  if (!l) return <div className="m-empty">{live.launches.length ? t('This token is not a pons v2 token.') : t('Reading pons…')}</div>
  const pr = live.pairOf(curve), rate = pr.usd ?? 0
  const k1 = 1e9 * (rate || 1)
  let seriesAll = all.filter((x) => x.tokens > 0n).map((x) => ({ t: live.blockTime(x.block), v: (live.unit(curve, x.eth) / (Number(x.tokens) / 1e18)) * k1 }))
  const lastCurve = seriesAll.length ? seriesAll[seriesAll.length - 1].t : 0
  for (const x of pool) if (x.t > lastCurve) seriesAll.push({ t: x.t, v: x.p * k1 })
  const cutT = range === 'all' ? 0 : Date.now() - (range === '1h' ? 60 : 1440) * 60_000
  // candles: pons' candles carry the real time of every trade (block numbers only give an estimate)
  const real = kind === 'candles' && pool.length >= 4 ? pool.map((x) => ({ t: x.t, v: x.p * k1 })).filter((x) => x.t >= cutT) : []
  const useReal = minutesIn(real) >= 24
  // a short burst of trading: candles per group of trades instead of a handful of 1-minute candles
  const byTrades = kind === 'candles' && !useReal
  const recentOnly = seriesAll.filter((x) => x.t >= cutT)
  // a quiet token: rather than two lonely candles, show its last 60 trades
  seriesAll = useReal ? real : recentOnly.length >= 10 ? recentOnly : seriesAll.slice(-60)
  let series = seriesAll
  if (view.zoomed && series.length > 2) {
    const t0 = series[0].t, sp = series[series.length - 1].t - t0 || 1, lo = t0 + view.a * sp, hi = t0 + view.b * sp
    const inside = series.filter((x) => x.t >= lo && x.t <= hi)
    if (inside.length >= 2) series = inside
  }
  const pts = series.map((x) => x.v)
  const ptsAll = seriesAll.map((x) => x.v)
  // a graduated curve is empty (its price reads 0): pons' pool price, else the last trade
  const mcap = cv?.graduated && pool.length ? pool[pool.length - 1].p * k1 : cv && live.mcapUsd(cv) > 0 ? live.mcapUsd(cv) : ptsAll.length ? ptsAll[ptsAll.length - 1] : 0
  const ch = ptsAll.length > 1 ? (ptsAll[ptsAll.length - 1] / ptsAll[0] - 1) * 100 : 0
  const earned = live.toUsd(curve, all.reduce((s, x) => s + (x.tax ?? 0n), 0n)) ?? 0
  const volAll = all.reduce((s, x) => s + (live.tradeUsd(x) ?? 0), 0)
  const buys = all.filter((x) => x.side === 'buy').length
  const p = cv ? progress(cv) : 0, left = cv ? Math.max(0, live.goal(cv) - live.raised(cv)) : 0
  const W = 378, H = 190
  let d = '', last: [number, number] | null = null
  const candles: { x: number; w: number; o: number; c: number; h: number; l: number }[] = []
  if (pts.length > 1) {
    // time candles shared with desktop (lib/candles): ~34 candles, quiet intervals skipped, wicks from every trade
    const cs = byTrades ? buildTradeCandles(series.map((x) => ({ t: x.t, p: x.v })), 34).candles : buildCandles(series.map((x) => ({ t: x.t, p: x.v })), 34).candles
    // the scale holds every wick, so no candle is cut off at the top or bottom
    const lo = Math.min(...pts, ...cs.map((k) => k.l)), hi = Math.max(...pts, ...cs.map((k) => k.h))
    const y = (v: number) => H - 14 - ((v - lo) / ((hi - lo) || 1)) * (H - 34)
    const P = pts.map((v, i) => [(i / (pts.length - 1)) * (W - 8) + 4, y(v)] as [number, number])
    d = P.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' '); last = P[P.length - 1]
    const bw = (W - 8) / Math.max(1, cs.length)
    cs.forEach((k, i) => candles.push({ x: 4 + i * bw, w: bw, o: y(k.o), c: y(k.c), h: y(k.h), l: y(k.l) }))
  }
  const up = ch >= 0, col = up ? '#3BE38F' : '#FF5D6C'
  return (
    <div className="m-token">
      <div className="m-hero">
        <div className="bgblur" style={{ background: `radial-gradient(ellipse at 30% 40%, hsl(${hueOf(l.token.toLowerCase())} 80% 55% / .8), hsl(${hueOf(l.token.toLowerCase())} 80% 55% / .25) 40%, transparent 72%)` }} />
        <div className="top"><button className="m-icon" onClick={back} aria-label={t('Back')}>‹</button><TokenImg src={m?.logo} seed={l.token} label={m?.symbol} className="r46" /><div className="m-tt"><h2>{m?.name || short(l.token)}{isOfficialToken(l.token) && <Verified size={18} coin />}</h2><span>${m?.symbol} · {pr.symbol === 'ETH' ? <EthLogo size={12} /> : null} {pr.symbol}<DexPaidTag token={l.token} small link /></span></div><span className="sp" /><button className={'m-icon' + (alerts.targets.some((x) => x.curve === curve) ? ' lit' : '')} onClick={() => setAlertOpen(true)} aria-label={t('Price alert')}><GIcon name="alerts" size={18} /></button></div>
        <div className="big mono">{pr.usd !== null ? usd(mcap) : '—'}</div>
        <div className="sub"><span className={'chg ' + (up ? 'up' : 'dn')}>{pct(ch)}</span><span className="mu">{t('market cap')} · {range}</span></div>
      </div>
      <OfficialNotice token={l.token} phone />
      <div className="m-chart" ref={view.ref} style={{ touchAction: 'pan-y', position: 'relative' }}>{view.zoomed && <button type="button" className="m-chart-reset" onClick={view.reset}>{t('Reset')}</button>}{hist === null || (range === 'all' && !full) ? <div className="m-skel" aria-label={t('loading history…')}><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div> : d ? <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Price chart')} {...view.handlers}><defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".35" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>{kind === 'line' ? <><path d={`${d} L${W - 4} ${H} L4 ${H}Z`} fill="url(#mg)" /><path d={d} fill="none" stroke={col} strokeWidth="2.4" />{last && <circle cx={last[0]} cy={last[1]} r="5" fill={col} stroke="#000" strokeWidth="2" />}</> : candles.map((k, i) => { const g = k.c <= k.o, cc = g ? '#3BE38F' : '#FF5D6C', cx = k.x + k.w / 2, top = Math.min(k.o, k.c); return <g key={i}><line x1={cx} x2={cx} y1={k.h} y2={k.l} stroke={cc} strokeWidth="1.2" /><rect x={k.x + k.w * 0.18} width={k.w * 0.64} y={top} height={Math.max(2, Math.abs(k.c - k.o))} rx="1.5" fill={cc} /></g> })}</svg> : <div className="m-empty">{t('Too few trades yet to draw the chart.')}</div>}</div>
      <div className="m-ranges">{(['1h', '24h', 'all'] as const).map((r) => <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r === 'all' ? t('All') : r}</button>)}
        <span className="m-kind" role="group" aria-label={t('Chart type')}>
          <button className={kind === 'candles' ? 'on' : ''} onClick={() => setKind('candles')} aria-label={t('Candles')}><svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="3" y="5" width="4" height="7" rx="1" /><path d="M5 2v3M5 12v3" stroke="currentColor" strokeWidth="1.4" /><rect x="11" y="3" width="4" height="9" rx="1" /><path d="M13 1v2M13 12v4" stroke="currentColor" strokeWidth="1.4" /></svg></button>
          <button className={kind === 'line' ? 'on' : ''} onClick={() => setKind('line')} aria-label={t('Line')}><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1.5 13l4.5-5 3.5 3 6.5-8" /></svg></button>
        </span></div>
      {cv && !cv.graduated && <div className="m-curve"><div className="row"><GIcon name="launch" size={18} /><b>{t('Bonding curve')}</b><span className="sp" /><b className="mono">{(p * 100).toFixed(1)}%</b></div><div className="trk"><i style={{ width: `${Math.max(3, p * 100)}%` }} /></div><div className="row mu"><span className="mono">{live.raised(cv).toFixed(2)} / {live.goal(cv).toFixed(2)} {pr.symbol}</span><span>{t('{n} {sym} to graduate', { n: left.toFixed(2), sym: pr.symbol })} 🎓</span></div></div>}
      {cv?.graduated && <div className="m-curve"><div className="row"><GIcon name="graduated" size={18} /><b>{t('Graduated')}</b></div><div className="row mu"><span>{t('Trades on a Uniswap v4 pool.')}</span></div></div>}
      <div className="m-grid2">
        <div><small>{t('Volume')}</small><b className="mono">{full ? usd(volAll) : '…'}</b></div>
        <div><small>{t('Buys / sells')}</small><b className="mono">{full ? <><span className="up">{buys}</span> / <span className="dn">{all.length - buys}</span></> : '…'}</b></div>
        <div><small>{t('Wallets')}</small><b className="mono">{full ? new Set(all.map((x) => x.trader.toLowerCase())).size : '…'}</b></div>
        <div className="gold"><small>{fees?.community ? t('Community earned') : t('Creator earned')}{fees?.claimed && <ClaimedBadge community={fees.community} />}</small><b className="mono">{fees ? (fees.usd !== null ? usd(fees.usd) : `${fees.quote.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${fees.symbol}`) : full ? usd(earned) : '…'}</b></div>
      </div>
      <button className="m-creator" onClick={() => writeCreator(l.creator, m?.symbol || '', curve)}><Avatar address={l.creator} size={40} /><span><small>{t('Created by')}</small><b>{nameOf(l.creator)}</b></span><span className="sp" /><span className="m-mini">{t('Message')} →</span></button>
      {story.length > 0 && <>
        <div className="m-sec">📖 {t('Story')}</div>
        <ol className="m-tl">{story.map((e, i) => <li key={i}><i style={{ background: e.tone }} /><b>{e.title}</b><small>{e.sub} · {i === 0 ? agoMs(live.blockTime(e.b)) : '+' + dur(live.blockTime(e.b) - live.blockTime(story[0].b)) + ' ' + t('after launch')}</small></li>)}</ol>
        <a className="m-share" target="_blank" rel="noreferrer" href={'https://x.com/intent/post?text=' + encodeURIComponent(storyText(t, m?.symbol || '', story, live.blockTime(l.block), cv, mcap, !!live.grads.get(l.token.toLowerCase())) + '\n' + location.origin + '/#/token/' + curve)}><XIcon size={16} />{t('Share the story on X')}</a>
      </>}
      <div className="m-sec"><GIcon name="trades" size={15} plain />{t('Trades')}</div>
      <div className="m-trows">
        {recent.map((x) => { const u = live.tradeUsd(x), tier = x.side === 'buy' ? tierOf(u) : null; return (
          <a key={x.id} className="m-trow" href={`/portfolio/${x.trader.toLowerCase()}`}>
            <Avatar address={x.trader} size={34} />
            <span><b>{nameOf(x.trader)}{(() => { const labs = labels(x.trader, { curve, trade: x, facts }); return labs.length ? <span className="m-labs in"><Labs list={labs} /></span> : null })()}</b><small>{x.side === 'buy' ? <span className="up">{t('Bought')}</span> : <span className="dn">{t('Sold')}</span>}{tier && <> · <GIcon name={tier} size={12} /></>} · {agoMs(live.blockTime(x.block))}</small></span>
            <span className={'amt mono ' + (x.side === 'buy' ? 'up' : 'dn')}>{x.side === 'buy' ? '+' : '−'}{u !== null ? usd(u) : live.unit(curve, x.eth).toFixed(3) + ' ' + pr.symbol}</span>
          </a>) })}
        {all.length > shown && <button className="m-more" onClick={() => setShown((n) => n + 20)}>{t('Load more')}</button>}
      </div>
      {alertOpen && <TargetSheet live={live} curve={curve} alerts={alerts} symbol={m?.symbol || ''} close={() => setAlertOpen(false)} />}
      <div className="m-cta">
        <button className={'star' + (following ? ' on' : '')} onClick={toggleFollow} aria-label={following ? t('Following') : t('Follow')}>{following ? '★' : '☆'}</button>
        <a className="go" href={`https://ponsfamily.com/launchpad/${l.token}`} target="_blank" rel="noreferrer"><GIcon name="trades" size={20} color="#04140b" />{t('Trade on pons')}</a>
      </div>
    </div>
  )
}

/* ---------------- Ranks ---------------- */
let rewardsCache: { rows: CreatorRow[] } | null = null
function MRanks() {
  const { t } = useT()
  const [r, setR] = useState(rewardsCache)
  useEffect(() => { if (!rewardsCache) creatorRewards().then((x) => { rewardsCache = x; setR(x) }).catch(() => setR({ rows: [] })) }, [])
  const rows = r?.rows ?? []
  const nameOf = useNames(rows.slice(0, 12).map((x) => x.address))
  const mc = ['#FFC53D', '#D4D4D8', '#D08A52']
  const pod = (x: CreatorRow, i: number) => (
    <a key={x.address} className={'m-pod' + (i === 0 ? ' first' : '')} href={`/creator/${x.address}`}>
      <span className="m"><GIcon name="medal" size={20} color={mc[i]} /></span>
      <Avatar address={x.address} size={i === 0 ? 58 : 46} />
      <b>{nameOf(x.address)}</b><span className="e mono">{usd(x.usd)}{x.coins[0].claimed && <ClaimedBadge />}</span>
      <span className="coinmini"><TokenImg src={x.coins[0].token.artwork} seed={x.coins[0].token.address} label={x.coins[0].token.symbol} className="r16" />${x.coins[0].token.symbol}</span>
    </a>
  )
  return (
    <>
      <div className="m-head"><h2>{t('Creator rewards')}</h2></div>
      <div className="m-tabs"><span className="m-tab on">💰 {t('Creators')}</span></div>
      {!r && <div className="m-empty">{t('Reading creator earnings from pons…')}</div>}
      {rows.length >= 3 && <div className="m-podium">{[1, 0, 2].map((i) => pod(rows[i], i))}</div>}
      {rows.slice(3, 25).map((x, i) => (
        <a key={x.address} className="m-lrow" href={`/creator/${x.address}`}>
          <span className="mono fa">{i + 4}</span><Avatar address={x.address} size={36} />
          <span className="who"><b>{nameOf(x.address)}</b><small><TokenImg src={x.coins[0].token.artwork} seed={x.coins[0].token.address} label={x.coins[0].token.symbol} className="r14" />${x.coins[0].token.symbol}</small></span>
          <span className="e mono">{usd(x.usd)}{x.coins[0].claimed && <ClaimedBadge />}</span>
        </a>
      ))}
      <div style={{ height: 110 }} />
    </>
  )
}

/* ---------------- Me ---------------- */
function MMe({ live, wallet, follows, go, openToken, connect }: { live: Live; wallet: Wallet; follows: Set<string>; go: (h: string) => void; openToken: (c: string) => void; connect: () => void }) {
  const { t, pref, setPref } = useT()
  const nameOf = useNames(wallet.address ? [wallet.address] : [])
  const tiles: [Concept, string, string][] = [['wallet', 'Portfolio', '/portfolio'], ['mail', 'Mail', '/mail'], ['alerts', 'Alerts', '/alerts'], ['new', 'Docs', '/docs']]
  return (
    <>
      <div className="m-me">
        {wallet.address ? <>
          <Avatar address={wallet.address} size={64} />
          <div><h2>{nameOf(wallet.address)}</h2><span className="mu mono">{short(wallet.address)} · {wallet.name}</span>
            <span className="m-me-acts">{!wallet.chainOk && <button className="m-tab on" onClick={wallet.switchChain}>{t('Switch network')}</button>}<button className="m-tab m-disc" onClick={wallet.disconnect}>{t('Disconnect')}</button></span>
            {wallet.error && <p className="m-err">{t(wallet.error)}</p>}</div>
        </> : <>
          <span className="m-meicon"><GIcon name="wallet" size={32} /></span>
          <div><h2>{t('Your account')}</h2><span className="mu">{t('Connect to see your bags, P&L and alerts')}</span></div>
        </>}
      </div>
      {!wallet.address && <button className="m-bigbtn" onClick={connect}>{t('Connect wallet')}</button>}
      <div className="m-tiles">{tiles.map(([ic, l, h]) => <button key={h} onClick={() => go(h)}><GIcon name={ic} size={26} /><span>{t(l)}</span></button>)}</div>
      <div className="m-sec">{t('Watchlist')}</div>
      {!follows.size && <div className="m-empty">{t('Follow tokens from their page.')}</div>}
      <div className="m-list">{[...follows].map((c) => { const l = live.byCurve.get(c); return l && live.curves[c] ? <TokenCard key={c} live={live} l={l} openToken={openToken} /> : null })}</div>
      <div className="m-sec">{t('Language')}</div>
      <div className="m-tabs wrap">{[{ code: 'auto' as const, name: t('Automatic (device)') }, ...LANGS].map((x) => <button key={x.code} className={'m-tab' + (pref === x.code ? ' on' : '')} onClick={() => setPref(x.code)}>{x.name}</button>)}</div>
      {X_URL && <a className="m-xrow" href={X_URL} target="_blank" rel="noreferrer"><span className="ic"><XIcon size={20} /></span><span className="tx"><b>{t('Follow Orbit on X')}</b><small>{X_HANDLE}</small></span><span aria-hidden="true">↗</span></a>}
      <p className="m-build">Orbit · {__BUILD__}</p>
      {wallet.address && <button className="m-link" onClick={wallet.disconnect}>{t('Disconnect')}</button>}
      <div style={{ height: 110 }} />
    </>
  )
}

/* ---------------- Search + connect sheet ---------------- */
function MSearch({ live, close, openToken }: { live: Live; close: () => void; openToken: (c: string) => void }) {
  const { t } = useT()
  const [q, setQ] = useState('')
  const res = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return live.launches.filter((l) => live.stats[l.curve.toLowerCase()]).slice(0, 12)
    return live.launches.filter((l) => { const m = live.meta[l.token.toLowerCase()]; return l.token.toLowerCase().includes(s) || l.curve.toLowerCase().includes(s) || m?.name.toLowerCase().includes(s) || m?.symbol.toLowerCase().includes(s) }).slice(0, 30)
  }, [q, live.launches, live.meta, live.stats])
  return (
    <div className="m-overlay">
      <div className="m-searchbar"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search token, $ticker or 0x…')} aria-label={t('Search')} /><button onClick={close}>{t('Close')}</button></div>
      <div className="m-list">{res.map((l) => live.curves[l.curve.toLowerCase()] ? <TokenCard key={l.token} live={live} l={l} openToken={openToken} /> : (
        <button key={l.token} className="m-card" onClick={() => openToken(l.curve.toLowerCase())}><TokenImg src={live.meta[l.token.toLowerCase()]?.logo} seed={l.token} label={live.meta[l.token.toLowerCase()]?.symbol} className="r52" /><span className="n"><b>{live.meta[l.token.toLowerCase()]?.name || short(l.token)}</b><small>${live.meta[l.token.toLowerCase()]?.symbol}</small></span></button>))}</div>
    </div>
  )
}

function ConnectSheet({ wallet, close }: { wallet: Wallet; close: () => void }) {
  const { t } = useT()
  const here = location.host + location.pathname
  const standalone = typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches
  return (
    <>
      <div className="m-dim" onClick={close} />
      <div className="m-sheet" role="dialog" aria-label={t('Connect wallet')}>
        <span className="grab" />
        <h3>{t('Connect wallet')}</h3>
        <p>{t('Your wallet is your account. No email, no password. Orbit never asks for your secret phrase.')}</p>
        {wallet.available ? (
          <button className="m-wopt" onClick={wallet.connect} disabled={wallet.connecting}><span className="wi" style={{ background: '#F6851B22' }}>🦊</span>{wallet.name}<span className="sp" /><small>{wallet.connecting ? t('Connecting…') : t('Detected')}</small></button>
        ) : null}
        {wallet.available && wallet.connecting && <p className="center">{t('Approve the request in {name}. Nothing happens until you do.', { name: wallet.name })} <button className="m-inline" onClick={wallet.cancel}>{t('Cancel')}</button></p>}
        {!wallet.available && <>
          <p className="m-hint">{standalone ? t('Apps on your home screen cannot see your wallet. Open Orbit inside your wallet app: it connects there in one tap.') : t('This browser has no wallet. Open Orbit inside your wallet app: it connects there in one tap.')}</p>
          <a className="m-wopt" href={`https://metamask.app.link/dapp/${here}`}><span className="wi" style={{ background: '#F6851B22' }}>🦊</span>MetaMask<span className="sp" /><small>{t('Open in app')}</small></a>
          <a className="m-wopt" href={`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(location.href)}`}><span className="wi" style={{ background: '#0052FF22' }}>🔵</span>Coinbase Wallet<span className="sp" /><small>{t('Open in app')}</small></a>
          <a className="m-wopt" href={`https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(location.href)}`}><span className="wi" style={{ background: '#3375BB22' }}>🛡️</span>Trust Wallet<span className="sp" /><small>{t('Open in app')}</small></a>
        </>}
        {wallet.available && wallet.error && <p className="err">{t(wallet.error)}</p>}
        <p className="center">{t('Robinhood Chain is added automatically')}</p>
      </div>
    </>
  )
}

/* ---------------- shared bits ---------------- */
function Labs({ list }: { list: WalletLabel[] }) {
  const { t } = useT()
  return <>{list.map((k) => <span key={k} className={'m-lab ' + LABELS[k].tone} title={t(LABELS[k].text)}>{LABELS[k].icon} {t(LABELS[k].text)}</span>)}</>
}

const dur = (ms: number) => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? m + 'm' : m < 2880 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : Math.round(m / 1440) + 'd' }

function storyText(t: (s: string, v?: Record<string, string | number>) => string, sym: string, story: { title: string; ath: number }[], launchedAt: number, cv: Curve | undefined, mcap: number, graduated: boolean) {
  const lines = [t('${s} on pons', { s: sym })]
  lines.push('🚀 ' + t('Launched {ago}', { ago: agoMs(launchedAt) }))
  if (story[0]?.ath) lines.push('📈 ' + t('All-time high') + ' ' + usd(story[0].ath))
  lines.push(graduated ? '🎓 ' + t('Graduated') : '⏳ ' + t('{pct}% of the curve', { pct: cv ? (progress(cv) * 100).toFixed(0) : '0' }) + (mcap ? ' · ' + usd(mcap) : ''))
  lines.push(t('Follow it live on Orbit 👇'))
  return lines.join('\n')
}

/** "Ping me when the market cap goes above / below X" for one token. */
function TargetSheet({ live, curve, alerts, symbol, close }: { live: Live; curve: string; alerts: Alerts; symbol: string; close: () => void }) {
  const { t } = useT()
  const now = live.curves[curve] ? live.mcapUsd(live.curves[curve]) : 0
  const [dir, setDir] = useState<'above' | 'below'>('above')
  const [val, setVal] = useState(() => (now ? String(Math.round(now * 2)) : ''))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const mine = alerts.targets.filter((x) => x.curve === curve)
  const quick = dir === 'above' ? [2, 5, 10] : [0.75, 0.5]
  const pick = (d: 'above' | 'below') => { setDir(d); setMsg(null); if (now) setVal(String(Math.round(now * (d === 'above' ? 2 : 0.5)))) }
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseFloat(val.replace(/[^0-9.]/g, ''))
    if (!now) return setMsg({ ok: false, text: t('This token has no USD price yet.') })
    if (!n || (dir === 'above' && n <= now) || (dir === 'below' && n >= now)) return setMsg({ ok: false, text: dir === 'above' ? t('Pick a number above the current {v}.', { v: usd(now) }) : t('Pick a number below the current {v}.', { v: usd(now) }) })
    alerts.addTarget(curve, dir, n, now)
    setMsg({ ok: true, text: t('Done. We will ping you when ${s} reaches {v}.', { s: symbol, v: usd(n) }) })
  }
  return (
    <>
      <div className="m-dim fixed" onClick={close} />
      <form className="m-sheet fixed" role="dialog" aria-label={t('Price alert')} onSubmit={save}>
        <span className="grab" />
        <h3>{t('Price alert')} · ${symbol}</h3>
        <p>{t('Market cap now')} <b className="mono" style={{ color: '#fff' }}>{now ? usd(now) : '—'}</b></p>
        <div className="m-seg2"><button type="button" className={dir === 'above' ? 'on' : ''} onClick={() => pick('above')}>{t('Goes above')}</button><button type="button" className={dir === 'below' ? 'on' : ''} onClick={() => pick('below')}>{t('Drops below')}</button></div>
        <label className="m-amount"><span>$</span><input id="target-usd" inputMode="decimal" value={val} onChange={(e) => { setVal(e.target.value); setMsg(null) }} aria-label={t('Market cap in USD')} /></label>
        <div className="m-quick">{quick.map((q) => <button type="button" key={q} onClick={() => now && setVal(String(Math.round(now * q)))}>{q >= 1 ? q + '×' : '−' + Math.round((1 - q) * 100) + '%'}</button>)}</div>
        {msg && <p className={msg.ok ? 'okmsg' : 'err'}>{msg.text}</p>}
        <button className="m-bigbtn" style={{ margin: 0, width: '100%' }} type="submit">{t('Set alert')}</button>
        {mine.length > 0 && <div className="m-targets">{mine.map((x) => <div key={x.id}><span>{x.dir === 'above' ? '↑' : '↓'} {usd(x.usd)}</span><button type="button" onClick={() => alerts.removeTarget(x.id)} aria-label={t('Remove')}>✕</button></div>)}</div>}
        <p className="center">{t('Alerts fire while Orbit is open on this device.')}</p>
      </form>
    </>
  )
}
