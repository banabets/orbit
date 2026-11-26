import { navigate } from '../lib/nav'
import { useEffect, useMemo, useState } from 'react'
import { getAddress, isAddress, type Hex } from 'viem'
import type { Live } from '../lib/usePons'
import { rh, loadBalances, tokenBalance, loadWalletTrades, areContracts, progress, REAL_PONS, type Trade } from '../lib/pons'
import { usd, short, pct } from '../lib/format'
import { TokenImg } from './TokenImg'
import { useT } from '../lib/i18n'
import { Avatar, GIcon } from './Icon'
import { EthLogo } from './EthLogo'
import { useNames } from '../lib/names'

const EXPLORER = 'https://robin.etherscan.io'
const e18 = (w: bigint) => Number(w) / 1e18
const fmtE = (n: number) => (Math.abs(n) < 0.0001 && n !== 0 ? n.toExponential(1) : n.toLocaleString('en-US', { maximumFractionDigits: 4 })) + ' ETH'
const tok = (w: bigint) => { const n = e18(w); return n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(1) + ' K' : n.toFixed(0) }

/** Holdings of any wallet across every pons token, with cost from its own curve trades. */
export function WalletPage({ live, addr, me, connect }: { live: Live; addr: string | null; me: Hex | null; connect: () => void }) {
  const { t: tr } = useT()
  const who = addr ?? me?.toLowerCase() ?? null
  const [input, setInput] = useState('')
  const [bal, setBal] = useState<Map<string, bigint> | null>(null)
  const [base, setBase] = useState<{ eth: bigint; pons: bigint } | null>(null)
  const [trades, setTrades] = useState<Trade[] | null>(null)
  const [step, setStep] = useState('')
  const [done, setDone] = useState(0)
  const [isContract, setIsContract] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [again, setAgain] = useState(0)
  const [histFor, setHistFor] = useState<Set<string>>(new Set())
  const total = live.launches.length
  const nameOf = useNames(who ? [who] : [])

  useEffect(() => {
    if (!who || !total || !live.head.n) return
    let dead = false
    setBal(null); setTrades(null); setBase(null); setDone(0); setIsContract(false); setErr(null)
    areContracts([who]).then((m) => !dead && setIsContract(!!m.get(who))).catch(() => {})
    const a = getAddress(who)
    ;(async () => {
      try {
        Promise.all([rh.getBalance({ address: a }), tokenBalance(REAL_PONS, a)]).then(([e, p]) => !dead && setBase({ eth: e, pons: p })).catch(() => {})
        setStep('scan')
        const b = await loadBalances(a, live.launches.map((l) => l.token), (n) => !dead && setDone(n))
        if (dead) return
        // ignore dust: bots leave fractions of a token behind in hundreds of curves
        for (const [k, v] of b) if (v < 10n ** 18n) b.delete(k)
        setBal(b)
        const all = live.launches.filter((l) => b.has(l.token.toLowerCase()))
        live.ensureMeta(all.map((l) => l.token)); await live.refreshCurves(all.map((l) => l.curve))
        // history only for the biggest positions, to keep the RPC load reasonable
        const held = [...all].sort((x, y) => Number((b.get(y.token.toLowerCase())! - b.get(x.token.toLowerCase())!) / 10n ** 15n)).slice(0, MAX_HIST)
        if (dead) return
        setHistFor(new Set(held.map((l) => l.curve.toLowerCase())))
        setStep('hist'); setDone(0)
        const t = await loadWalletTrades(a, held, live.head.n, (n) => !dead && setDone(n))
        if (!dead) { setTrades(t); setStep('') }
      } catch (e) { console.error('[cartera]', e); if (!dead) { setErr('timeout'); setStep('') } }
    })()
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, total > 0, !!live.head.n, again])

  const rows = useMemo(() => {
    if (!bal) return []
    return live.launches.filter((l) => bal.has(l.token.toLowerCase())).map((l) => {
      const c = live.curves[l.curve.toLowerCase()], amount = bal.get(l.token.toLowerCase())!
      const graduated = live.grads.has(l.token.toLowerCase()) || !!c?.graduated
      const px = c && !graduated ? live.priceUsd(c) : null
      const valueEth = px === null ? null : e18(amount) * px
      let spent = 0, got = 0, known = true
      const read = histFor.has(l.curve.toLowerCase())
      for (const t of trades ?? []) if (t.curve === l.curve.toLowerCase()) { const u = live.tradeUsd(t); if (u === null) { known = false; continue } if (t.side === 'buy') spent += u; else got += u }
      return { l, c, amount, graduated, valueEth, spent, got, read, pnl: valueEth === null || !known || !read ? null : valueEth + got - spent }
    }).sort((a, b) => (b.valueEth ?? -1) - (a.valueEth ?? -1))
  }, [bal, trades, live, histFor])

  const created = who ? live.launches.filter((l) => l.creator.toLowerCase() === who).length : 0
  const value = rows.reduce((a, r) => a + (r.valueEth ?? 0), 0)
  const pnl = rows.reduce((a, r) => a + (r.pnl ?? 0), 0)
  const ethP = live.eth ?? 0
  const U = (n: number) => usd(n)

  const go = (e: React.FormEvent) => { e.preventDefault(); const v = input.trim(); if (isAddress(v)) { navigate('/cartera/' + v.toLowerCase()); setInput('') } }

  return (
    <div className="page">
      <div className="ph">
        <div className="ph-row">
          {who ? <Avatar address={who} size={56} /> : <GIcon name="wallet" size={44} />}
          <div style={{ minWidth: 0 }}>
            <h2>{who ? <>{nameOf(who)} <span className="mono fa" style={{ fontSize: 14, fontWeight: 500 }}>{short(who)}</span></> : tr('Portfolio')}</h2>
            <p>{who ? <>{isContract ? tr('Contract (router or bot), not a person') : me && who === me.toLowerCase() ? tr('Your wallet') : tr('Every wallet is public')} · <a href={`${EXPLORER}/address/${who}`} target="_blank" rel="noreferrer">{tr('explorer')} ↗</a>{created > 0 && <> · <a href={`/creator/${who}`}>{tr('launched {n} tokens', { n: created })}</a></>}</> : tr('Connect your wallet or paste any address to see what it holds on pons.')}</p>
          </div>
          <form className="ph-act addrform" onSubmit={go}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={tr('View another wallet 0x…')} aria-label={tr('Address')} spellCheck={false} />
            {!me && <button type="button" className="btn pri" onClick={connect}>{tr('Connect wallet')}</button>}
            {me && who !== me.toLowerCase() && <a className="btn" href="/portfolio">{tr('My portfolio')}</a>}
          </form>
        </div>
      </div>

      {who && <>
        <div className="kpis">
          <div className="kpi"><span>{tr('On pons curves')}</span><b>{bal ? U(value) : '…'}</b>{bal && ethP > 0 && <small>{fmtE(value / ethP)}</small>}</div>
          <div className="kpi"><span>{tr('P&L on those tokens')}</span><b className={pnl >= 0 ? 'up' : 'dn'}>{trades ? (pnl >= 0 ? '+' : '−') + U(Math.abs(pnl)).replace('$', '$') : '…'}</b>{trades && <small>{tr('value + sold − bought')}</small>}</div>
          <div className="kpi"><span><EthLogo size={13} /> ETH</span><b>{base ? fmtE(e18(base.eth)) : '…'}</b></div>
          <div className="kpi"><span>PONS</span><b>{base ? tok(base.pons) : '…'}</b></div>
        </div>

        {err && <div className="perm"><span>{tr('The Robinhood network did not answer in time.')}</span><button className="btn sm" onClick={() => setAgain((n) => n + 1)}>{tr('Retry')}</button></div>}
        {step && <div className="loadbar"><i style={{ width: `${(done / Math.max(1, step === 'scan' ? total : Math.min(MAX_HIST, rows.length))) * 100}%` }} /><span>{step === 'scan' ? tr('Checking balances in every pons token') : tr('Reading its buys and sells')}… {done.toLocaleString('en-US')}/{(step === 'scan' ? total : Math.min(MAX_HIST, rows.length)).toLocaleString('en-US')}</span></div>}

        {bal && !rows.length && <div className="empty">{tr('This wallet holds no pons tokens right now.')}</div>}
        {rows.length > 0 && <div className="tbl">
          <div className="tr th" style={{ gridTemplateColumns: COLS }}><span /><span>{tr('Token')}</span><span className="r">{tr('Amount')}</span><span className="r">{tr('Value')}</span><span className="r">{tr('Bought')}</span><span className="r">{tr('Sold')}</span><span className="r">{tr('P&L')}</span></div>
          {rows.map((r) => {
            const m = live.meta[r.l.token.toLowerCase()]
            return (
              <a key={r.l.curve} className="tr" style={{ gridTemplateColumns: COLS }} href={`/token/${r.l.curve.toLowerCase()}`}>
                <TokenImg src={m?.logo} seed={r.l.token} label={m?.symbol} className="r30" />
                <span className="n"><b>{m?.name || '…'}</b><small className="mono">${m?.symbol || ''} · {r.graduated ? tr('graduated') : r.c ? tr('{pct}% of curve', { pct: (progress(r.c) * 100).toFixed(0) }) : '…'}</small></span>
                <span className="r mono">{tok(r.amount)}</span>
                <span className="r mono">{r.valueEth === null ? <span className="fa" title={tr('Graduated (trades on a DEX) or paired with a stock without a reliable price')}>{r.graduated ? tr('on DEX') : tr('no price')}</span> : U(r.valueEth)}</span>
                <span className="r mono">{trades && !r.read ? <span className="fa">{tr('not read')}</span> : trades ? (r.spent ? U(r.spent) : <span className="fa" title={tr('Arrived by transfer')}>—</span>) : '…'}</span>
                <span className="r mono">{trades && !r.read ? <span className="fa">—</span> : trades ? (r.got ? U(r.got) : <span className="fa">—</span>) : '…'}</span>
                <span className={'r mono ' + (r.pnl === null || !trades ? '' : r.pnl >= 0 ? 'up' : 'dn')}>{!trades || r.pnl === null ? '…' : r.spent ? pct((r.pnl / r.spent) * 100) : <span className="fa">—</span>}</span>
              </a>
            )
          })}
        </div>}
        <p className="foot">{tr('Balances are checked across the {n} tokens launched on pons v2. Value uses each curve’s current price in USD (ETH at the Coinbase price, USDG at $1). Graduated tokens (already on a DEX) and stock pairs are not added. “Bought” and “Sold” are this wallet’s curve trades (read for its 60 largest positions). Balances under 1 token are ignored.', { n: total.toLocaleString('en-US') })}</p>
      </>}
    </div>
  )
}
const MAX_HIST = 60
const COLS = '30px minmax(0,1.6fr) 90px 90px 100px 100px 80px'
