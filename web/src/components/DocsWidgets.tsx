// The hands-on parts of Docs: each one sits inside the section it explains.
import { useMemo, useState } from 'react'
import { useT } from '../lib/i18n'
import { LABELS, type WalletLabel } from '../lib/labels'
import { Chart, type Pt } from './Chart'

/** Mail: who gets what, with the PaidInbox rules (5% fee on what the recipient keeps; no reply in 72h = 100% back) */
export function MailCalc() {
  const { t } = useT()
  const [amt, setAmt] = useState('250')
  const [coin, setCoin] = useState<'PONS' | 'ETH'>('PONS')
  const [rule, setRule] = useState<'refund' | 'keep' | 'split'>('keep')
  const [reply, setReply] = useState(true)
  const a = Math.max(0, Number(amt) || 0)
  let back = 0, them = 0, fee = 0, why = ''
  if (!reply) { back = a; why = t('Nobody replied in 72 hours, so you can take the refund and get every coin back.') }
  else if (rule === 'refund') { back = a; why = t('Their rule is Refund: they reply and you get 100% back. They answer for free.') }
  else if (rule === 'keep') { fee = a * 0.05; them = a - fee; why = t('Their rule is Keep: they collect the payment when they reply, minus the 5% fee.') }
  else { back = a / 2; fee = (a / 2) * 0.05; them = a / 2 - fee; why = t('Their rule is 50/50: half comes back to you, they keep the other half minus 5% of it.') }
  const f = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: coin === 'ETH' ? 6 : 2 })} ${coin}`
  const part = (v: number) => ({ flexGrow: a ? v / a : 0, flexBasis: 0 })
  const pctOf = (v: number) => (a && v / a > 0.12 ? Math.round((v / a) * 100) + '%' : '')
  return (
    <div className="dw dw-calc">
      <div className="dw-in">
        <label className="dw-l" htmlFor="dw-amt">{t('You pay to write')}</label>
        <div className="dw-field"><input id="dw-amt" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ''))} /><select value={coin} onChange={(e) => setCoin(e.target.value as 'PONS' | 'ETH')} aria-label={t('Coin')}><option>PONS</option><option>ETH</option></select></div>
        <span className="dw-l">{t('Their rule when they reply')}</span>
        <div className="dw-seg three" role="group">{([['refund', t('Refund')], ['keep', t('Keep')], ['split', '50/50']] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={rule === k} onClick={() => setRule(k)}>{l}</button>)}</div>
        <span className="dw-l">{t('What happens')}</span>
        <div className="dw-seg" role="group"><button type="button" aria-pressed={reply} onClick={() => setReply(true)}>{t('They reply')}</button><button type="button" aria-pressed={!reply} onClick={() => setReply(false)}>{t('No reply in 72h')}</button></div>
      </div>
      <div className="dw-out">
        <div className="dw-split" aria-hidden="true"><i className="a" style={part(back)}>{pctOf(back)}</i><i className="b" style={part(them)}>{pctOf(them)}</i><i className="c" style={part(fee)}>{pctOf(fee)}</i></div>
        <div className="dw-legend">
          <div><span className="sq a" />{t('Back to you')}<b className="mono">{f(back)}</b></div>
          <div><span className="sq b" />{t('To them')}<b className="mono">{f(them)}</b></div>
          <div><span className="sq c" />{t('Orbit fee (5% of what they keep)')}<b className="mono">{f(fee)}</b></div>
        </div>
        <p className="dw-why">{why}</p>
      </div>
    </div>
  )
}

/** Wallet labels: tap one to see what it means */
export function LabelExplorer() {
  const { t } = useT()
  const [on, setOn] = useState<WalletLabel>('sniper')
  const TEXT: Record<WalletLabel, string> = {
    sniper: t('Bought in the first minute after the token launched. Snipers often sell into the first pump.'),
    bot: t('Traded 12 or more different tokens, or 60+ times, in the last hour. Its buys are not real interest.'),
    creator: t('Launched this token, or two or more tokens. Orbit can alert you when a creator sells.'),
    whale: t('Bought $1,000 or more in the last hour. Big buys show as a whale on the chart.'),
    diamond: t('Bought this token 6 hours ago or more and has never sold any of it.'),
  }
  const NAME: Record<WalletLabel, string> = { sniper: t('Sniper'), bot: t('Bot'), creator: t('Creator'), whale: t('Whale'), diamond: t('Diamond hands') }
  return (
    <div className="dw">
      <div className="dw-labels" role="group" aria-label={t('Wallet labels')}>
        {(Object.keys(LABELS) as WalletLabel[]).map((k) => <button key={k} type="button" className={'lbl ' + LABELS[k].tone} aria-pressed={on === k} onClick={() => setOn(k)}><span aria-hidden="true">{LABELS[k].icon}</span>{NAME[k]}</button>)}
      </div>
      <p className="dw-lbl-ex" aria-live="polite">{TEXT[on]}</p>
    </div>
  )
}

/** A practice chart with made-up trades: switch line / candles, zoom and drag it */
export function ChartDemo() {
  const { t } = useT()
  const [type, setType] = useState<'line' | 'candles'>('candles')
  const pts = useMemo<Pt[]>(() => {
    // a fixed pseudo-random walk, the same every time
    let s = 7, p = 0.000012
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    const out: Pt[] = [], start = Date.now() - 24 * 3600e3
    for (let i = 0; i < 320; i++) {
      const buy = rnd() > 0.42, u = Math.round(20 + rnd() ** 4 * 1800)
      p *= 1 + (buy ? 1 : -1) * (u / 60000) * (0.6 + rnd())
      out.push({ t: start + i * 270e3, p, buy, u, whale: buy && u >= 250 })
    }
    return out
  }, [])
  return (
    <div className="dw dw-chart">
      <div className="dw-row"><span className="dw-tag">{t('Example data')}</span><div className="dw-seg small" role="group"><button type="button" aria-pressed={type === 'line'} onClick={() => setType('line')}>{t('Line')}</button><button type="button" aria-pressed={type === 'candles'} onClick={() => setType('candles')}>{t('Candles')}</button></div></div>
      <Chart pts={pts.map((x) => ({ ...x, p: x.p * 1e9 }))} type={type} fmt={(n) => '$' + (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(0))} />
      <p className="dw-why">{t('Scroll or pinch to zoom, drag to move back in time, double-click to reset. Fish and whales mark big buys.')}</p>
    </div>
  )
}

/** Curves: drag how much has been raised and watch the token head to graduation */
export function CurveDemo() {
  const { t } = useT()
  const [p, setP] = useState(35)
  const W = 320, H = 110
  const curve = (x: number) => H - 8 - (x / 100) ** 2 * (H - 20)
  const d = Array.from({ length: 51 }, (_, i) => `${i ? 'L' : 'M'}${(i / 50) * W} ${curve(i * 2)}`).join(' ')
  return (
    <div className="dw dw-curve">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true">
        <path d={d} fill="none" stroke="var(--line2)" strokeWidth="2" />
        <path d={d} fill="none" stroke="var(--buy)" strokeWidth="3" strokeDasharray={`${(p / 100) * 420} 999`} />
        <circle cx={(p / 100) * W} cy={curve(p)} r="6" fill="var(--buy)" stroke="#000" strokeWidth="2" />
      </svg>
      <input type="range" min={0} max={100} value={p} onChange={(e) => setP(Number(e.target.value))} aria-label={t('Curve progress')} />
      <p className="dw-why">{p >= 100 ? t('100%: the token graduates. Its coins and the money raised move to a Uniswap pool, and trading continues there.') : t('{p}% of the curve filled. Every buy pushes the price up the curve; every sell brings it down.', { p })}</p>
    </div>
  )
}

export const WIDGETS: Record<string, () => React.ReactElement> = { mail: MailCalc, labels: LabelExplorer, token: ChartDemo, launches: CurveDemo }
