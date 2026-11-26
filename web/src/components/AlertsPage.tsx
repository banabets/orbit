import { useState } from 'react'
import type { Live } from '../lib/usePons'
import type { Alerts, AlertPrefs } from '../lib/alerts'
import { agoMs, short, usd } from '../lib/format'
import { useT } from '../lib/i18n'
import { usePush } from '../lib/push'
import type { Wallet } from '../lib/wallet'
import { targetProgress, byDay, FILTER_KINDS, useLastSeen, type FeedFilter } from '../lib/alertsView'
import { TokenImg } from './TokenImg'
import { GIcon, type Concept } from './Icon'
import { PushSwitch } from './PushSwitch'
import '../alerts.css'

const KIND_ICON: Record<string, Concept> = { launch: 'launch', grad: 'graduated', near: 'race', whale: 'whale', devsell: 'trades', test: 'alerts', target: 'coins' }
const KIND_TONE: Record<string, string> = { launch: 'v', grad: 'v', near: 'b', whale: 'y', devsell: 'r', test: 'g', target: 'g' }

export function AlertsPage({ live, alerts, follows, creators, wallet }: { live: Live; alerts: Alerts; follows: Set<string>; creators: Set<string>; wallet: Wallet }) {
  const { t } = useT()
  const { prefs, setPrefs, perm } = alerts
  const push = usePush(wallet.address, (m) => wallet.signText(m))
  const [filter, setFilter] = useState<FeedFilter>('all')
  const since = useLastSeen()

  const sw = (k: keyof AlertPrefs, label: string, hint: string) => (
    <label className="al-rule">
      <span className="tx"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" className="al-sw" checked={prefs[k] as boolean} onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })} />
    </label>
  )
  const checks = [
    { on: perm === 'granted', label: t('Notifications') },
    { on: push.state === 'on', label: t('With Orbit closed') },
    { on: prefs.mailSound, label: t('Sound') },
  ]
  const onCount = checks.filter((c) => c.on).length
  const kinds = FILTER_KINDS[filter]
  const shown = alerts.history.filter((h) => !kinds || kinds.includes(h.kind))
  const today = alerts.history.filter((h) => Date.now() - h.at < 86400000).length

  return (
    <div className="page al-page">
      <div className="al-title"><h2>{t('Alerts')}</h2><span className="mu">{t('Saved on this device')}</span></div>

      <div className={'al-health' + (onCount === 3 ? ' ok' : '')}>
        <div className="t">
          {perm === 'granted' ? t('Alerts reach you') : t('Turn on notifications to get your alerts')}
          <small>{perm === 'denied' ? t('You blocked notifications for this site. Turn them on from the lock icon in the address bar.')
            : perm === 'unsupported' ? t('This browser does not allow notifications. Alerts are still saved below.')
            : t('{n} of 3 checks on. Mail pings arrive even with Orbit closed once you turn that on.', { n: onCount })}</small>
        </div>
        <div className="chips">{checks.map((c) => <span key={c.label} className={'al-chip ' + (c.on ? 'on' : 'off')}>{c.label}</span>)}</div>
        {perm === 'default' ? <button className="btn sm pri" onClick={alerts.ask}>{t('Allow notifications')}</button>
          : perm === 'granted' ? <button className="btn sm" onClick={alerts.test}>{t('Send a test')}</button> : null}
      </div>

      <div className="al-grid">
        <div className="al-col">
          <section className="al-card">
            <div className="hd"><span className="al-ico g"><GIcon name="coins" size={16} /></span><b>{t('Price alerts')}</b><span className="ct">{t('{n} active', { n: alerts.targets.length })}</span></div>
            {!alerts.targets.length && <p className="al-empty">{t('Open a token and press the bell to get pinged at a market cap you choose.')}</p>}
            {alerts.targets.map((x) => {
              const l = live.byCurve.get(x.curve), m = l ? live.meta[l.token.toLowerCase()] : undefined
              const c = live.curves[x.curve], now = c ? live.mcapUsd(c) : 0, p = targetProgress(x, now)
              return (
                <div key={x.id} className="al-target">
                  <a href={`/token/${x.curve}`}><TokenImg src={m?.logo} seed={l?.token ?? x.curve} label={m?.symbol} className="r30" /></a>
                  <a className="mid" href={`/token/${x.curve}`}>
                    <span className="nm"><b>${m?.symbol || '…'}</b><small>{x.dir === 'above' ? t('market cap reaches {v}', { v: usd(x.usd) }) : t('market cap drops to {v}', { v: usd(x.usd) })}</small></span>
                    <span className={'al-prog' + (x.dir === 'below' ? ' down' : '')}><i style={{ width: `${Math.round(p * 100)}%` }} /></span>
                  </a>
                  <span className="val mono">{now ? usd(now) : '—'}<small>{t('{p}% there', { p: Math.round(p * 100) })}</small></span>
                  <button className="al-x" onClick={() => alerts.removeTarget(x.id)} aria-label={t('Remove')} title={t('Remove')}>✕</button>
                </div>)
            })}
          </section>

          <section className="al-card">
            <div className="hd"><span className="al-ico b"><GIcon name="race" size={16} /></span><b>{t('Tokens & creators you follow')}</b><span className="ct">{t('{a} tokens · {b} creators', { a: follows.size, b: creators.size })}</span></div>
            {sw('followedNear', t('Crosses 50, 75 or 90% of its curve'), t('Only crossings seen live'))}
            {sw('followedGrad', t('Graduates'), t('Completes its curve on pons'))}
            {sw('devSell', t('The creator sells'), t('Any sell from the wallet that launched it'))}
            {sw('creatorLaunch', t('A creator you follow launches a token'), t('Follow creators from their page'))}
            {!follows.size && !creators.size && <p className="al-empty">{t('You don’t follow anything yet. Open a token and press “Follow”, or follow a creator from their page.')}</p>}
          </section>

          <section className="al-card">
            <div className="hd"><span className="al-ico y"><GIcon name="whale" size={16} /></span><b>{t('All of pons')}</b></div>
            {sw('whaleAny', t('Big buys in any token'), t('From the amount below'))}
            <div className={'al-slider' + (prefs.whaleAny ? '' : ' dim')}>
              <input type="range" min={50} max={5000} step={50} value={prefs.whaleMin} onChange={(e) => setPrefs({ ...prefs, whaleMin: Number(e.target.value) })} aria-label={t('Minimum amount in USD')} />
              <output className="mono">${prefs.whaleMin.toLocaleString('en-US')}</output>
            </div>
            {sw('anyGrad', t('Any graduation'), '')}
          </section>

          <section className="al-card">
            <div className="hd"><span className="al-ico v"><GIcon name="mail" size={16} /></span><b>{t('Mail')}</b></div>
            {sw('mailNotify', t('New messages'), t('A notification when someone writes to your wallet'))}
            {sw('mailSound', t('Sound'), t('A short chime while Orbit is open'))}
            <PushSwitch wallet={wallet} push={push} />
          </section>
        </div>

        <section className="al-card al-feed">
          <div className="hd"><b>{t('Latest')}</b><span className="ct">{t('{n} today', { n: today })}</span>{alerts.history.length > 0 && <button className="lnk" onClick={alerts.clear}>{t('Clear')}</button>}</div>
          <div className="al-filters" role="group" aria-label={t('Filter alerts')}>
            {([['all', t('All')], ['whale', t('Big buys')], ['grad', t('Graduations')], ['target', t('Price alerts')], ['follow', t('Following')]] as [FeedFilter, string][]).map(([k, label]) =>
              <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
          </div>
          {!shown.length && <div className="al-none"><GIcon name="alerts" size={36} /><span>{alerts.history.length ? t('Nothing of this kind yet.') : t('No alerts yet. They show up here even if you don’t allow notifications.')}</span></div>}
          {byDay(shown, t).map(([day, items]) => (
            <div key={day}>
              <div className="al-day">{day}</div>
              {items.map((h) => {
                const l = live.byCurve.get(h.curve), m = l ? live.meta[l.token.toLowerCase()] : undefined
                return (
                  <a key={h.id} className={'al-ev' + (h.at > since ? ' new' : '')} href={h.curve ? `/token/${h.curve}` : undefined}>
                    <span className="coin"><TokenImg src={m?.logo} seed={l?.token ?? h.id} label={m?.symbol} className="r30" /><span className={'kind ' + (KIND_TONE[h.kind] ?? 'g')}><GIcon name={KIND_ICON[h.kind] ?? 'alerts'} size={11} /></span></span>
                    <span className="tx"><b>{h.title}</b><small>{h.body}{l && h.kind === 'launch' ? ` · ${short(l.creator)}` : ''}</small></span>
                    <time className="mono">{agoMs(h.at)}</time>
                  </a>)
              })}
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
