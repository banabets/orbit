import { navigate } from '../lib/nav'
import { PushSwitch } from './PushSwitch'
import { usePush } from '../lib/push'
import { targetProgress, byDay, FILTER_KINDS, useLastSeen, type FeedFilter } from '../lib/alertsView'
import type { Wallet } from '../lib/wallet'
import { useState } from 'react'
import { isAddress, type Hex } from 'viem'
import type { Live } from '../lib/usePons'
import type { Alerts, AlertPrefs } from '../lib/alerts'
import { usePortfolio, MAX_HIST } from '../lib/usePortfolio'
import { progress } from '../lib/pons'
import { usd, pct, short, agoMs } from '../lib/format'
import { useT } from '../lib/i18n'
import { useNames } from '../lib/names'
import { TokenImg } from './TokenImg'
import { GIcon, Avatar, type Concept } from './Icon'
import { EthLogo } from './EthLogo'
import ponsLogo from '../assets/pons.webp'

const EXPLORER = 'https://robin.etherscan.io'
const e18 = (w: bigint) => Number(w) / 1e18
const amt = (w: bigint) => { const n = e18(w); return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n.toFixed(n < 10 ? 2 : 0) }

/* ---------------- Portfolio ---------------- */
export function MPortfolio({ live, addr, me, connect }: { live: Live; addr: string | null; me: Hex | null; connect: () => void }) {
  const { t } = useT()
  const who = addr ?? me?.toLowerCase() ?? null
  const p = usePortfolio(live, who)
  const nameOf = useNames(who ? [who] : [])
  const [input, setInput] = useState('')
  const open = (e: React.FormEvent) => { e.preventDefault(); const v = input.trim(); if (isAddress(v)) { navigate('/portfolio/' + v.toLowerCase()); setInput('') } }
  const created = who ? live.launches.filter((l) => l.creator.toLowerCase() === who).length : 0
  const totalSteps = p.step === 'scan' ? p.total : Math.min(MAX_HIST, p.rows.length)
  const pnlPct = p.spent ? (p.pnl / p.spent) * 100 : null

  const lookup = (
    <form className="m-lookup" onSubmit={open}>
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('View another wallet 0x…')} aria-label={t('Address')} spellCheck={false} autoCapitalize="off" autoCorrect="off" />
      <button type="submit" aria-label={t('Open')}>→</button>
    </form>
  )

  if (!who) return (
    <>
      <div className="m-head"><h2>{t('Portfolio')}</h2></div>
      <div className="m-pf-empty">
        <span className="m-meicon"><GIcon name="wallet" size={34} /></span>
        <p>{t('Connect your wallet or paste any address to see what it holds on pons.')}</p>
        <button className="m-bigbtn" onClick={connect}>{t('Connect wallet')}</button>
      </div>
      {lookup}
      <div style={{ height: 110 }} />
    </>
  )

  return (
    <>
      <div className="m-pf-hero">
        <div className="who">
          <Avatar address={who} size={52} />
          <div><b>{nameOf(who)}</b><span className="mono">{short(who)} · <a href={`${EXPLORER}/address/${who}`} target="_blank" rel="noreferrer">{t('explorer')} ↗</a></span>
            <small>{p.isContract ? t('Contract (router or bot), not a person') : me && who === me.toLowerCase() ? t('Your wallet') : t('Every wallet is public')}{created > 0 && <> · <a href={`/creator/${who}`}>{t('launched {n} tokens', { n: created })}</a></>}</small></div>
        </div>
        <span className="lbl">{t('On pons curves')}</span>
        <div className="bal mono">{p.bal ? usd(p.value) : '…'}</div>
        {p.trades && p.rows.length > 0 && <span className={'chg ' + (p.pnl >= 0 ? 'up' : 'dn')}>{p.pnl >= 0 ? '+' : '−'}{usd(Math.abs(p.pnl))}{pnlPct !== null && ' · ' + pct(pnlPct)}</span>}
        {!p.trades && p.bal && <span className="mu sm">{t('Reading its buys and sells')}…</span>}
      </div>
      <div className="m-chips">
        <div className="m-stat"><EthLogo size={22} /><div><b className="mono">{p.base ? e18(p.base.eth).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '…'}</b><small>ETH</small></div></div>
        <div className="m-stat"><img src={ponsLogo} width={22} height={22} alt="" style={{ borderRadius: '50%' }} /><div><b className="mono">{p.base ? amt(p.base.pons) : '…'}</b><small>PONS</small></div></div>
        <div className="m-stat"><GIcon name="coins" size={22} /><div><b className="mono">{p.bal ? p.rows.length : '…'}</b><small>{t('tokens')}</small></div></div>
      </div>
      {p.err && <div className="m-note">{t('The Robinhood network did not answer in time.')} <button className="m-tab on" onClick={p.retry}>{t('Retry')}</button></div>}
      {p.step && <div className="m-progress"><div><i style={{ width: `${(p.done / Math.max(1, totalSteps)) * 100}%` }} /></div><span>{p.step === 'scan' ? t('Checking balances in every pons token') : t('Reading its buys and sells')}… {p.done.toLocaleString('en-US')}/{totalSteps.toLocaleString('en-US')}</span></div>}
      <div className="m-sec">{t('Bags')}</div>
      {p.bal && !p.rows.length && <div className="m-empty">{t('This wallet holds no pons tokens right now.')}</div>}
      <div className="m-list">
        {p.rows.map((r) => {
          const m = live.meta[r.l.token.toLowerCase()], rp = r.pnl !== null && r.spent ? (r.pnl / r.spent) * 100 : null
          return (
            <a key={r.l.curve} className="m-card m-bag" href={`/token/${r.l.curve.toLowerCase()}`}>
              <TokenImg src={m?.logo} seed={r.l.token} label={m?.symbol} className="r52" />
              <span className="n"><b>{m?.name || '…'}</b><small className="mono">{amt(r.amount)} ${m?.symbol || ''}</small></span>
              <span className="r"><span className="mc mono">{r.value === null ? <span className="fa">{r.graduated ? t('on DEX') : t('no price')}</span> : usd(r.value)}</span>{rp !== null ? <span className={'chg ' + (rp >= 0 ? 'up' : 'dn')}>{pct(rp)}</span> : null}</span>
              {r.c && !r.graduated ? <><span className="bar"><i style={{ width: `${Math.max(3, progress(r.c) * 100)}%` }} /></span><span className="meta"><span>{t('{pct}% to graduation', { pct: (progress(r.c) * 100).toFixed(0) })}</span><span>{r.read && p.trades ? `${t('Bought')} ${r.spent ? usd(r.spent) : '—'}` : ''}</span></span></> : <span className="meta"><span><GIcon name="graduated" size={13} /> {t('Graduated')}</span><span /></span>}
            </a>)
        })}
      </div>
      {lookup}
      {me && who !== me.toLowerCase() && <a className="m-link center" href="/portfolio">{t('My portfolio')}</a>}
      <div style={{ height: 110 }} />
    </>
  )
}

/* ---------------- Alerts ---------------- */
export function MAlerts({ live, alerts, follows, creators, wallet }: { live: Live; alerts: Alerts; follows: Set<string>; creators: Set<string>; wallet: Wallet }) {
  const { t } = useT()
  const { prefs, setPrefs, perm } = alerts
  const [tab, setTab] = useState<'feed' | 'rules'>('feed')
  const [filter, setFilter] = useState<FeedFilter>('all')
  const push = usePush(wallet.address, (m) => wallet.signText(m))
  const since = useLastSeen()
  const kindIcon: Record<string, Concept> = { launch: 'launch', grad: 'graduated', near: 'race', whale: 'whale', devsell: 'trades', test: 'alerts', target: 'coins' }
  const row = (k: keyof AlertPrefs, icon: Concept, label: string, hint: string) => (
    <label className="m-rule">
      <span className="ic"><GIcon name={icon} size={22} /></span>
      <span className="tx"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" className="m-switch" checked={prefs[k] as boolean} onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })} />
    </label>
  )
  const checks = [{ on: perm === 'granted', label: t('Notifications') }, { on: push.state === 'on', label: t('Closed') }, { on: prefs.mailSound, label: t('Sound') }]
  const allOn = checks.every((c) => c.on)
  const kinds = FILTER_KINDS[filter]
  const shown = alerts.history.filter((h) => !kinds || kinds.includes(h.kind))
  // the price alert closest to firing, for the card on top of the feed
  const top = alerts.targets.map((x) => { const c = live.curves[x.curve]; const now = c ? live.mcapUsd(c) : 0; return { x, now, p: targetProgress(x, now) } }).sort((a, b) => b.p - a.p)[0]
  const symOf = (curve: string) => { const l = live.byCurve.get(curve); return (l && live.meta[l.token.toLowerCase()]?.symbol) || '…' }

  const permCard = (
    <div className={'m-perm ' + perm}>
      <GIcon name="alerts" size={26} />
      {perm === 'granted' ? <><span><b>{t('Notifications are on')}</b><small>{t('While Orbit is open')}</small></span><button onClick={alerts.test}>{t('Test')}</button></>
        : perm === 'denied' ? <span><b>{t('Notifications are blocked')}</b><small>{t('Turn them on in your browser settings for this site.')}</small></span>
        : perm === 'unsupported' ? <span><b>{t('Add Orbit to your home screen')}</b><small>{t('On phones, notifications work from the installed app. Alerts are still saved here.')}</small></span>
        : <><span><b>{t('Turn on notifications')}</b><small>{t('Get pinged for your rules while Orbit is open')}</small></span><button onClick={alerts.ask}>{t('Allow')}</button></>}
    </div>
  )

  return (
    <>
      <div className="m-head"><h2>{t('Alerts')}</h2><span className="sp" /><span className={'ma-chip ' + (allOn ? 'on' : 'off')}>{allOn ? t('On') : t('{n} of 3 on', { n: checks.filter((c) => c.on).length })}</span></div>
      <div className="ma-seg" role="group" aria-label={t('View')}>
        <button aria-pressed={tab === 'feed'} onClick={() => setTab('feed')}>{t('Feed')}{alerts.history.length ? ` · ${alerts.history.length}` : ''}</button>
        <button aria-pressed={tab === 'rules'} onClick={() => setTab('rules')}>{t('Settings')}</button>
      </div>
      {tab === 'feed' ? (
        <div className="m-feed">
          {perm !== 'granted' && permCard}
          {top && <a className="ma-hero" href={`/token/${top.x.curve}`}>
            <b>{t('{n} price alerts watching', { n: alerts.targets.length })}</b>
            <small>{t('${s} is {p}% of the way to {v}', { s: symOf(top.x.curve), p: Math.round(top.p * 100), v: usd(top.x.usd) })}</small>
            <span className={'ma-prog' + (top.x.dir === 'below' ? ' down' : '')}><i style={{ width: `${Math.round(top.p * 100)}%` }} /></span>
          </a>}
          {alerts.history.length > 0 && <div className="ma-chips" role="group" aria-label={t('Filter alerts')}>
            {([['all', t('All')], ['whale', t('Big buys')], ['grad', t('Graduations')], ['target', t('Price alerts')], ['follow', t('Following')]] as [FeedFilter, string][]).map(([k, label]) =>
              <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
          </div>}
          {!alerts.history.length && <div className="m-empty"><GIcon name="alerts" size={40} /><p>{t('No alerts yet. They show up here even if you don’t allow notifications.')}</p><button className="m-tab on" onClick={() => setTab('rules')}>{t('Set up my rules')}</button></div>}
          {alerts.history.length > 0 && !shown.length && <p className="m-note">{t('Nothing of this kind yet.')}</p>}
          {byDay(shown, t).map(([day, items]) => (
            <div key={day} className="ma-day-grp">
              <div className="ma-day">{day}</div>
              {items.map((h) => {
                const l = live.byCurve.get(h.curve), m = l ? live.meta[l.token.toLowerCase()] : undefined
                return (
                  <a key={h.id} className={'m-buy m-alert ' + (h.kind === 'whale' ? 'whale' : h.kind === 'grad' ? 'grad' : '') + (h.at > since ? ' fresh' : '')} href={h.curve ? `/token/${h.curve}` : undefined}>
                    <span className="coin"><TokenImg src={m?.logo} seed={l?.token ?? h.id} label={m?.symbol} className="r46" /><span className="tier"><GIcon name={kindIcon[h.kind] ?? 'alerts'} size={16} /></span></span>
                    <span className="n"><b>{h.title}</b><small>{h.body}</small></span>
                    <span className="usd mono"><small>{agoMs(h.at)}</small></span>
                  </a>)
              })}
            </div>
          ))}
          {alerts.history.length > 0 && <button className="ma-clear" onClick={alerts.clear}>{t('Clear')}</button>}
        </div>
      ) : (
        <div className="m-rules">
          <div className={'ma-hero' + (allOn ? ' ok' : '')}>
            <b>{allOn ? t('Alerts reach you') : t('Some alerts may not reach you')}</b>
            <small>{t('Notifications, with Orbit closed and sound.')}</small>
            <div className="row">{checks.map((c) => <span key={c.label} className={'ma-chip ' + (c.on ? 'on' : 'off')}>{c.label}</span>)}</div>
          </div>
          {perm !== 'granted' && permCard}
          <div className="m-sec">{t('Price alerts')} · {alerts.targets.length}</div>
          <div className="grp">
            {!alerts.targets.length && <div className="m-rule"><span className="tx"><small>{t('Open a token and tap the bell to get pinged at a market cap you choose.')}</small></span></div>}
            {alerts.targets.map((x) => {
              const l = live.byCurve.get(x.curve), m = l ? live.meta[l.token.toLowerCase()] : undefined
              const c = live.curves[x.curve], now = c ? live.mcapUsd(c) : 0, p = targetProgress(x, now)
              return (
                <div key={x.id} className="m-rule">
                  <span className="ic"><TokenImg src={m?.logo} seed={l?.token ?? x.curve} label={m?.symbol} className="r30" /></span>
                  <a className="tx" href={`/token/${x.curve}`}><b>${m?.symbol || '…'} {x.dir === 'above' ? '↑' : '↓'} {usd(x.usd)}</b><small>{now ? usd(now) : '—'} · {t('{p}% there', { p: Math.round(p * 100) })}</small><span className={'ma-prog' + (x.dir === 'below' ? ' down' : '')}><i style={{ width: `${Math.round(p * 100)}%` }} /></span></a>
                  <button className="m-x" onClick={() => alerts.removeTarget(x.id)} aria-label={t('Remove')}>✕</button>
                </div>)
            })}
          </div>
          <div className="m-sec">{t('Mail')}</div>
          <div className="grp">
            {row('mailNotify', 'mail', t('New messages'), t('A notification when someone writes to your wallet'))}
            <PushSwitch wallet={wallet} phone push={push} />
            {row('mailSound', 'mail', t('Sound'), t('A short chime while Orbit is open'))}
          </div>
          <div className="m-sec">{t('Following')} · {follows.size + creators.size}</div>
          <div className="grp">
            {row('followedNear', 'race', t('Curve 50 / 75 / 90%'), t('Only crossings seen live'))}
            {row('followedGrad', 'graduated', t('Graduates'), t('Completes its curve on pons'))}
            {row('devSell', 'trades', t('The creator sells'), t('Any sell from the wallet that launched it'))}
            {row('creatorLaunch', 'launch', t('A creator you follow launches a token'), t('Follow creators from their page'))}
          </div>
          <div className="m-sec">{t('All of pons')}</div>
          <div className="grp">
            {row('whaleAny', 'whale', t('Big buys in any token'), t('From {v}', { v: '$' + prefs.whaleMin.toLocaleString('en-US') }))}
            {prefs.whaleAny && <div className="m-rule sub"><input className="ma-range" type="range" min={50} max={5000} step={50} value={prefs.whaleMin} onChange={(e) => setPrefs({ ...prefs, whaleMin: Number(e.target.value) })} aria-label={t('Minimum amount in USD')} /><b className="mono" style={{ minWidth: 62, textAlign: 'right' }}>${prefs.whaleMin.toLocaleString('en-US')}</b></div>}
            {row('anyGrad', 'graduated', t('Any graduation'), '')}
          </div>
          {!follows.size && !creators.size && <p className="m-note">{t('You don’t follow anything yet. Open a token and press “Follow”, or follow a creator from their page.')}</p>}
        </div>
      )}
      <div style={{ height: 110 }} />
    </>
  )
}
