import { useEffect, useState } from 'react'
import type { Live } from '../lib/usePons'
import type { Alerts } from '../lib/alerts'
import { usd } from '../lib/format'
import { useT } from '../lib/i18n'
import '../avatar-picker.css'

/** Desktop price alert: "ping me when this token's market cap goes above / drops below X" (same rules as the phone sheet). */
export function TargetDialog({ live, curve, alerts, symbol, close }: { live: Live; curve: string; alerts: Alerts; symbol: string; close: () => void }) {
  const { t } = useT()
  const now = live.curves[curve] ? live.mcapUsd(live.curves[curve]) : 0
  const [dir, setDir] = useState<'above' | 'below'>('above')
  const [val, setVal] = useState(() => (now ? String(Math.round(now * 2)) : ''))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const mine = alerts.targets.filter((x) => x.curve === curve)
  const quick = dir === 'above' ? [2, 5, 10] : [0.75, 0.5]
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && close(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [close])
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
    <div className="ap-modal" onClick={(e) => e.target === e.currentTarget && close()}>
      <form className="ap-box td" role="dialog" aria-modal="true" aria-label={t('Price alert')} onSubmit={save}>
        <div className="ap-head"><b>{t('Price alert')} · ${symbol}</b><button type="button" onClick={close} aria-label={t('Close')}>✕</button></div>
        <p className="td-now">{t('Market cap now')} <b className="mono">{now ? usd(now) : '—'}</b></p>
        <div className="td-seg" role="group"><button type="button" aria-pressed={dir === 'above'} onClick={() => pick('above')}>{t('Goes above')}</button><button type="button" aria-pressed={dir === 'below'} onClick={() => pick('below')}>{t('Drops below')}</button></div>
        <label className="td-amount"><span>$</span><input autoFocus inputMode="decimal" value={val} onChange={(e) => { setVal(e.target.value); setMsg(null) }} aria-label={t('Market cap in USD')} /></label>
        <div className="td-quick">{quick.map((q) => <button type="button" key={q} onClick={() => now && setVal(String(Math.round(now * q)))}>{q >= 1 ? q + '×' : '−' + Math.round((1 - q) * 100) + '%'}</button>)}</div>
        {msg && <p className={msg.ok ? 'ap-ok' : 'ap-err'}>{msg.text}</p>}
        <button className="ap-save" type="submit">{t('Set alert')}</button>
        {mine.length > 0 && <div className="td-list">{mine.map((x) => <div key={x.id}><span className="mono">{x.dir === 'above' ? '↑' : '↓'} {usd(x.usd)}</span><button type="button" onClick={() => alerts.removeTarget(x.id)} aria-label={t('Remove')}>✕</button></div>)}</div>}
        <p className="td-foot">{t('Alerts fire while Orbit is open on this device.')}</p>
      </form>
    </div>
  )
}
