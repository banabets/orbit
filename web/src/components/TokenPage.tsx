import { useDexPaid } from '../lib/dexPaid'
import { DexPaidTag } from './DexPaid'
import { useEffect, useMemo, useState } from 'react'
import { OfficialNotice } from './OrbitCoin'
import { Verified } from './Verified'
import { isOfficialToken } from '../lib/official'
import { TargetDialog } from './TargetDialog'
import type { Alerts } from '../lib/alerts'
import { useCreatorFees } from '../lib/creatorFees'
import { ClaimedBadge } from './ClaimedBadge'
import { usePoolTicks } from '../lib/poolTicks'
import { minutesIn } from '../lib/candles'
import type { Hex } from 'viem'
import type { Live } from '../lib/usePons'
import { loadCurveTrades, loadSocials, progress, SECONDS_PER_BLOCK, type Trade } from '../lib/pons'
import { usd, px, pct, agoMs, ageMin, short } from '../lib/format'
import { useT } from '../lib/i18n'
import { GIcon, Avatar } from './Icon'
import { EthLogo } from './EthLogo'
import { tierOf } from './Home'
import { TokenImg } from './TokenImg'
import { useNames, hasProfile } from '../lib/names'
import { Chart, type Pt } from './Chart'
import '../token.css'

const EXPLORER = 'https://robin.etherscan.io'
const DAY = BigInt(Math.round(86400 / SECONDS_PER_BLOCK))
type Range = '15m' | '1h' | '24h'

export function TokenPage({ live, curve, back, following, toggleFollow, writeCreator, alerts }: { live: Live; curve: string; back: () => void; following: boolean; toggleFollow: () => void; writeCreator: (creator: Hex, symbol: string, curve: string) => void; alerts: Alerts }) {
  const { t: tr } = useT()
  const l = live.byCurve.get(curve)
  const m = l ? live.meta[l.token.toLowerCase()] : undefined
  const cv = live.curves[curve]
  const [hist, setHist] = useState<Trade[] | null>(null)
  const [socials, setSocials] = useState<string[]>([])
  const [type, setType] = useState<'line' | 'candles'>('line')
  const [unit, setUnit] = useState<'price' | 'mcap'>('mcap')
  const [range, setRange] = useState<Range>('24h')
  const [tab, setTab] = useState<'trades' | 'buyers' | 'info'>('trades')
  const [page, setPage] = useState(0)
  const [per, setPer] = useState(10)
  const [onlyBuys, setOnlyBuys] = useState<'all' | 'buy' | 'sell'>('all')
  const [targetOpen, setTargetOpen] = useState(false)

  useEffect(() => {
    if (!l) return
    let dead = false
    setHist(null); setSocials([])
    // the whole life of the curve: needed for creator rewards and all-time traders
    loadCurveTrades(curve, l.block, live.head.n).then((t) => { if (!dead) setHist(t) }).catch(() => !dead && setHist([]))
    loadSocials(l.token).then((s) => !dead && setSocials(s))
    live.refreshCurves([curve])
    live.ensureMeta([l.token])
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curve, l?.token])

  // history + anything that arrived live since
  const all = useMemo(() => {
    const map = new Map<string, Trade>()
    for (const t of hist ?? []) map.set(t.id, t)
    for (const t of live.trades) if (t.curve === curve) map.set(t.id, t)
    return [...map.values()].sort((a, b) => Number(a.block - b.block))
  }, [hist, live.trades, curve])

  // after graduation the token trades on its pool: pons' candles continue the chart
  // pons' candles: real trade times for the candle chart, and the pool's trades after graduation
  const pool = usePoolTicks(l?.token, !!cv?.graduated || type === 'candles', range)
  const fees = useCreatorFees(l?.token)
  const pr = live.pairOf(curve)
  const rate = pr.usd ?? 0
  /** pair amount → text: USD when we know the rate, else the pair currency */
  const V = (n: number) => (pr.usd !== null ? usd(n * rate) : `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${pr.symbol}`)
  // pons' candles in range, used when they cover enough minutes to draw a real time chart
  const realPts: Pt[] | null = useMemo(() => {
    if (type !== 'candles' || pool.length < 4) return null
    const k = pr.usd ?? 1, cut = { '15m': 15, '1h': 60, '24h': 1440 }[range] * 60000
    const real = pool.map((x) => ({ t: x.t, p: x.p * k, buy: x.up, u: x.v * k, whale: false }))
    const inRange = real.filter((p) => p.t >= Date.now() - cut)
    return minutesIn(inRange) >= 24 ? inRange : null
  }, [type, pool, pr, range])
  const pts: Pt[] = useMemo(() => {
    const cut = { '15m': 15, '1h': 60, '24h': 1440 }[range] * 60000
    const now = Date.now()
    let arr = all.filter((t) => t.tokens > 0n).map((t) => {
      const e = live.unit(curve, t.eth), k = pr.usd ?? 1
      return { t: live.blockTime(t.block), p: (e / (Number(t.tokens) / 1e18)) * k, buy: t.side === 'buy', u: e * k, whale: pr.usd !== null && t.side === 'buy' && e * k >= 250 }
    })
    const k = pr.usd ?? 1
    // candles: pons' candles carry the real time of every trade (block numbers only give an estimate)
    if (realPts) return realPts
    const lastCurve = arr.length ? arr[arr.length - 1].t : 0
    for (const x of pool) if (x.t > lastCurve) arr.push({ t: x.t, p: x.p * k, buy: x.up, u: x.v * k, whale: false })
    const f = arr.filter((p) => p.t >= now - cut)
    // a quiet token: rather than two lonely candles, show its last 60 trades
    arr = f.length >= 10 ? f : arr.slice(-60)
    return arr
  }, [all, range, pr, live, curve, pool, realPts])

  const buyers = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of all) m[t.trader.toLowerCase()] = (m[t.trader.toLowerCase()] ?? 0) + (t.side === 'buy' ? 1 : -1) * live.unit(curve, t.eth)
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 25)
  }, [all, live, curve])

  const rows = [...all].reverse().filter((t) => onlyBuys === 'all' || t.side === onlyBuys)
  const nameOf = useNames([...(l ? [l.creator] : []), ...rows.slice(page * per, page * per + per).map((t) => t.trader), ...buyers.map(([a]) => a)])
  useDexPaid(l ? [l.token] : [])
  if (!l) return <div className="empty">{live.launches.length ? tr('This token is not a pons v2 token.') : tr('Reading pons…')}</div>
  // a graduated curve is empty (its price reads 0): use the last trade instead, like the chart does
  const lastTrade = pool.length ? pool[pool.length - 1].p * (pr.usd ?? 1) : (() => { for (let i = all.length - 1; i >= 0; i--) { const x = all[i]; if (x.tokens > 0n) return (live.unit(curve, x.eth) / (Number(x.tokens) / 1e18)) * (pr.usd ?? 1) } return 0 })()
  // graduated: the pool's latest candle is the live price; otherwise the curve (or pons' pool price)
  const price = cv?.graduated && pool.length ? lastTrade : cv && live.pricePair(cv) > 0 ? live.pricePair(cv) * (pr.usd ?? 1) : lastTrade
  const first = pts[0]?.p, chg = first && price ? (price / first - 1) * 100 : 0
  const buys = all.filter((t) => t.side === 'buy').length, sells = all.length - buys
  const dayAgo = live.head.n - DAY
  const vol = all.reduce((s, t) => s + (t.block >= dayAgo ? live.unit(curve, t.eth) : 0), 0)
  const volAll = all.reduce((s, t) => s + live.unit(curve, t.eth), 0)
  // creator rewards on the curve: the tax field of every buy and sell (2 % on most tokens)
  const taxRaw = all.reduce((s, t) => s + (t.tax ?? 0n), 0n)
  const earned = live.unit(curve, taxRaw)
  const earnedText = fees ? (fees.usd !== null ? usd(fees.usd) : `${fees.quote.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${fees.symbol}`) : hist ? V(earned) : '…'
  const taxPct = volAll > 0 ? (earned / volAll) * 100 : 0
  const goal = cv ? live.goal(cv) : 0

  return (
    <div className="tok">
      <div className="fmain">
        <div className="fh">
          <button className="btn sm tk-back" onClick={back} aria-label={tr('Back to radar')}>← {tr('Back')}</button>
          <TokenImg src={m?.logo} seed={l.token} label={m?.symbol} className="r56" />
          <div style={{ minWidth: 0 }}>
            <h2>{m?.name || short(l.token)}{isOfficialToken(l.token) && <Verified size={20} coin />}</h2>
            <div className="mu" style={{ fontSize: 12 }}>${m?.symbol} · <span className="pairtag">{pr.symbol === 'ETH' && <EthLogo size={13} />}{pr.symbol}</span> · {ageMin((Number(live.head.n - l.block) * SECONDS_PER_BLOCK) / 60)} · {cv?.graduated ? <span className="tag sun"><GIcon name="graduated" size={12} />{tr('Graduated')}</span> : <span className="tag"><GIcon name="trades" size={12} />{tr('On curve')}</span>}<DexPaidTag token={l.token} link /></div>
          </div>
          <div className="tk-price"><div className="pxbig">{unit === 'mcap' ? (pr.usd !== null ? usd(price * 1e9) : usd(price * 1e9).slice(1) + ' ' + pr.symbol) : pr.usd !== null ? px(price) : px(price).slice(1) + ' ' + pr.symbol}</div><div className={'mono tk-chg ' + (chg >= 0 ? 'up' : 'dn')}>{pct(chg)} · {range} <span className="mu">· {unit === 'mcap' ? tr('Market cap') : tr('Price')}</span></div></div>
          <span style={{ flex: 1 }} />
          <button className={'btn' + (alerts.targets.some((x) => x.curve === curve) ? ' lit' : '')} onClick={() => setTargetOpen(true)} title={tr('Price alert')} aria-label={tr('Price alert')}><GIcon name="alerts" size={15} />{tr('Alert')}</button>
          <button className="btn" aria-pressed={following} onClick={toggleFollow}><span aria-hidden="true">{following ? '★' : '☆'}</span>{following ? tr('Following') : tr('Follow')}</button>
          <a className="btn pri" href={`https://www.ponsfamily.com/launchpad/${l.token}`} target="_blank" rel="noreferrer">{tr('Trade on pons')} ↗</a>
        </div>
        <OfficialNotice token={l.token} />

        <div className="tk-grid">
          <div className="tk-left">
        <div className="chartwrap">
          <div className="charttools">
            <div className="seg" role="group" aria-label={tr('Chart value')}><button aria-pressed={unit === 'mcap'} onClick={() => setUnit('mcap')}>{tr('Market cap')}</button><button aria-pressed={unit === 'price'} onClick={() => setUnit('price')}>{tr('Price')}</button></div><div className="seg" role="group" aria-label={tr('Chart type')}><button aria-pressed={type === 'line'} onClick={() => setType('line')}>{tr('Line')}</button><button aria-pressed={type === 'candles'} onClick={() => setType('candles')}>{tr('Candles')}</button></div>
            <span className="sp" />
            {hist === null ? <span className="mono fa">{tr('loading history…')}</span> : <><span className="tier dolphin"><GIcon name="dolphin" size={13} />$250+</span><span className="tier whale"><GIcon name="whale" size={13} />$1,000+</span></>}
            <div className="seg" role="group" aria-label={tr('Range')}>{(['15m', '1h', '24h'] as Range[]).map((r) => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>)}</div>
          </div>
          <Chart byTrades={type === 'candles' && !realPts} pts={unit === 'mcap' ? pts.map((q) => ({ ...q, p: q.p * 1e9 })) : pts} type={type} fmt={unit === 'mcap' ? (n) => (pr.usd !== null ? usd(n) : usd(n).slice(1) + ' ' + pr.symbol) : undefined} />
        </div>


        <section className="tpanel" aria-label={tr('Activity')}>
          <div className="ftabs" role="tablist">
            <button aria-pressed={tab === 'trades'} onClick={() => setTab('trades')}>Trades{hist ? ` · ${all.length.toLocaleString('en-US')}` : ''}</button>
            <button aria-pressed={tab === 'buyers'} onClick={() => setTab('buyers')}>{tr('Top traders')}</button>
            <button aria-pressed={tab === 'info'} onClick={() => setTab('info')}>{tr('About')}</button>
            <span className="sp" />
            {tab === 'trades' && <div className="seg" role="group" aria-label={tr('Filter')}>{(['all', 'buy', 'sell'] as const).map((k) => <button key={k} aria-pressed={onlyBuys === k} onClick={() => { setOnlyBuys(k); setPage(0) }}>{{ all: tr('All'), buy: tr('Buys'), sell: tr('Sells') }[k]}</button>)}</div>}
          </div>
          {tab === 'trades' && <div className="ttable">
            <div className="tt th"><span>{tr('Type')}</span><span>{tr('Account')}</span><span className="r">{pr.symbol}</span><span className="r">{m?.symbol || 'Tokens'}</span><span className="r">{tr('Price')}</span><span className="r">{tr('Age')}</span><span className="r">Tx</span></div>
            {rows.slice(page * per, page * per + per).map((t) => {
              const u = live.unit(curve, t.eth), usdv = live.toUsd(curve, t.eth), tok = Number(t.tokens) / 1e18, isDev = t.trader.toLowerCase() === l.creator.toLowerCase(), tier = t.side === 'buy' ? tierOf(usdv) : null
              return (
                <div key={t.id} className={'tt' + (live.fresh.has(t.id) ? ' n' : '')}>
                  <span className={'sidelbl ' + (t.side === 'buy' ? 'up' : 'dn')}>{tier ? <span className={'sideic ' + tier}><GIcon name={tier} size={16} /></span> : <span className={'sideic ' + t.side}>{t.side === 'buy' ? '↗' : '↘'}</span>}{t.side === 'buy' ? tr('Buy') : tr('Sell')}</span>
                  <a className="acct" href={`/portfolio/${t.trader.toLowerCase()}`}><Avatar address={t.trader} size={22} /><span className="nm">{nameOf(t.trader)}</span>{isDev && <span className="tag sun"><GIcon name="crown" size={11} />{tr('creator')}</span>}{tier && <span className={'tier ' + tier}>{tier === 'whale' ? tr('Whale') : tr('Dolphin')}</span>}</a>
                  <span className="r mono">{u < 0.001 ? '<0.001' : u.toLocaleString('en-US', { maximumFractionDigits: u < 1 ? 4 : 2 })}{usdv !== null && pr.symbol !== 'USDG' && <small className="fa"> {usd(usdv)}</small>}</span>
                  <span className="r mono">{tok >= 1e6 ? (tok / 1e6).toFixed(2) + 'M' : tok >= 1e3 ? (tok / 1e3).toFixed(1) + 'K' : tok.toFixed(0)}</span>
                  <span className="r mono">{tok > 0 ? (pr.usd !== null ? px((u / tok) * pr.usd) : px(u / tok).slice(1)) : '—'}</span>
                  <span className="r mono fa">{agoMs(live.blockTime(t.block))}</span>
                  <a className="r mono fa" href={`${EXPLORER}/tx/${t.tx}`} target="_blank" rel="noreferrer">{t.tx.slice(2, 8)}↗</a>
                </div>
              )
            })}
            {hist === null && <p className="empty">{tr('Reading every trade on this curve…')}</p>}
            {hist !== null && !rows.length && <p className="empty">{tr('No trades yet.')}</p>}
            {rows.length > 0 && <div className="pager">
              <span>{(page * per + 1).toLocaleString('en-US')}–{Math.min(rows.length, page * per + per).toLocaleString('en-US')} {tr('of')} {rows.length.toLocaleString('en-US')}</span>
              <span className="sp" />
              <label>{tr('Per page')} <select value={per} onChange={(e) => { setPer(+e.target.value); setPage(0) }}>{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
              <button className="btn sm" disabled={page === 0} onClick={() => setPage(0)} aria-label={tr('First page')}>«</button>
              <button className="btn sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹ {tr('Previous')}</button>
              <span className="mono">{page + 1} / {Math.max(1, Math.ceil(rows.length / per))}</span>
              <button className="btn sm" disabled={(page + 1) * per >= rows.length} onClick={() => setPage((p) => p + 1)}>{tr('Next')} ›</button>
            </div>}
          </div>}
          {tab === 'buyers' && <div className="ttable">
            <div className="tt th two"><span>#</span><span>{tr('Account')}</span><span className="r">{tr('Net (bought − sold)')}</span></div>
            {buyers.map(([a, v], k) => (
              <div key={a} className="tt two"><span className="mono fa">{k + 1}</span><a className="acct" href={`/portfolio/${a}`}><Avatar address={a} size={22} /><span className="nm">{nameOf(a)}</span>{a === l.creator.toLowerCase() && <span className="tag sun"><GIcon name="crown" size={11} />{tr('creator')}</span>}</a><b className={'mono r ' + (v >= 0 ? 'up' : 'dn')}>{v >= 0 ? '+' : '−'}{V(Math.abs(v))}</b></div>))}
            <p className="foot" style={{ padding: '10px 14px' }}>{tr('Since launch. Names are the pons ones: the profile if the wallet made one, otherwise the pseudonym pons gives every address.')}</p>
          </div>}
          {tab === 'info' && <div className="info">
            {m?.description ? <p className="desc">{m.description}</p> : <p className="mu">{tr('The creator added no description.')}</p>}
            {socials.length > 0 && <div className="links">{socials.map((s) => <a key={s} className="btn sm" href={s} target="_blank" rel="noreferrer">{/x\.com|twitter/.test(s) ? 'X' : /t\.me|telegram/.test(s) ? 'Telegram' : new URL(s).hostname.replace('www.', '')} ↗</a>)}</div>}
            <div className="mini">
              <div><span>{tr('Token')}</span><a className="mono" href={`${EXPLORER}/token/${l.token}`} target="_blank" rel="noreferrer">{short(l.token)}↗</a></div>
              <div><span>{tr('Curve')}</span><a className="mono" href={`${EXPLORER}/address/${l.curve}`} target="_blank" rel="noreferrer">{short(l.curve)}↗</a></div>
              <div><span>{tr('Launch')}</span><a className="mono" href={l.tx ? `${EXPLORER}/tx/${l.tx}` : `${EXPLORER}/token/${l.token}`} target="_blank" rel="noreferrer">{l.tx.slice(0, 10)}↗</a></div>
              <div><span>{tr('Creator tax')}</span><span className="mono">{hist && volAll > 0 ? taxPct.toFixed(1) + ' %' : '…'}</span></div>
            </div>
          </div>}
        </section>
          </div>
          <aside className="tk-rail">
          <section className="tk-card gradbar" aria-label={tr('Curve')}>
            {cv?.graduated ? <><span className="tag sun"><GIcon name="graduated" size={12} />{tr('Graduated')}</span><span className="mu" style={{ fontSize: 12 }}>{tr('Trades on a Uniswap v4 pool.')}</span></>
              : cv ? <><GIcon name="launch" size={18} /><span style={{ fontSize: 12, fontWeight: 600 }}>{tr('Curve')}</span><div className="bar"><i style={{ width: `${Math.max(1, progress(cv) * 100)}%` }} /></div><span className="mono">{(progress(cv) * 100).toFixed(1)}% · {live.raised(cv).toFixed(2)} / {goal.toFixed(2)} {pr.symbol}</span></> : <span className="mu">{tr('Reading curve…')}</span>}
            </section>
          <div className="st6">
            <div><span>{tr('Market cap')}</span><b>{pr.usd !== null ? usd(price * 1e9) : usd(price * 1e9).slice(1) + ' ' + pr.symbol}</b></div>
            <div><span>{tr('Volume')}</span><b>{hist ? V(volAll) : '…'}</b><small>{hist ? tr('{v} in 24h', { v: V(vol) }) : ''}</small></div>
            <div><span>{tr('Buys / sells')}</span><b>{hist ? <><span className="up">{buys}</span> / <span className="dn">{sells}</span></> : '…'}</b></div>
            <div><span>{tr('Wallets')}</span><b>{hist ? new Set(all.map((t) => t.trader.toLowerCase())).size : '…'}</b></div>
            <div><span>{tr('Curve')}</span><b>{cv ? (cv.graduated ? tr('Graduated') : (progress(cv) * 100).toFixed(1) + '%') : '…'}</b></div>
            <div className="earn"><span><GIcon name="rewards" size={13} />{fees?.community ? tr('Community earned') : tr('Creator earnings')}{fees?.claimed && <ClaimedBadge community={fees.community} />}</span><b>{earnedText}</b>{hist && earned > 0 && <small>{tr('{pct}% of every trade', { pct: taxPct.toFixed(1) })}</small>}</div>
          </div>
          <div className="creator">
            <Avatar address={l.creator} size={42} />
            <div className="n"><b>{tr('Created by')} <a href={`/creator/${l.creator.toLowerCase()}`}>{nameOf(l.creator)}</a>{hasProfile(l.creator) && <span className="tag blue" title={tr('Has a pons profile')}>{tr('profile')}</span>} · <a className="mono mu" href={`/creator/${l.creator.toLowerCase()}`}>{short(l.creator)}</a></b><div>{tr('Earned {v} from the creator tax on this token. Message them on Orbit Mail with PONS or ETH — refunded if no reply in 72h.', { v: earnedText })}</div></div>
            <button className="btn pri" onClick={() => writeCreator(l.creator, m?.symbol || '', curve)}>{tr('Message creator')}</button>
          </div>
          </aside>
        </div>
      </div>
      {targetOpen && <TargetDialog live={live} curve={curve} alerts={alerts} symbol={m?.symbol || ''} close={() => setTargetOpen(false)} />}
    </div>
  )
}

