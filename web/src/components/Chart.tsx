import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { px, usd } from '../lib/format'
import { useT } from '../lib/i18n'
import { GI_BODY } from '../lib/gameIcons'
import { buildCandles, buildTradeCandles, stepLabel } from '../lib/candles'
import { useChartWindow } from '../lib/useChartWindow'

export type Pt = { t: number; p: number; buy: boolean; u: number; whale: boolean }
type Props = { pts: Pt[]; type: 'line' | 'candles'; fmt?: (n: number) => string; byTrades?: boolean }

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** Token chart. Line: every trade in sequence. Candles: time candles (see lib/candles). */
export function Chart({ pts: full, type, fmt = px, byTrades }: Props) {
  const { t } = useT()
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(800)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(320, el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => setHover(null), [type, full.length])
  // zoom / pan: the window is a slice of the full time span; candles regroup to fit what is visible
  const view = useChartWindow(full.length > 8 ? 8 / full.length : 1, `${type}:${full[0]?.t ?? 0}`)
  const setBox = view.ref
  const boxRef = useCallback((el: HTMLDivElement | null) => { wrap.current = el; setBox(el) }, [setBox])
  const all = useMemo(() => {
    if (!view.zoomed || full.length < 3) return full
    const t0 = full[0].t, span = full[full.length - 1].t - t0 || 1, lo = t0 + view.a * span, hi = t0 + view.b * span
    const inside = full.filter((x) => x.t >= lo && x.t <= hi)
    if (inside.length >= 2) return inside
    const i = Math.max(0, full.findIndex((x) => x.t >= lo) - 1)
    return full.slice(i, i + 2)
  }, [full, view.zoomed, view.a, view.b])

  // the line only needs ~600 points to look exact; candles always use every trade
  const pts = useMemo(() => (type === 'line' && all.length > 600 ? all.filter((_, i) => i % Math.ceil(all.length / 600) === 0 || i === all.length - 1) : all), [all, type])
  // time candles; or, when the trading came in a short burst, one candle per group of trades
  const { candles, step, per } = useMemo(() => {
    if (type !== 'candles') return { candles: [], step: 0, per: 0 }
    if (byTrades) { const r = buildTradeCandles(all, Math.max(30, Math.round(w / 18))); return { candles: r.candles, step: 0, per: r.per } }
    return { ...buildCandles(all, Math.max(30, Math.round(w / 16))), per: 0 }
  }, [all, type, w, byTrades])
  const unitLabel = per ? t('{n} trades', { n: per }) : stepLabel(step)

  const H = 330, padL = 10, padR = 78, padT = 16, chartH = 232, volTop = 262, volH = 44
  const n = type === 'candles' ? candles.length : pts.length
  if (full.length < 2 || n < 1) return <div ref={wrap} className="chart-empty">{full.length ? t('Too few trades yet to draw the chart.') : t('Loading curve history…')}</div>

  const vals = type === 'candles' ? candles.flatMap((c) => [c.h, c.l]) : pts.map((p) => p.p)
  let hi = Math.max(...vals), lo = Math.min(...vals)
  const span = hi - lo || hi * 0.02
  hi += span * 0.12
  lo = Math.max(0, lo - span * 0.12) // prices are never negative
  const plotW = w - padL - padR
  const X = (i: number) => (type === 'candles' ? padL + ((i + 0.5) / n) * plotW : padL + (i / Math.max(1, n - 1)) * plotW)
  const Y = (v: number) => padT + ((hi - v) / (hi - lo)) * chartH
  const first = type === 'candles' ? candles[0].o : pts[0].p
  const lastV = type === 'candles' ? candles[n - 1].c : pts[n - 1].p
  const up = lastV >= first, col = up ? '#2FD08A' : '#FF5C6C'
  const ly = Y(lastV)

  let path = ''
  if (type === 'line') pts.forEach((p, i) => {
    const x = X(i), y = Y(p.p)
    if (!i) path = `M${x},${y}`
    else { const x0 = X(i - 1), y0 = Y(pts[i - 1].p), cx = (x0 + x) / 2; path += ` C${cx},${y0} ${cx},${y} ${x},${y}` }
  })
  const cw = plotW / Math.max(1, n)
  const vmax = Math.max(1, ...(type === 'candles' ? candles.map((c) => c.v) : pts.map((p) => p.u)))
  const bw = type === 'candles' ? Math.max(1.5, cw * 0.62) : Math.max(1.5, (plotW / n) * 0.6)
  const labels = n > 3 ? [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1] : [0, n - 1]
  const tAt = (i: number) => (type === 'candles' ? candles[i].t : pts[i].t)

  function move(e: React.MouseEvent<SVGSVGElement>) {
    if (view.dragging()) { setHover(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * w
    const i = type === 'candles' ? Math.floor(((x - padL) / plotW) * n) : Math.round(((x - padL) / plotW) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }
  const hc = hover !== null && type === 'candles' ? candles[hover] : null
  const hp = hover !== null && type === 'line' ? pts[hover] : null

  return (
    <div ref={boxRef} className={'chart-box' + (view.zoomed ? ' zoomed' : '')}>
      <div className="chart-zoom">
        {view.zoomed && <button type="button" onClick={view.reset}>{t('Reset')}</button>}
        <button type="button" onClick={view.zoomOut} aria-label={t('Zoom out')} disabled={!view.zoomed}>−</button>
        <button type="button" onClick={view.zoomIn} aria-label={t('Zoom in')}>+</button>
      </div>
      <svg viewBox={`0 0 ${w} ${H}`} width="100%" height={H} onMouseMove={move} onMouseLeave={() => setHover(null)} role="img" aria-label={t('Price chart')} {...view.handlers} style={{ touchAction: 'pan-y', cursor: 'grab' }}>
        <defs><linearGradient id="nx-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".32" /><stop offset=".85" stopColor={col} stopOpacity="0" /></linearGradient></defs>
        {[0, 1, 2, 3, 4].map((g) => { const v = hi - ((hi - lo) * g) / 4, y = Y(v); return <g key={g}><line x1={padL} x2={w - padR + 6} y1={y} y2={y} stroke="#1C1F27" /><text x={w - padR + 12} y={y + 3.5} fill="#585B66" fontSize="10" fontFamily="Geist Mono">{fmt(v)}</text></g> })}
        {type === 'line' ? (
          <>
            <path d={`${path} L${X(n - 1)},${padT + chartH} L${X(0)},${padT + chartH} Z`} fill="url(#nx-area)" />
            <path d={path} fill="none" stroke={col} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => { const h = Math.max(1, (p.u / vmax) * volH); return <rect key={i} x={X(i) - bw / 2} y={volTop + volH - h} width={bw} height={h} rx="1" fill={p.buy ? 'rgba(47,208,138,.45)' : 'rgba(255,92,108,.45)'} /> })}
            {pts.map((p, i) => { if (!p.whale) return null; const big = p.u >= 1000, c = big ? '#FBBF24' : '#7DD3FC', r = big ? 11 : 9
              return <g key={'w' + i} style={{ color: c }}><circle cx={X(i)} cy={Y(p.p) - r - 4} r={r} fill="#000" stroke={c} strokeWidth="1.5" /><svg x={X(i) - r * 0.7} y={Y(p.p) - r * 1.7 - 4} width={r * 1.4} height={r * 1.4} viewBox="0 0 512 512" dangerouslySetInnerHTML={{ __html: GI_BODY[big ? 'sperm-whale' : 'dolphin'] }} /></g> })}
          </>
        ) : (
          <>
            {candles.map((c, j) => { const x = X(j), cc = c.up ? '#2FD08A' : '#FF5C6C', top = Y(Math.max(c.o, c.c)); return (
              <g key={j} opacity={hover === null || hover === j ? 1 : 0.55}>
                <line x1={x} x2={x} y1={Y(c.h)} y2={Y(c.l)} stroke={cc} strokeWidth="1.3" />
                <rect x={x - bw / 2} y={top} width={bw} height={Math.max(1.5, Math.abs(Y(c.o) - Y(c.c)))} rx="1.5" fill={cc} />
                <rect x={x - bw / 2} y={volTop + volH - Math.max(1, (c.v / vmax) * volH)} width={bw} height={Math.max(1, (c.v / vmax) * volH)} rx="1" fill={c.up ? 'rgba(47,208,138,.45)' : 'rgba(255,92,108,.45)'} />
              </g>) })}
            {candles.map((c, j) => { if (!c.tier) return null; const big = c.tier === 2, cc = big ? '#FBBF24' : '#7DD3FC', r = big ? 10 : 8, x = X(j), y = Y(c.h) - r - 6
              return <g key={'w' + j} style={{ color: cc }}><circle cx={x} cy={y} r={r} fill="#000" stroke={cc} strokeWidth="1.5" /><svg x={x - r * 0.7} y={y - r * 0.7} width={r * 1.4} height={r * 1.4} viewBox="0 0 512 512" dangerouslySetInnerHTML={{ __html: GI_BODY[big ? 'sperm-whale' : 'dolphin'] }} /></g> })}
            <text x={padL + 4} y={padT + 12} fill="#585B66" fontSize="10.5" fontFamily="Geist Mono">{unitLabel}</text>
          </>
        )}
        {labels.map((i, j) => <text key={j} x={X(i)} y={H - 6} fill="#585B66" fontSize="10" fontFamily="Geist Mono" textAnchor={j === 0 ? 'start' : j === labels.length - 1 ? 'end' : 'middle'}>{time(tAt(i))}</text>)}
        <line x1={padL} x2={w - padR + 6} y1={ly} y2={ly} stroke={col} strokeDasharray="2 4" opacity=".6" />
        {type === 'line' && <><circle cx={X(n - 1)} cy={ly} r="4" fill={col} /><circle className="pulse" cx={X(n - 1)} cy={ly} r="4" fill="none" stroke={col} /></>}
        <rect x={w - padR + 6} y={ly - 10} width={padR - 8} height="20" rx="5" fill={col} />
        <text x={w - padR / 2 + 2} y={ly + 4} textAnchor="middle" fill="#07080A" fontSize="10.5" fontWeight="700" fontFamily="Geist Mono">{fmt(lastV)}</text>
        {hover !== null && <line x1={X(hover)} x2={X(hover)} y1={padT} y2={volTop + volH} stroke="#585B66" strokeDasharray="3 3" />}
        {hp && hover !== null && <circle cx={X(hover)} cy={Y(hp.p)} r="5" fill="#EFF0F3" stroke="#07080A" strokeWidth="2" />}
      </svg>
      {hp && hover !== null && (
        <div className="tip" style={{ left: `${(X(hover) / w) * 100}%`, top: Y(hp.p) }}>
          <b>{fmt(hp.p)}</b><br />
          <span className={hp.buy ? 'up' : 'dn'}>{hp.buy ? t('Buy') : t('Sell')} {usd(hp.u)}</span>{hp.whale && <span style={{ color: hp.u >= 1000 ? 'var(--sun)' : 'var(--sky)' }}> · {hp.u >= 1000 ? t('Whale') : t('Dolphin')}</span>}<br />
          <span className="fa">{new Date(hp.t).toLocaleTimeString()}</span>
        </div>
      )}
      {hc && hover !== null && (
        <div className="tip" style={{ left: `${(X(hover) / w) * 100}%`, top: Y(hc.h) }}>
          <span className="fa">{time(hc.t)} · {unitLabel}</span><br />
          <span className="mono">O {fmt(hc.o)} · H {fmt(hc.h)}</span><br />
          <span className="mono">L {fmt(hc.l)} · <b className={hc.up ? 'up' : 'dn'}>C {fmt(hc.c)}</b></span><br />
          <span className="fa">{t('Volume')} {usd(hc.v)}</span>
        </div>
      )}
    </div>
  )
}
