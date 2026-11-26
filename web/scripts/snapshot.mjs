// Captures a real snapshot of pons v2 for the design mockups.
import { writeFileSync } from 'node:fs'
import { loadLaunches, loadTrades, loadMeta, loadCurves, priceEth, mcapEth, progress, raisedEth, ethUsd, logoCandidates } from '../src/lib/pons.ts'
const out = process.argv[2]
const { head, launches, graduated } = await loadLaunches()
const span = 61000n // ~2 h
const trades = await loadTrades(head - span, head)
const byCurve = new Map(launches.map(l => [l.curve.toLowerCase(), l]))
const agg = {}
for (const t of trades) { const a = (agg[t.curve] ??= { vol: 0, buys: 0, sells: 0, traders: new Set(), pts: [] }); const e = Number(t.eth) / 1e18; a.vol += e; t.side === 'buy' ? a.buys++ : a.sells++; a.traders.add(t.trader); if (t.tokens > 0n) a.pts.push([Number(head - t.block), e / (Number(t.tokens) / 1e18), t.side === 'buy' ? 1 : 0, e]) }
const top = Object.entries(agg).filter(([c]) => byCurve.has(c)).sort((a, b) => b[1].vol - a[1].vol).slice(0, 24).map(([c]) => c)
const recent = launches.slice(0, 10).map(l => l.curve.toLowerCase())
const curvesList = [...new Set([...top, ...recent])]
const tokens = curvesList.map(c => byCurve.get(c).token)
const [meta, curves, eth] = await Promise.all([loadMeta(tokens), loadCurves(curvesList), ethUsd()])
const rows = curvesList.map(c => { const l = byCurve.get(c), m = meta[l.token.toLowerCase()] || {}, cv = curves[c], a = agg[c]
  return { token: l.token, curve: c, creator: l.creator, ageBlocks: Number(head - l.block), name: m.name, symbol: m.symbol, logo: logoCandidates(m.logo)[0] || '', description: (m.description||'').slice(0, 160),
    mcapEth: cv ? mcapEth(cv) : 0, priceEth: cv ? priceEth(cv) : 0, progress: cv ? progress(cv) : 0, raised: cv ? raisedEth(cv) : 0, graduated: graduated.has(l.token.toLowerCase()) || !!cv?.graduated,
    vol: a?.vol || 0, buys: a?.buys || 0, sells: a?.sells || 0, traders: a?.traders.size || 0, series: (a?.pts || []).reverse() } })
writeFileSync(out, JSON.stringify({ capturedAt: new Date().toISOString(), head: Number(head), ethUsd: eth, launches24: launches.filter(l => l.block > head - 732000n).length, tradeCount: trades.length, rows }, null, 1))
console.log('rows', rows.length, 'trades', trades.length, 'eth', eth)
