import { useEffect, useMemo, useState } from 'react'
import { getAddress } from 'viem'
import type { Live } from './usePons'
import { rh, loadBalances, tokenBalance, loadWalletTrades, areContracts, REAL_PONS, type Trade } from './pons'

export const MAX_HIST = 60
const e18 = (w: bigint) => Number(w) / 1e18

/** Holdings of a wallet across every pons token, with cost from its own curve trades (same numbers as the desktop Portfolio). */
export function usePortfolio(live: Live, who: string | null) {
  const [bal, setBal] = useState<Map<string, bigint> | null>(null)
  const [base, setBase] = useState<{ eth: bigint; pons: bigint } | null>(null)
  const [trades, setTrades] = useState<Trade[] | null>(null)
  const [step, setStep] = useState<'' | 'scan' | 'hist'>('')
  const [done, setDone] = useState(0)
  const [isContract, setIsContract] = useState(false)
  const [err, setErr] = useState(false)
  const [again, setAgain] = useState(0)
  const [histFor, setHistFor] = useState<Set<string>>(new Set())
  const total = live.launches.length

  useEffect(() => {
    if (!who || !total || !live.head.n) return
    let dead = false
    setBal(null); setTrades(null); setBase(null); setDone(0); setIsContract(false); setErr(false)
    areContracts([who]).then((m) => !dead && setIsContract(!!m.get(who))).catch(() => {})
    const a = getAddress(who)
    ;(async () => {
      try {
        Promise.all([rh.getBalance({ address: a }), tokenBalance(REAL_PONS, a)]).then(([e, p]) => !dead && setBase({ eth: e, pons: p })).catch(() => {})
        setStep('scan')
        const b = await loadBalances(a, live.launches.map((l) => l.token), (n) => !dead && setDone(n))
        if (dead) return
        for (const [k, v] of b) if (v < 10n ** 18n) b.delete(k) // dust left by bots
        setBal(b)
        const all = live.launches.filter((l) => b.has(l.token.toLowerCase()))
        live.ensureMeta(all.map((l) => l.token)); await live.refreshCurves(all.map((l) => l.curve))
        const held = [...all].sort((x, y) => Number((b.get(y.token.toLowerCase())! - b.get(x.token.toLowerCase())!) / 10n ** 15n)).slice(0, MAX_HIST)
        if (dead) return
        setHistFor(new Set(held.map((l) => l.curve.toLowerCase())))
        setStep('hist'); setDone(0)
        const t = await loadWalletTrades(a, held, live.head.n, (n) => !dead && setDone(n))
        if (!dead) { setTrades(t); setStep('') }
      } catch { if (!dead) { setErr(true); setStep('') } }
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
      const value = px === null ? null : e18(amount) * px
      let spent = 0, got = 0, known = true
      const read = histFor.has(l.curve.toLowerCase())
      for (const t of trades ?? []) if (t.curve === l.curve.toLowerCase()) { const u = live.tradeUsd(t); if (u === null) { known = false; continue } if (t.side === 'buy') spent += u; else got += u }
      return { l, c, amount, graduated, value, spent, got, read, pnl: value === null || !known || !read ? null : value + got - spent }
    }).sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
  }, [bal, trades, live, histFor])

  const value = rows.reduce((a, r) => a + (r.value ?? 0), 0)
  const pnl = rows.reduce((a, r) => a + (r.pnl ?? 0), 0)
  const spent = rows.reduce((a, r) => a + (r.pnl === null ? 0 : r.spent), 0)
  return { bal, base, trades, rows, value, pnl, spent, step, done, total, isContract, err, retry: () => setAgain((n) => n + 1) }
}
