// The official $ORBIT coin across Orbit (see lib/official.ts): the big card on the Radar, the small card in the
// side menu, and the "only real contract" notice on its own page. Buying always happens on pons.
import { useEffect, useState } from 'react'
import type { Live } from '../lib/usePons'
import { ORBIT_TOKEN, ORBIT_SYMBOL, orbitBuyUrl, isOfficialToken } from '../lib/official'
import { progress } from '../lib/pons'
import { pct, usd } from '../lib/format'
import { useT } from '../lib/i18n'
import { changeOf } from './Home'
import { navigate } from '../lib/nav'
import { TokenImg } from './TokenImg'
import { Verified } from './Verified'
import '../orbit-coin.css'

/** the coin's launch, curve state, logo and numbers (null until it is in the launch list) */
export function useOrbitCoin(live: Live) {
  const l = ORBIT_TOKEN ? live.byToken.get(ORBIT_TOKEN.toLowerCase()) : undefined
  const curve = l?.curve.toLowerCase()
  const cv = curve ? live.curves[curve] : undefined
  useEffect(() => { if (l) { live.ensureMeta([l.token]); if (!cv) live.refreshCurves([l.curve]) } }, [l?.token]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!l || !curve) return null
  const m = live.meta[l.token.toLowerCase()]
  return { l, curve, cv, m, mcap: cv ? live.mcapUsd(cv) : 0, ch: changeOf(live, curve), stats: live.stats[curve], progress: cv ? progress(cv) : 0 }
}

function CopyCA({ short: s }: { short?: boolean }) {
  const { t } = useT()
  const [ok, setOk] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(ORBIT_TOKEN) ; setOk(true); setTimeout(() => setOk(false), 1400) } catch { /* clipboard blocked: the address is selectable */ } }
  return (
    <span className="nx-ca">
      <code className="mono" title={ORBIT_TOKEN}>{s ? ORBIT_TOKEN.slice(0, 6) + '…' + ORBIT_TOKEN.slice(-4) : ORBIT_TOKEN}</code>
      <button type="button" onClick={copy}>{ok ? t('Copied') + ' ✓' : t('Copy')}</button>
    </span>
  )
}

/** desktop Radar: the big card on top */
export function OrbitHero({ live }: { live: Live }) {
  const { t } = useT()
  const c = useOrbitCoin(live)
  if (!ORBIT_TOKEN) return null
  return (
    <section className="nx-hero" aria-label={t('The official Orbit coin')}>
      <TokenImg src={c?.m?.logo} seed={ORBIT_TOKEN} label={ORBIT_SYMBOL} className="r56" />
      <div className="nx-mid">
        <h3><Verified size={20} coin />${ORBIT_SYMBOL} <span>{t('The official Orbit coin')}</span></h3>
        <p>{t('Live on pons. Only this contract is real: anything else is fake.')}</p>
        {c && <div className="nx-stats mono">
          <span>{t('Market cap')} <b className="up">{c.mcap ? usd(c.mcap) : '…'}</b></span>
          {c.stats && <span>{t('Change')} <b className={c.ch >= 0 ? 'up' : 'dn'}>{pct(c.ch)}</b></span>}
          {c.cv && !c.cv.graduated && <span>{t('Curve')} <b>{(c.progress * 100).toFixed(0)}%</b></span>}
          {c.stats && <span>{t('Vol 1h')} <b>{usd(c.stats.vol)}</b></span>}
        </div>}
      </div>
      <div className="nx-act">
        <CopyCA short />
        <a className="nx-buy" href={orbitBuyUrl()} target="_blank" rel="noreferrer">{t('Buy on pons')} ↗</a>
        {c && <button type="button" className="nx-view" onClick={() => navigate('/token/' + c.curve)}>{t('View on Orbit')}</button>}
      </div>
    </section>
  )
}

/** desktop side menu: a small card at the bottom */
export function OrbitSideCard({ live }: { live: Live }) {
  const { t } = useT()
  const c = useOrbitCoin(live)
  if (!ORBIT_TOKEN) return null
  return (
    <div className="nx-side">
      <b><Verified size={15} coin />${ORBIT_SYMBOL}</b>
      <small className="mono">{c?.mcap ? usd(c.mcap) : t('Official coin')}{c?.stats ? <> · <span className={c.ch >= 0 ? 'up' : 'dn'}>{pct(c.ch)}</span></> : null}</small>
      <a href={orbitBuyUrl()} target="_blank" rel="noreferrer">{t('Buy on pons')}</a>
    </div>
  )
}

/** on the coin's own page (desktop and phone): the only real contract */
export function OfficialNotice({ token, phone }: { token: string; phone?: boolean }) {
  const { t } = useT()
  if (!isOfficialToken(token)) return null
  return (
    <div className={'nx-notice' + (phone ? ' phone' : '')}>
      <Verified size={phone ? 20 : 24} coin />
      <p><b>{t('The official Orbit coin.')}</b> {t('This is the only real contract. Orbit never asks you to send money or connect anywhere else.')}</p>
      <CopyCA short={phone} />
    </div>
  )
}
