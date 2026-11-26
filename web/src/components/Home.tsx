import { useEffect, useMemo, useRef, useState } from 'react'
import { Verified } from './Verified'
import { isOfficialToken } from '../lib/official'
import type { Hex } from 'viem'
import type { Live } from '../lib/usePons'
import { BLOCKS_PER_MIN } from '../lib/usePons'
import { progress, type Launch } from '../lib/pons'
import { topLaunches, type ApiLaunch } from '../lib/ponsApi'
import { usd, pct, ageMin, agoMs, short } from '../lib/format'
import { useT } from '../lib/i18n'
import { useNames } from '../lib/names'
import { TokenImg } from './TokenImg'
import { GIcon, Avatar } from './Icon'
import { EthLogo } from './EthLogo'
import '../radar.css'

export type HomeStyle = 'classic' | 'cards'
type Props = { live: Live; style?: HomeStyle; query: string; follows: Set<string>; openToken: (curve: string) => void }
type Filter = 'all' | 'curve' | 'grad' | 'new'

/** Big-buy tiers: dolphin from $250, whale from $1,000. */
export const DOLPHIN_USD = 250
export const WHALE_USD = 1000
export const tierOf = (u: number | null | undefined) => (u == null ? null : u >= WHALE_USD ? 'whale' : u >= DOLPHIN_USD ? 'dolphin' : null)

/** % change over the loaded window, from first to last trade price. */
export function changeOf(live: Live, curve: string) {
  const s = live.stats[curve]
  if (!s?.first || !s.last || !s.first.tokens || !s.last.tokens) return 0
  const p0 = Number(s.first.eth) / Number(s.first.tokens), p1 = Number(s.last.eth) / Number(s.last.tokens)
  return p0 > 0 ? (p1 / p0 - 1) * 100 : 0
}

// the ranked list from pons changes slowly: once per visit is enough
let bigCache: ApiLaunch[] | null = null

/** Tiny price line from the trades loaded for one curve. */
function Spark({ vals }: { vals: number[] }) {
  const w = 96, h = 30
  if (vals.length < 2) return <svg className="rd-spark" width={w} height={h} />
  const lo = Math.min(...vals), hi = Math.max(...vals), up = vals[vals.length - 1] >= vals[0], c = up ? '#34D399' : '#F87171'
  const p = vals.map((v, i) => [(i / (vals.length - 1)) * (w - 4) + 2, h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6)])
  const d = p.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ')
  return (
    <svg className="rd-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${d} L${w - 2} ${h} L2 ${h}Z`} fill={up ? 'rgba(52,211,153,.12)' : 'rgba(248,113,113,.12)'} />
      <path d={d} fill="none" stroke={c} strokeWidth="1.6" />
      <circle cx={p[p.length - 1][0]} cy={p[p.length - 1][1]} r="2.3" fill={c} />
    </svg>
  )
}

/** Radar: title and filters, new and trending chips, biggest tokens, live curves and the buy feeds. */
export function Home({ live, query, openToken }: Props) {
  const { t } = useT()
  const [filt, setFilt] = useState<Filter>('all')
  const [big, setBig] = useState<ApiLaunch[] | null>(bigCache)
  const storyRef = useRef<HTMLDivElement>(null)
  const dragged = useRef(false)
  // stories: drag with the mouse, or use the wheel, to move sideways
  const dragScroll = useMemo(() => {
    let x0 = 0, s0 = 0, down = false
    return {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => { if (e.pointerType !== 'mouse') return; down = true; dragged.current = false; x0 = e.clientX; s0 = e.currentTarget.scrollLeft },
      onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => { if (!down) return; const dx = e.clientX - x0; if (Math.abs(dx) > 5) dragged.current = true; e.currentTarget.scrollLeft = s0 - dx },
      onPointerUp: () => { down = false; setTimeout(() => { dragged.current = false }, 0) },
      onPointerLeave: () => { down = false },
      onWheel: (e: React.WheelEvent<HTMLDivElement>) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY },
    }
  }, [])
  const { launches, meta, curves, stats, head, byCurve, grads, fresh } = live
  const mins = (b: bigint) => (Number(head.n - b) * 0.118) / 60
  const name = (l?: Launch) => (l ? meta[l.token.toLowerCase()] : undefined)
  const sym = (l?: Launch) => name(l)?.symbol || (l ? short(l.token) : '')

  useEffect(() => { if (!bigCache) topLaunches(1).then((x) => { bigCache = x; setBig(x) }).catch(() => setBig([])) }, [])

  // KPIs
  const day3 = head.n - 3n * 24n * 60n * BLOCKS_PER_MIN
  const launches3d = useMemo(() => launches.filter((l) => l.block >= day3).length, [launches, day3])
  const grads3d = useMemo(() => [...grads.values()].filter((b) => b >= day3).length, [grads, day3])
  // the header counts this hour; the panel keeps the last 24 hours (saved on this device)
  const bigBuys = useMemo(() => live.feed.filter((f): f is Extract<typeof f, { kind: 'whale' }> => f.kind === 'whale'), [live.feed])
  const whales = bigBuys.filter((f) => f.usd >= WHALE_USD).length
  const bigDay = useMemo(() => live.bigBuys.filter((f) => byCurve.has(f.curve)), [live.bigBuys, byCurve])

  // live curves table
  const sparks = useMemo(() => {
    const m: Record<string, number[]> = {}
    for (let i = live.trades.length - 1; i >= 0; i--) { const x = live.trades[i]; if (!x.tokens) continue; (m[x.curve] ??= []).push(Number(x.eth) / Number(x.tokens)) }
    return m
  }, [live.trades])
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    // every token that fits, not only the ones already read: the visible page loads its curve and name below
    let list = launches.filter((l) => {
      const c = l.curve.toLowerCase(), cv = curves[c], grad = !!cv?.graduated || grads.has(l.token.toLowerCase())
      if (q) { const m = meta[l.token.toLowerCase()]; if (!(l.token.toLowerCase().includes(q) || m?.name.toLowerCase().includes(q) || m?.symbol.toLowerCase().includes(q))) return false }
      if (filt === 'curve') return !!cv && !grad && !!stats[c]
      if (filt === 'grad') return grad
      if (filt === 'new') return true
      return !!stats[c]
    })
    const vol = (l: Launch) => stats[l.curve.toLowerCase()]?.vol ?? 0
    if (filt === 'grad') list = list.sort((a, b) => vol(b) - vol(a) || Number((grads.get(b.token.toLowerCase()) ?? 0n) - (grads.get(a.token.toLowerCase()) ?? 0n)))
    else if (filt !== 'new') list = list.sort((a, b) => vol(b) - vol(a))
    // the official coin is pinned first (when it fits the filter, or on All / New)
    const nx = launches.find((x) => isOfficialToken(x.token))
    if (nx && !q && (filt === 'all' || filt === 'new' || list.includes(nx))) list = [nx, ...list.filter((x) => x !== nx)]
    return list
  }, [launches, curves, stats, meta, query, filt, grads])
  const PER = 16
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [filt, query])
  const pages = Math.max(1, Math.ceil(rows.length / PER))
  const pageRows = rows.slice(Math.min(page, pages - 1) * PER, Math.min(page, pages - 1) * PER + PER)
  const pageKey = pageRows.map((l) => l.curve).join()
  useEffect(() => {
    const missing = pageRows.filter((l) => !curves[l.curve.toLowerCase()]).map((l) => l.curve)
    if (missing.length) live.refreshCurves(missing)
    live.ensureMeta(pageRows.map((l) => l.token))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey])

  // right rail
  const buys = useMemo(() => live.trades.filter((x) => x.side === 'buy' && byCurve.has(x.curve)).slice(0, 12), [live.trades, byCurve])
  const nameOf = useNames([...buys.map((x) => x.trader), ...bigDay.slice(0, 10).map((f) => f.trader)])

  // stories: the 5 newest launches, then the most traded
  const stories = useMemo(() => {
    const top = launches.filter((l) => stats[l.curve.toLowerCase()]).sort((a, b) => stats[b.curve.toLowerCase()].vol - stats[a.curve.toLowerCase()].vol)
    const list = [...launches.slice(0, 5), ...top.filter((x) => !launches.slice(0, 5).includes(x)).slice(0, 13)]
    // the official coin always leads
    const nx = launches.find((x) => isOfficialToken(x.token))
    return nx ? [nx, ...list.filter((x) => x !== nx)] : list
  }, [launches, stats])

  const bigShown = (big ?? []).filter((b) => filt !== 'curve' || b.stage !== 'graduated').filter((b) => filt !== 'grad' || b.stage === 'graduated').sort((a, b) => (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0)).slice(0, 8)
  const pairIc = (s: string) => (s === 'ETH' || s === 'WETH' ? <EthLogo size={14} /> : null)
  const COLS = 'minmax(0,1.6fr) 150px 90px 80px 100px 72px 100px'

  return (
    <div className="page rd">
      <div className="rd-head">
        <div><h1>{t('The live radar for pons')}</h1>
          <p className="rd-facts">
            <span><GIcon name="trades" size={15} /><b className="mono">{live.trades.length ? live.trades.length.toLocaleString('en-US') : '…'}</b> {t('trades in the last hour')}</span>
            <span><GIcon name="launch" size={15} /><b className="mono">{launches.length ? launches3d.toLocaleString('en-US') : '…'}</b> {t('launches in 3 days')}</span>
            <span><GIcon name="graduated" size={15} /><b className="mono">{launches.length ? grads3d : '…'}</b> {t('graduated in 3 days')}</span>
            <span><GIcon name="whale" size={16} /><b className="mono">{bigBuys.length}</b> {t('big buys this hour')}{bigBuys.length > 0 && <em className="mono"> ({whales} 🐋 · {bigBuys.length - whales} 🐬)</em>}</span>
          </p>
        </div>
        <div className="seg rd-seg" role="group" aria-label={t('Filter')}>
          {([['all', 'All'], ['curve', 'On curve'], ['grad', 'Graduated'], ['new', 'New']] as const).map(([k, l]) => <button key={k} aria-pressed={filt === k} onClick={() => setFilt(k)}>{t(l)}</button>)}
        </div>
      </div>

      <div className="rd-stories-wrap">
        <button className="rd-arrow left" aria-label={t('Scroll left')} onClick={() => storyRef.current?.scrollBy({ left: -360, behavior: 'smooth' })}>‹</button>
        <div className="rd-stories" ref={storyRef} aria-label={t('New and trending')} {...dragScroll}>
          {stories.map((l, k) => {
            const c = l.curve.toLowerCase(), ch = changeOf(live, c)
            return (
              <button key={l.token} className="rd-story" onClick={(e) => { if (dragged.current) { e.preventDefault(); return } openToken(c) }} title={name(l)?.name} draggable={false}>
                <span className={'ring ' + (k < 5 ? 'new' : ch >= 0 ? 'up' : 'dn')}><TokenImg src={name(l)?.logo} seed={l.token} label={name(l)?.symbol} className="fill" /></span>
                {k < 5 && <em>{t('NEW')}</em>}
                <b>{sym(l)}{isOfficialToken(l.token) && <Verified size={12} coin />}</b>
                <small className={'mono ' + (ch >= 0 ? 'up' : 'dn')}>{stats[c] ? pct(ch) : ageMin(mins(l.block))}</small>
              </button>
            )
          })}
        </div>
        <button className="rd-arrow right" aria-label={t('Scroll right')} onClick={() => storyRef.current?.scrollBy({ left: 360, behavior: 'smooth' })}>›</button>
      </div>

      <div className="rd-grid">
        <div className="rd-main">
          {(filt === 'all' || filt === 'grad') && (
            <section className="rd-card">
              <div className="rd-sec"><GIcon name="crown" size={24} /><h3>{t('Biggest on pons')}</h3><span className="sp" /><span className="mu rd-src">ponsfamily.com</span></div>
              <div className="rd-big">
                {!big && <div className="empty">{t('Reading pons…')}</div>}
                {bigShown.map((b, i) => (
                  <a key={b.address} className="rd-bigc" href={`https://ponsfamily.com/launchpad/${b.address}`} target="_blank" rel="noreferrer">
                    <div className="rd-tok"><span className="rd-rank mono">{i + 1}</span><TokenImg src={b.artwork} seed={b.address} label={b.symbol} className="r42" /><div className="n"><b>{isOfficialToken(b.address) && <Verified coin pre />}{b.name}</b><small>${b.symbol}</small></div><span className="sp" />{b.stage === 'graduated' && <span title={t('Graduated')}><GIcon name="graduated" size={20} /></span>}</div>
                    <div className="mc mono">{usd(b.marketCapUsd ?? 0)}</div>
                    <div className="meta"><span>{t('Volume')} {usd(b.volumeUsd ?? 0)}</span><span className="pair">{pairIc(b.quote.symbol)}{b.quote.symbol}</span></div>
                  </a>
                ))}
              </div>
            </section>
          )}

          <section className="rd-card">
            <div className="rd-sec"><GIcon name="hot" size={24} /><h3>{t('Live curves')}</h3><span className="mu rd-src">{filt === 'new' ? t('Newest launches') : t('Most traded in the last hour')}</span></div>
            <div className="rd-tbl">
              <div className="rd-tr th" style={{ gridTemplateColumns: COLS }}><span>{t('Token')}</span><span>{t('Curve')}</span><span className="r">{t('Market cap')}</span><span className="r">{t('Vol 1h')}</span><span className="r">{t('Buys / Sells')}</span><span className="r">{t('Change')}</span><span className="r">{t('Trend')}</span></div>
              {!rows.length && <div className="empty">{launches.length ? t('Nothing here with this filter yet.') : t('Reading pons on Robinhood Chain…')}</div>}
              {pageRows.map((l) => {
                const c = l.curve.toLowerCase(), cv = curves[c], m = name(l), s = stats[c], ch = changeOf(live, c), pr = live.pairOf(c), p = cv ? progress(cv) : 0, isGrad = !!cv?.graduated || grads.has(l.token.toLowerCase())
                return (
                  <button key={l.token} className={'rd-tr' + (fresh.has(c) ? ' flash' : '')} style={{ gridTemplateColumns: COLS }} onClick={() => openToken(c)}>
                    <div className="rd-tok"><TokenImg src={m?.logo} seed={l.token} label={m?.symbol} className="r36" /><div className="n"><b>{isOfficialToken(l.token) && <Verified coin pre />}{m?.name || short(l.token)}</b><small>${m?.symbol} · {ageMin(mins(l.block))} · <span className="pair">{pairIc(pr.symbol)}{pr.symbol}</span></small></div></div>
                    {isGrad ? <span className="tag sun"><GIcon name="graduated" size={12} />{t('Graduated')}</span>
                      : !cv ? <span className="mu mono">…</span> : <div className="rd-prog"><span className="trk"><i style={{ width: `${Math.max(2, p * 100)}%` }} /></span><em>{(p * 100).toFixed(0)}%</em></div>}
                    <span className="r mono">{live.fmtMcap(cv)}</span>
                    <span className="r mono">{s ? usd(s.vol) : '—'}</span>
                    <span className="r mono rd-bs"><span className="up">↗{s?.buys ?? 0}</span><span className="dn">↘{s?.sells ?? 0}</span></span>
                    <span className={'r mono ' + (ch >= 0 ? 'up' : 'dn')}>{s ? pct(ch) : '—'}</span>
                    <span className="rd-sparkcell"><Spark vals={sparks[c] ?? []} /></span>
                  </button>
                )
              })}
            </div>
            {pages > 1 && <Pager page={Math.min(page, pages - 1)} pages={pages} total={rows.length} go={setPage} />}
          </section>
        </div>

        <aside className="rd-rail">
          <section className="rd-card rd-feed">
            <div className="rd-sec"><GIcon name="trades" size={24} /><h3>{t('Latest buys')}</h3></div>
            {!buys.length && <div className="empty">{t('Reading pons on Robinhood Chain…')}</div>}
            {buys.map((x) => { const l = byCurve.get(x.curve)!, m = name(l), u = live.tradeUsd(x), tier = tierOf(u); return (
              <button key={x.id} className={'rd-it' + (fresh.has(x.id) ? ' flash' : '')} onClick={() => openToken(x.curve)}>
                <TokenImg src={m?.logo} seed={l.token} label={m?.symbol} className="r36" />
                <p><b className="coinname">${sym(l)}</b><b className={'mono rd-amt ' + (tier ? 'gold' : '')}>+{u !== null ? usd(u) : `${live.unit(x.curve, x.eth).toFixed(2)} ${live.pairOf(x.curve).symbol}`}</b>{tier && <GIcon name={tier} size={15} />}<span className="rd-by">{t('by')} {nameOf(x.trader)}</span></p>
                <time>{agoMs(live.blockTime(x.block))}</time>
              </button>) })}
          </section>
          <section className="rd-card rd-feed">
            <div className="rd-sec"><GIcon name="whale" size={26} /><h3>{t('Big buys · 24h')}</h3><span className="sp" /><span className="mu rd-src">{t('Whale $1,000+ · Dolphin $250+')}</span></div>
            {!bigDay.length && <div className="empty">{t('No big buys in the last 24 hours.')}</div>}
            {bigDay.slice(0, 9).map((f) => { const l = byCurve.get(f.curve)!, m = name(l), tier = tierOf(f.usd)!; return (
              <button key={f.id} className={'rd-it ' + tier} onClick={() => openToken(f.curve)}>
                <span className="rd-badge"><TokenImg src={m?.logo} seed={l.token} label={m?.symbol} className="r36" /><GIcon name={tier} size={20} /></span>
                <p><span className="who"><Avatar address={f.trader} size={18} /><b>{nameOf(f.trader)}</b></span> {t('bought')} <b className="mono gold">{usd(f.usd)}</b> {t('of')} <b>${sym(l)}</b></p>
                <time>{agoMs(f.at)}</time>
              </button>) })}
          </section>
        </aside>
      </div>
    </div>
  )
}
export type { Hex }

/** "‹ 1 2 3 … 14 ›" under the Live curves table */
function Pager({ page, pages, total, go }: { page: number; pages: number; total: number; go: (p: number) => void }) {
  const { t } = useT()
  const nums: (number | '…')[] = []
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 1) nums.push(i)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  const to = (p: number) => { go(p); document.querySelector('.rd-tbl')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  return (
    <nav className="rd-pager" aria-label={t('Pages')}>
      <span className="mu">{t('{n} tokens', { n: total.toLocaleString('en-US') })}</span>
      <span className="sp" />
      <button disabled={page === 0} onClick={() => to(page - 1)} aria-label={t('Previous page')}>‹</button>
      {nums.map((n, i) => n === '…' ? <span key={'e' + i} className="mu">…</span> : <button key={n} aria-current={n === page ? 'page' : undefined} onClick={() => to(n)}>{n + 1}</button>)}
      <button disabled={page >= pages - 1} onClick={() => to(page + 1)} aria-label={t('Next page')}>›</button>
    </nav>
  )
}
