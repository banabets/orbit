import { useEffect, useMemo, useState } from 'react'
import { getAddress, type Hex } from 'viem'
import type { Live } from '../lib/usePons'
import { loadBalances, loadWalletTrades, progress, SUPPLY, SECONDS_PER_BLOCK, type Trade } from '../lib/pons'
import { usd, short, ageMin } from '../lib/format'
import { TokenImg } from './TokenImg'
import { useT } from '../lib/i18n'
import { GIcon, Avatar } from './Icon'
import { useNames, hasProfile } from '../lib/names'

const EXPLORER = 'https://robin.etherscan.io'
const fmtN = (n: number, sym: string) => (n === 0 ? '0' : Math.abs(n) < 0.001 ? n.toExponential(1) : n.toLocaleString('en-US', { maximumFractionDigits: 3 })) + ' ' + sym

/** Everything one wallet has launched on pons, and what it did with its own tokens. All from chain data. */
export function CreatorPage({ live, addr, openToken, write, following, toggleFollow }: {
  live: Live; addr: string; openToken: (c: string) => void; write: (creator: Hex) => void; following: boolean; toggleFollow: () => void
}) {
  const { t: tr } = useT()
  const mine = useMemo(() => live.launches.filter((l) => l.creator.toLowerCase() === addr), [live.launches, addr])
  const [bal, setBal] = useState<Map<string, bigint> | null>(null)
  const [trades, setTrades] = useState<Trade[] | null>(null)
  const [done, setDone] = useState(0)
  const key = mine.map((l) => l.curve).join()
  const nameOf = useNames([addr])

  useEffect(() => {
    if (!mine.length || !live.head.n) return
    let dead = false
    setBal(null); setTrades(null); setDone(0)
    live.ensureMeta(mine.map((l) => l.token))
    live.refreshCurves(mine.map((l) => l.curve))
    const who = getAddress(addr)
    loadBalances(who, mine.map((l) => l.token)).then((b) => !dead && setBal(b)).catch(() => !dead && setBal(new Map()))
    loadWalletTrades(who, mine, live.head.n, (n) => !dead && setDone(n)).then((t) => !dead && setTrades(t)).catch(() => !dead && setTrades([]))
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, addr, !!live.head.n])

  const per = useMemo(() => {
    const m = new Map<string, { bought: number; sold: number; boughtUsd: number; soldUsd: number; boughtTok: bigint; soldTok: bigint; firstSell?: bigint }>()
    for (const t of trades ?? []) {
      const s = m.get(t.curve) ?? { bought: 0, sold: 0, boughtUsd: 0, soldUsd: 0, boughtTok: 0n, soldTok: 0n }
      const v = live.unit(t.curve, t.eth), u = live.toUsd(t.curve, t.eth) ?? 0
      if (t.side === 'buy') { s.bought += v; s.boughtUsd += u; s.boughtTok += t.tokens } else { s.sold += v; s.soldUsd += u; s.soldTok += t.tokens; s.firstSell ??= t.block }
      m.set(t.curve, s)
    }
    return m
  }, [trades, live])

  if (!live.launches.length) return <div className="empty center">{tr('Reading pons…')}</div>
  if (!mine.length) return (
    <div className="page"><div className="ph"><a className="lnk" href="/">← Radar</a><h2 className="mono">{short(addr)}</h2><p>{tr('This wallet has not launched tokens on pons.')} <a href={`/portfolio/${addr}`}>{tr('See its portfolio')}</a></p></div></div>
  )

  const graduated = mine.filter((l) => live.grads.has(l.token.toLowerCase())).length
  const raised = mine.reduce((a, l) => { const c = live.curves[l.curve.toLowerCase()]; if (!c) return a
    // a graduated curve hands its reserves to the pool, so count the threshold it reached
    const raw = live.grads.has(l.token.toLowerCase()) || c.graduated ? c.threshold : c.quote > c.phantom ? c.quote - c.phantom : 0n
    return a + (live.toUsd(l.curve, raw) ?? 0) }, 0)
  const totSold = [...per.values()].reduce((a, s) => a + s.soldUsd, 0), totBought = [...per.values()].reduce((a, s) => a + s.boughtUsd, 0)
  const soldAny = [...per.values()].filter((s) => s.sold > 0).length
  const first = mine[mine.length - 1]
  const blkAgoMin = (b: bigint) => (Number(live.head.n - b) * SECONDS_PER_BLOCK) / 60

  return (
    <div className="page">
      <div className="ph">
        <a className="lnk" href="/">← Radar</a>
        <div className="ph-row">
          <Avatar address={addr} size={56} />
          <div style={{ minWidth: 0 }}>
            <h2>{nameOf(addr)} <span className="mono fa" style={{ fontSize: 14, fontWeight: 500 }}>{short(addr)}</span></h2>
            <p>{hasProfile(addr) ? <a href={`https://ponsfamily.com/profile/${addr}`} target="_blank" rel="noreferrer">{tr('pons profile')} ↗</a> : tr('no pons profile')} · {tr('First launch {t} ago', { t: ageMin(blkAgoMin(first.block)) })} · <a href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer">{tr('explorer')} ↗</a> · <a href={`/portfolio/${addr}`}>{tr('portfolio')}</a></p>
          </div>
          <div className="ph-act">
            <button className="btn" aria-pressed={following} onClick={toggleFollow}>{following ? tr('Following') : tr('Follow creator')}</button>
            <button className="btn pri" onClick={() => write(getAddress(addr))}>{tr('Message')}</button>
          </div>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><span><GIcon name="launch" size={13} /> {tr('Launches')}</span><b>{mine.length}</b></div>
        <div className="kpi"><span><GIcon name="graduated" size={13} /> {tr('Graduated')}</span><b>{graduated}<small> · {((graduated / mine.length) * 100).toFixed(0)}%</small></b></div>
        <div className="kpi"><span><GIcon name="coins" size={13} /> {tr('Raised on their curves')}</span><b>{usd(raised)}</b></div>
        <div className="kpi"><span>{tr('Sold of their own tokens')}</span><b className={totSold > 0 ? 'dn' : ''}>{trades ? usd(totSold) : '…'}</b>{trades && <small>{tr('{a} of {b} tokens · bought {v}', { a: soldAny, b: mine.length, v: usd(totBought) })}</small>}</div>
      </div>

      {!trades && <div className="loadbar"><i style={{ width: `${(done / mine.length) * 100}%` }} /><span>{tr('Reading their buys and sells on {n} curves…', { n: mine.length })} {done}/{mine.length}</span></div>}

      <div className="tbl">
        <div className="tr th" style={{ gridTemplateColumns: COLS }}><span /><span>{tr('Token')}</span><span>{tr('Status')}</span><span className="r">{tr('Market cap')}</span><span className="r">{tr('Still holds')}</span><span className="r">{tr('Bought')}</span><span className="r">{tr('Sold')}</span><span className="r">{tr('First sell')}</span></div>
        {mine.map((l) => {
          const c = live.curves[l.curve.toLowerCase()], m = live.meta[l.token.toLowerCase()], s = per.get(l.curve.toLowerCase()), sym = live.pairOf(l.curve).symbol
          const g = live.grads.has(l.token.toLowerCase())
          const held = bal?.get(l.token.toLowerCase())
          const heldPct = held !== undefined ? (Number((held * 10000n) / SUPPLY) / 100) : bal ? 0 : null
          const sellAfter = s?.firstSell !== undefined ? (Number(s.firstSell - l.block) * SECONDS_PER_BLOCK) / 60 : null
          return (
            <button key={l.curve} className="tr" style={{ gridTemplateColumns: COLS }} onClick={() => openToken(l.curve.toLowerCase())}>
              <TokenImg src={m?.logo} seed={l.token} label={m?.symbol} className="r30" />
              <span className="n"><b>{m?.name || '…'}</b><small className="mono">${m?.symbol || ''} · {ageMin(blkAgoMin(l.block))}</small></span>
              <span>{g ? <span className="tag sun"><GIcon name="graduated" size={11} />{tr('graduated')}</span> : c ? <span className="prog"><span className="trk"><i style={{ width: `${progress(c) * 100}%` }} /></span><em className="mono">{(progress(c) * 100).toFixed(0)}%</em></span> : '…'}</span>
              <span className="r mono">{live.fmtMcap(c)}</span>
              <span className="r mono">{heldPct === null ? '…' : heldPct === 0 ? <span className="fa">0%</span> : heldPct.toFixed(2) + '%'}</span>
              <span className="r mono">{s ? fmtN(s.bought, sym) : trades ? <span className="fa">—</span> : '…'}</span>
              <span className={'r mono' + (s?.sold ? ' dn' : '')}>{s?.sold ? fmtN(s.sold, sym) : trades ? <span className="fa">—</span> : '…'}</span>
              <span className="r mono">{sellAfter === null ? (trades ? <span className="fa">{tr('never')}</span> : '…') : ageMin(sellAfter)}</span>
            </button>
          )
        })}
      </div>
      <p className="foot">{tr('“Still holds” is this wallet’s current balance out of the 1,000M supply. “Bought” and “Sold” are its trades on each token’s pons curve, in that token’s pair currency (ETH, USDG or a stock token). Totals above are in USD and skip stock pairs. Transfers to other wallets and selling after graduation are not included.')}</p>
    </div>
  )
}
const COLS = '30px minmax(0,1.6fr) 110px 90px 80px 90px 90px 80px'
