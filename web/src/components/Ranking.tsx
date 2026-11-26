import { useEffect, useMemo, useState } from 'react'
import { ClaimedBadge } from './ClaimedBadge'
import type { Live } from '../lib/usePons'
import { BLOCKS_PER_MIN } from '../lib/usePons'
import { loadTrades, loadCurveTrades, areContracts, type Trade, type Launch } from '../lib/pons'
import { creatorRewards, type CreatorRow } from '../lib/ponsApi'
import { usd, short, agoMs } from '../lib/format'
import { useT } from '../lib/i18n'
import { TokenImg } from './TokenImg'
import { GIcon, Avatar } from './Icon'
import { useNames } from '../lib/names'

type Tab = 'rewards' | 'traders' | 'grads' | 'hunters'
const MEDAL = ['#FBBF24', '#D4D4D4', '#D08A52']

// cached for the session: 24 h of trades is ~25 RPC calls
let dayCache: { head: bigint; trades: Trade[] } | null = null
let hunterCache: { key: string; rows: { a: string; hits: string[] }[] } | null = null

export function Ranking({ live }: { live: Live }) {
  const { t } = useT()
  const [tab, setTab] = useState<Tab>('rewards')
  const [rewards, setRewards] = useState<{ rows: CreatorRow[]; coins: number } | null>(null)
  const [rwDone, setRwDone] = useState<[number, number]>([0, 0])
  const [day, setDay] = useState<Trade[] | null>(dayCache?.trades ?? null)
  const [hunters, setHunters] = useState<{ a: string; hits: string[] }[] | null>(hunterCache?.rows ?? null)
  const [hDone, setHDone] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [bots, setBots] = useState<Map<string, boolean>>(new Map())

  useEffect(() => {
    if (tab !== 'rewards' || rewards) return
    let dead = false
    setErr(null)
    creatorRewards((d, n) => !dead && setRwDone([d, n])).then((r) => !dead && setRewards(r)).catch(() => !dead && setErr(t('pons did not answer.')))
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, rewards, retry])

  const hasHead = live.head.n > 0n
  useEffect(() => {
    if (tab !== 'traders' || day || !hasHead) return
    if (dayCache) { setDay(dayCache.trades); return }
    let dead = false
    const h = live.head.n
    setErr(null)
    loadTrades(h - 24n * 60n * BLOCKS_PER_MIN, h).then((x) => { dayCache = { head: h, trades: x }; if (!dead) setDay(x) }).catch((e) => { console.error('[ranking]', e); if (!dead) setErr((e as { shortMessage?: string }).shortMessage ?? t('The network did not answer.')) })
    return () => { dead = true }
    // head moves every block; load once per visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, day, hasHead, retry])

  // last 40 graduations: who was among the first 10 buyers of each
  const recentGrads = useMemo(() => [...live.grads.entries()].sort((a, b) => Number(b[1] - a[1])).slice(0, 40).map(([x]) => live.byToken.get(x)).filter(Boolean) as Launch[], [live.grads, live.byToken])
  useEffect(() => {
    if (tab !== 'hunters' || !recentGrads.length) return
    const key = recentGrads.map((l) => l.curve).join()
    if (hunterCache?.key === key) { setHunters(hunterCache.rows); return }
    let dead = false
    setHunters(null); setHDone(0)
    live.ensureMeta(recentGrads.map((l) => l.token))
    ;(async () => {
      const hits = new Map<string, string[]>()
      for (let i = 0; i < recentGrads.length; i += 10) {
        const part = await Promise.all(recentGrads.slice(i, i + 10).map(async (l) => {
          const x = await loadCurveTrades(l.curve, l.block, l.block + 300_000n).catch(() => [] as Trade[])
          const first: string[] = []
          for (const y of x) { if (y.side !== 'buy') continue; const a = y.trader.toLowerCase(); if (a === l.creator.toLowerCase() || first.includes(a)) continue; first.push(a); if (first.length === 10) break }
          return { l, first }
        }))
        for (const { l, first } of part) for (const a of first) hits.set(a, [...(hits.get(a) ?? []), l.token.toLowerCase()])
        if (!dead) setHDone(Math.min(recentGrads.length, i + 10))
      }
      const rows = [...hits.entries()].map(([a, h]) => ({ a, hits: h })).sort((x, y) => y.hits.length - x.hits.length).slice(0, 50)
      hunterCache = { key, rows }
      if (!dead) setHunters(rows)
    })()
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, recentGrads])

  const traders = useMemo(() => {
    const m = new Map<string, { vol: number; bought: number; sold: number; n: number; curves: Set<string> }>()
    for (const x of day ?? []) {
      const a = x.trader.toLowerCase(), s = m.get(a) ?? { vol: 0, bought: 0, sold: 0, n: 0, curves: new Set() }
      if (!live.byCurve.has(x.curve)) continue
      const v = live.tradeUsd(x); if (v === null) continue
      s.vol += v; s.n++; s.curves.add(x.curve)
      if (x.side === 'buy') s.bought += v; else s.sold += v
      m.set(a, s)
    }
    return [...m.entries()].sort((a, b) => b[1].vol - a[1].vol).slice(0, 50)
  }, [day, live])

  const gradCreators = useMemo(() => {
    const m = new Map<string, { n: number; g: number }>()
    for (const l of live.launches) { const a = l.creator.toLowerCase(), s = m.get(a) ?? { n: 0, g: 0 }; s.n++; if (live.grads.has(l.token.toLowerCase())) s.g++; m.set(a, s) }
    return [...m.entries()].filter(([, s]) => s.g > 0).sort((a, b) => b[1].g - a[1].g || a[1].n - b[1].n).slice(0, 50)
  }, [live.launches, live.grads])

  const shown = tab === 'traders' ? traders.map(([a]) => a) : tab === 'hunters' ? (hunters ?? []).map((h) => h.a) : tab === 'grads' ? gradCreators.map(([a]) => a) : (rewards?.rows ?? []).slice(0, 40).map((r) => r.address)
  const shownKey = shown.join()
  useEffect(() => { if (tab !== 'rewards' && tab !== 'grads' && shown.length) areContracts(shown).then(setBots).catch(() => {}) }, [shownKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const nameOf = useNames(shown)
  const Who = ({ a, to }: { a: string; to: string }) => <a className="who" href={to}><Avatar address={a} size={26} /><span className="nm">{nameOf(a)}</span><span className="mono fa">{short(a)}</span>{bots.get(a) && <span className="tag" title={t('An address with code: a router or a bot, not a person')}><GIcon name="bot" size={12} />{t('contract')}</span>}</a>

  const sub = { rewards: t('Creators who earned the most from their coins on pons. Totals reported by ponsfamily.com.'), traders: t('Wallets with the most volume on pons curves in the last 24h.'), grads: t('Creators with the most graduated tokens, out of {n} launches.', { n: live.launches.length.toLocaleString('en-US') }), hunters: t('Who was among the first 10 buyers of the last 40 tokens that graduated.') }[tab]

  return (
    <div className="page">
      <div className="ph"><div className="ph-row">
        <div style={{ minWidth: 0 }}><h2>{t('Leaderboard')}</h2><p>{sub}</p></div>
        <div className="seg ph-act" role="group" aria-label={t('Leaderboard')}>
          {(['rewards', 'traders', 'grads', 'hunters'] as Tab[]).map((k) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{{ rewards: t('Creator rewards'), traders: t('Traders · 24h'), grads: t('Most graduations'), hunters: t('Early hunters') }[k]}</button>)}
        </div>
      </div></div>

      {err && <div className="perm"><span>{err}</span><button className="btn sm" onClick={() => { setErr(null); setDay(null); setRewards(null); setRetry((n) => n + 1) }}>{t('Retry')}</button></div>}

      {tab === 'rewards' && !err && (!rewards ? <div className="loadbar"><i style={{ width: `${(rwDone[0] / Math.max(1, rwDone[1])) * 100}%` }} /><span>{t('Reading creator earnings from pons…')} {rwDone[0]}/{rwDone[1] || '…'}</span></div> : <Rewards rows={rewards.rows} coins={rewards.coins} nameOf={nameOf} />)}

      {tab === 'traders' && !err && (!day ? <div className="loadbar"><i className="indet" /><span>{t('Reading every buy and sell of the last 24h…')}</span></div> : (
        <div className="tbl">
          <div className="tr th" style={{ gridTemplateColumns: TCOLS }}><span>#</span><span>{t('Wallet')}</span><span className="r">{t('Volume')}</span><span className="r">{t('Bought')}</span><span className="r">{t('Sold')}</span><span className="r">{t('Trades')}</span><span className="r">{t('Tokens')}</span></div>
          {traders.map(([a, s], i) => (
            <div key={a} className="tr" style={{ gridTemplateColumns: TCOLS }}>
              <span className="mono fa">{i < 3 ? <GIcon name="medal" size={20} color={MEDAL[i]} /> : i + 1}</span><Who a={a} to={`/portfolio/${a}`} />
              <span className="r mono">{usd(s.vol)}</span><span className="r mono up">{usd(s.bought)}</span><span className="r mono dn">{usd(s.sold)}</span>
              <span className="r mono">{s.n}</span><span className="r mono">{s.curves.size}</span>
            </div>))}
          <p className="foot">{t('{n} trades read. In USD: ETH pairs at the Coinbase price and USDG at $1. Stock-paired tokens (no reliable price) and DEX trading after graduation are not counted.', { n: day.length.toLocaleString('en-US') })}</p>
        </div>))}

      {tab === 'grads' && (
        <div className="tbl">
          <div className="tr th" style={{ gridTemplateColumns: CCOLS }}><span>#</span><span>{t('Creator')}</span><span className="r">{t('Graduated')}</span><span className="r">{t('Launched')}</span><span className="r">{t('Rate')}</span></div>
          {gradCreators.map(([a, s], i) => (
            <div key={a} className="tr" style={{ gridTemplateColumns: CCOLS }}>
              <span className="mono fa">{i < 3 ? <GIcon name="medal" size={20} color={MEDAL[i]} /> : i + 1}</span><Who a={a} to={`/creator/${a}`} />
              <span className="r mono"><GIcon name="graduated" size={14} /> {s.g}</span><span className="r mono">{s.n}</span><span className="r mono">{((s.g / s.n) * 100).toFixed(0)}%</span>
            </div>))}
        </div>)}

      {tab === 'hunters' && (!hunters ? <div className="loadbar"><i style={{ width: `${(hDone / Math.max(1, recentGrads.length)) * 100}%` }} /><span>{t('Reading the first buyers of {n} graduated tokens…', { n: recentGrads.length })} {hDone}/{recentGrads.length}</span></div> : (
        <div className="tbl">
          <div className="tr th" style={{ gridTemplateColumns: HCOLS }}><span>#</span><span>{t('Wallet')}</span><span className="r">{t('Hits')}</span><span>{t('Got in early on')}</span></div>
          {hunters.map((h, i) => (
            <div key={h.a} className="tr" style={{ gridTemplateColumns: HCOLS }}>
              <span className="mono fa">{i + 1}</span><Who a={h.a} to={`/portfolio/${h.a}`} />
              <span className="r mono">{h.hits.length}</span>
              <span className="logos">{h.hits.slice(0, 8).map((x) => { const l = live.byToken.get(x), m = live.meta[x]; return l ? <a key={x} href={`/token/${l.curve.toLowerCase()}`} title={m?.name}><TokenImg src={m?.logo} seed={x} label={m?.symbol} className="r22" /></a> : null })}</span>
            </div>))}
          <p className="foot">{t('Not counting each token’s creator. A wallet with many hits may be a fast-buy bot.')}</p>
        </div>))}
    </div>
  )
}

function Rewards({ rows, coins, nameOf }: { rows: CreatorRow[]; coins: number; nameOf: (a: string) => string }) {
  const { t } = useT()
  const total = rows.reduce((s, r) => s + r.usd, 0), max = rows[0]?.usd || 1
  const best = Math.max(0, ...rows.flatMap((r) => r.coins.map((c) => c.usd)))
  const coin = (c: CreatorRow['coins'][number]) => (
    <a className="coinchip" href={`https://ponsfamily.com/launchpad/${c.token.address}`} target="_blank" rel="noreferrer">
      <TokenImg src={c.token.artwork} seed={c.token.address} label={c.token.symbol} className="r30" />
      <span><b>{c.token.name}{c.claimed && <ClaimedBadge />}</b><small>${c.token.symbol} · {usd(c.token.marketCapUsd ?? 0)}</small></span>
    </a>
  )
  const pod = (r: CreatorRow, i: number) => (
    <div key={r.address} className={'pod' + (i === 0 ? ' first' : '')}>
      <span className="medal"><GIcon name="medal" size={28} color={MEDAL[i]} /></span>
      <a href={`/creator/${r.address}`}><Avatar address={r.address} size={i === 0 ? 76 : 60} /></a>
      <b className="pn">{nameOf(r.address)}</b><span className="mono mu" style={{ fontSize: 11.5 }}>{short(r.address)}</span>
      <div className="earned"><GIcon name="rewards" size={20} /><b className="mono">{usd(r.usd)}</b></div>
      <span className="mu" style={{ fontSize: 11.5 }}>{t('earned from creator fees')}</span>
      {coin(r.coins[0])}
      {r.coins.length > 1 && <span className="mu" style={{ fontSize: 11.5 }}>{t('+{n} more coins', { n: r.coins.length - 1 })}</span>}
    </div>
  )
  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="kpi kpi-ic"><GIcon name="rewards" size={34} /><div><span>{t('Paid to creators')}</span><b>{usd(total)}</b></div></div>
        <div className="kpi kpi-ic"><GIcon name="crown" size={34} /><div><span>{t('Creators earning')}</span><b>{rows.length}</b></div></div>
        <div className="kpi kpi-ic"><GIcon name="trophy" size={34} /><div><span>{t('Best single coin')}</span><b>{usd(best)}</b></div></div>
      </div>
      {rows.length >= 3 && <div className="podium">{[1, 0, 2].map((i) => pod(rows[i], i))}</div>}
      <div className="tbl">
        <div className="tr th" style={{ gridTemplateColumns: RCOLS }}><span>#</span><span>{t('Creator')}</span><span>{t('Main coin')}</span><span>{t('Earned')}</span><span className="r">{t('Market cap')}</span><span className="r">{t('Tax')}</span><span className="r">{t('Last payout')}</span></div>
        {rows.slice(3, 40).map((r, i) => { const c = r.coins[0]; return (
          <div key={r.address} className="tr" style={{ gridTemplateColumns: RCOLS }}>
            <span className="mono fa">{i + 4}</span>
            <a className="who" href={`/creator/${r.address}`}><Avatar address={r.address} size={26} /><span className="nm">{nameOf(r.address)}</span></a>
            <span className="tok-cell"><TokenImg src={c.token.artwork} seed={c.token.address} label={c.token.symbol} className="r28" /><span className="n"><b>{c.token.name}{c.claimed && <ClaimedBadge />}</b><small>${c.token.symbol}{r.coins.length > 1 ? ` · +${r.coins.length - 1}` : ''}</small></span></span>
            <span className="bar-cell"><span className="bar"><i style={{ width: `${Math.max(3, (r.usd / max) * 100)}%` }} /></span><b className="mono">{usd(r.usd)}</b></span>
            <span className="r mono">{usd(c.token.marketCapUsd ?? 0)}</span>
            <span className="r mono">{c.token.creatorTaxBps ? (c.token.creatorTaxBps / 100).toFixed(1) + '%' : '—'}</span>
            <span className="r mono fa">{c.lastAt ? agoMs(c.lastAt * 1000) : '—'}</span>
          </div>) })}
      </div>
      <p className="foot">{t('Top {n} pons coins by market cap. Earnings in USD at today’s price of each pair currency, as reported by ponsfamily.com.', { n: coins })}</p>
    </>
  )
}
const TCOLS = '40px minmax(0,1.4fr) 90px 90px 90px 70px 70px'
const CCOLS = '40px minmax(0,1.4fr) 100px 100px 80px'
const HCOLS = '40px minmax(0,1.2fr) 80px minmax(0,1.6fr)'
const RCOLS = '40px minmax(170px,1.2fr) minmax(170px,1.2fr) minmax(170px,1fr) 100px 70px 90px'
