import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isAddress, getAddress, type Hex } from 'viem'
import { decrypt, type AssetKey, type Payment } from '../lib/inbox'
import { useMail, fmt, lc, type Draft, type Msg } from '../lib/useMail'
import type { Wallet } from '../lib/wallet'
import { useT } from '../lib/i18n'
import { useNames } from '../lib/names'
import { isOfficial } from '../lib/official'
import { AvatarPicker } from './AvatarPicker'
import { MailGuide, useMailGuide } from './MailGuide'
import { Avatar, GIcon } from './Icon'
import { Verified } from './Verified'
import ponsLogo from '../assets/pons.webp'
import '../mobile-mail.css'

const TTL = 72 * 3600
const FEE_BPS = 500n
const Coin = ({ k }: { k: AssetKey }) => (k === 'PONS' ? <img className="mm-coin" src={ponsLogo} alt="" /> : <i className="mm-coin eth" />)
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const ago = (ms: number) => { const m = Math.max(1, Math.round((Date.now() - ms) / 60000)); return m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd' }
const left = (sec: number) => { const s = Math.max(0, sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}h ${m}m` }

type Filter = 'all' | 'paid' | 'contacts' | 'sent'

/** Height and top of what the user actually sees: excludes the on-screen keyboard and browser toolbars. */
function useVisibleViewport() {
  const read = () => { const v = window.visualViewport; return v ? { h: v.height, top: v.offsetTop } : { h: window.innerHeight, top: 0 } }
  const [vp, setVp] = useState(read)
  useEffect(() => {
    const v = window.visualViewport, on = () => setVp(read())
    v?.addEventListener('resize', on); v?.addEventListener('scroll', on); addEventListener('resize', on)
    return () => { v?.removeEventListener('resize', on); v?.removeEventListener('scroll', on); removeEventListener('resize', on) }
  }, [])
  return vp
}

/** Mail on phones: a messaging app over the same PaidInbox logic as desktop (lib/useMail). */
export function MobileMail({ draft, wallet, blockTime }: { draft: Draft; wallet: Wallet; blockTime: (b: bigint) => number }) {
  const guide = useMailGuide()
  const { t } = useT()
  const M = useMail(wallet, draft)
  const { myAddr, peer, setPeer, msgs, cfg, pays, now, busy, toast, needKey, mine, peers, thread, peerCfg, isMe, incoming, outgoing, free, accepted, price, payWith, setPayWith, text, setText, send, unlock, saveMine, refund, expired, assetOf, keyIsCurrent, myBal } = M
  const [screen, setScreen] = useState<'inbox' | 'settings' | 'avatar'>('inbox')
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [paying, setPaying] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const vp = useVisibleViewport()
  const nameOf = useNames([...(myAddr ? [myAddr] : []), ...peers.map(([p]) => p), ...(peer ? [peer] : [])])

  // what each conversation's payments look like (for chips, filters and the money card)
  const info = useMemo(() => {
    const m = new Map<string, { incoming?: Payment; outgoing?: Payment; last?: Payment; both: boolean; sentLast: boolean }>()
    if (!myAddr) return m
    for (const [p, last] of peers) {
      const conv = msgs.filter((x) => (lc(x.from) === p && lc(x.to) === lc(myAddr)) || (lc(x.to) === p && lc(x.from) === lc(myAddr)))
      const ps = conv.map((x) => pays[x.paymentId.toString()]).filter(Boolean) as Payment[]
      m.set(p, {
        incoming: ps.find((x) => x.status === 1 && isMe(x.to) && x.expiresAt >= now),
        outgoing: ps.find((x) => x.status === 1 && isMe(x.from)),
        last: ps[ps.length - 1],
        both: conv.some((x) => isMe(x.from)) && conv.some((x) => !isMe(x.from)),
        sentLast: isMe(last.from),
      })
    }
    return m
  }, [peers, msgs, pays, myAddr, now]) // eslint-disable-line react-hooks/exhaustive-deps

  const waiting = [...info.values()].map((x) => x.incoming).filter(Boolean) as Payment[]
  const waitTotals = waiting.reduce((acc, p) => { const k = assetOf(p.asset); acc[k] = (acc[k] ?? 0n) + p.amount; return acc }, {} as Partial<Record<AssetKey, bigint>>)
  const myRefunds = expired.filter((p) => isMe(p.from))
  const qn = q.trim().toLowerCase()
  const list = peers.filter(([p]) => {
    const i = info.get(p)
    if (filter === 'paid' && !i?.incoming) return false
    if (filter === 'contacts' && !i?.both) return false
    if (filter === 'sent' && !i?.sentLast) return false
    return !qn || p.includes(qn) || nameOf(p).toLowerCase().includes(qn)
  })

  useEffect(() => { if (draft) { setScreen('inbox') } }, [draft])
  // the open chat takes the whole screen; the phone's back gesture closes it
  useEffect(() => { if (!peer) setPaying(false) }, [peer])

  if (!M.ready) return <div className="mm-empty">{t('Mail is not available right now.')} {t('Please try again in a moment.')}</div>

  /* ---------------- not connected / key / inbox setup ---------------- */
  const gate = !myAddr ? (
    <div className="mm-card">
      <GIcon name="mail" size={34} />
      <b>{t('Mail on Robinhood Chain')}</b>
      <p>{t('Messages are encrypted from your browser to theirs. The payment sits in escrow and comes back if they don’t reply in 72h. Connect your wallet to start.')}</p>
      <button className="mm-btn" onClick={wallet.connect}>{t('Connect wallet')}</button>
    </div>
  ) : needKey ? (
    <div className="mm-card">
      <span className="mm-lock">🔒</span>
      <b>{t('Unlock your mail')}</b>
      <p>{t('One free signature from your wallet (not a transaction, no gas). The same wallet unlocks the same inbox on any device.')}</p>
      <button className="mm-btn" disabled={!!busy} onClick={unlock}>{busy ?? t('Unlock with my wallet')}</button>
    </div>
  ) : !keyIsCurrent ? (
    <div className="mm-card">
      <b>{t('Update your inbox key')}</b>
      <p>{t('Your inbox on the contract uses an older key. Save it again so people can write to you from now on.')}</p>
      <button className="mm-btn" disabled={!!busy} onClick={() => saveMine(t('Your inbox key is up to date'))}>{busy ?? t('Update my key')}</button>
    </div>
  ) : !mine?.registered ? (
    <div className="mm-card">
      <b>{t('Activate your inbox')}</b>
      <p>{t('So others can message you. Choose what you charge in PONS or ETH and what happens to the payment when you reply.')}</p>
      <button className="mm-btn" onClick={() => setScreen('settings')}>{t('Set up my inbox')}</button>
    </div>
  ) : null

  /* ---------------- screens ---------------- */
  if (screen === 'settings' && myAddr) return <Settings M={M} close={() => setScreen('inbox')} />
  if (screen === 'avatar' && myAddr) return (
    <div className="mm">
      <div className="mm-top"><h2 style={{ fontSize: 24 }}>{t('Your avatar')}</h2><button className="mm-ib" onClick={() => setScreen('inbox')} aria-label={t('Close')}>✕</button></div>
      <div style={{ padding: '0 16px' }}><AvatarPicker address={myAddr} wallet={wallet} /></div>
    </div>
  )

  return (
    <div className="mm">
      <div className="mm-top">
        <h2>{t('Mail')}</h2>
        <button className="mm-ib" onClick={guide.open} aria-label={t('How Mail works')}>?</button>
        {myAddr && mine?.registered && <button className="mm-ib" onClick={() => setScreen('settings')} aria-label={t('Inbox settings')}>⚙</button>}
        {myAddr && <button className="mm-me" onClick={() => setScreen('avatar')} aria-label={t('Your avatar')}><Avatar address={myAddr} size={38} /></button>}
      </div>

      {gate}

      {myAddr && !needKey && <>
        <label className="mm-search">⌕<input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search or paste 0x… to write')} spellCheck={false} autoCapitalize="off" /></label>
        {isAddress(q.trim()) && !isMe(q.trim()) && (
          <button className="mm-conv new" onClick={() => { setPeer(getAddress(q.trim())); setQ('') }}><Avatar address={q.trim()} size={50} /><span className="tx"><b>{t('Write to')} {nameOf(q.trim())}</b><small className="mono">{q.trim().slice(0, 10)}…</small></span><span className="side">→</span></button>
        )}

        {waiting.length > 0 && (
          <div className="mm-money">
            <GIcon name="coins" size={34} />
            <div><b className="mono">{Object.entries(waitTotals).map(([k, v]) => fmt(v!, k as AssetKey)).join(' · ')}</b><small>{t('{n} paid messages waiting · reply to collect', { n: waiting.length })}</small></div>
            <button onClick={() => { const p = waiting[0]; setPeer(p.from) }}>{t('Reply')}</button>
          </div>
        )}
        {myRefunds.map((p) => (
          <div key={p.id.toString()} className="mm-money refund">
            <span>↩</span>
            <div><b className="mono">{fmt(p.amount, assetOf(p.asset))}</b><small>{t('No reply in 72h: your payment can come back')}</small></div>
            <button disabled={!!busy} onClick={() => refund(p)}>{busy ?? t('Refund')}</button>
          </div>
        ))}

        <div className="mm-pills">
          {([['all', 'All'], ['paid', 'Paid'], ['contacts', 'Contacts'], ['sent', 'Sent']] as const).map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{t(l)}{k === 'paid' && waiting.length > 0 && <i>{waiting.length}</i>}</button>
          ))}
        </div>

        <div className="mm-list">
          {M.loading && !peers.length && <div className="mm-empty">{t('reading the network…')}</div>}
          {!M.loading && !list.length && <div className="mm-empty">{peers.length ? t('Nothing here with this filter yet.') : t('No conversations yet. Paste an address above, or open a token and press “Message creator”.')}</div>}
          {list.map(([p, last]) => {
            const i = info.get(p), txt = decrypt(myAddr, cfg[p]?.encKey, last.ct), unread = !isMe(last.from) && !!i?.incoming
            return (
              <button key={p} className="mm-conv" onClick={() => setPeer((isMe(last.from) ? last.to : last.from) as Hex)}>
                <Avatar address={p} size={50} />
                <span className="tx"><b>{nameOf(p)}{isOfficial(p) && <Verified />}</b><small className={unread ? 'unread' : ''}>{isMe(last.from) ? t('You') + ': ' : ''}{txt ?? t('encrypted')}</small></span>
                <span className="side">
                  {ago(blockTime(last.block))}
                  {i?.incoming ? <span className="chip gold mono">{fmt(i.incoming.amount, assetOf(i.incoming.asset))}</span>
                    : i?.outgoing ? <span className="chip mono">{t('Waiting')}</span>
                    : i?.last?.status === 2 ? <span className="chip green">{t('Settled')}</span>
                    : i?.last?.status === 3 ? <span className="chip red">{t('Refunded')}</span> : null}
                </span>
              </button>)
          })}
        </div>
        <button className="mm-fab" onClick={() => { searchRef.current?.focus(); setQ('') }}>✎ {t('New')}</button>
        {myBal && <p className="mm-bal mono">{fmt(myBal.pons, 'PONS')} · {fmt(myBal.eth, 'ETH')}</p>}
      </>}

      {peer && myAddr && createPortal(renderThread(), document.querySelector('.mapp') ?? document.body)}
      {guide.show && createPortal(<MailGuide phone close={guide.close} />, document.querySelector('.mapp') ?? document.body)}
      {toast && createPortal(<div className={'mm-toast' + (toast.err ? ' err' : '')} role="status">{toast.t}</div>, document.querySelector('.mapp') ?? document.body)}
    </div>
  )

  // a plain render function (not a component), so typing in the composer never remounts the chat
  function renderThread() {
    const bt = blockTime, nm = nameOf, pay = paying, setPay = setPaying
    const p = peer!
    const status = !peerCfg ? t('reading…') : !peerCfg.registered ? t('no Orbit inbox') : free ? t('free · you are contacts') : peerCfg.open ? t('open inbox') : `${t('charges')} ${Object.entries(peerCfg.prices).map(([k, v]) => fmt(v!, k as AssetKey)).join(' / ')}`
    // what replying collects, by my rule (5% of what I keep goes to the treasury)
    const collect = incoming ? (() => { const r = mine?.rule ?? 0, a = incoming.amount, kept = r === 1 ? a : r === 2 ? a - a / 2n : 0n; return kept - (kept * FEE_BPS) / 10000n })() : 0n
    const paid = !incoming && !free && !outgoing && price !== undefined
    const go = () => { if (!text.trim()) return; if (paid) setPay(true); else send() }
    return (
      <div className="mm-thread" style={{ top: vp.top, height: vp.h }}>
        <div className="mm-th">
          <button className="mm-back" onClick={() => setPeer(null)} aria-label={t('Back')}>‹</button>
          <Avatar address={p} size={40} />
          <div className="tx"><b>{nm(p)}{isOfficial(p) && <Verified />}</b><small>{status}</small></div>
          <a className="mm-ib" href={`https://robin.etherscan.io/address/${p}`} target="_blank" rel="noreferrer" aria-label={t('explorer')}>↗</a>
        </div>
        {incoming && (
          <div className="mm-escrow">
            <div className="l1"><Coin k={assetOf(incoming.asset)} />{t('Paid message')}<b className="mono">{fmt(incoming.amount, assetOf(incoming.asset))}</b></div>
            <div className="bar"><i style={{ width: `${Math.max(2, Math.min(100, (Number(incoming.expiresAt - now) / TTL) * 100))}%` }} /></div>
            <small>{collect > 0n ? t('Reply within {t} to collect {v}', { t: left(Number(incoming.expiresAt - now)), v: fmt(collect, assetOf(incoming.asset)) }) : t('Reply within {t}: your rule refunds them', { t: left(Number(incoming.expiresAt - now)) })}</small>
          </div>
        )}
        {outgoing && (
          <div className="mm-escrow out">
            <div className="l1"><Coin k={assetOf(outgoing.asset)} />{t('Your payment')}<b className="mono">{fmt(outgoing.amount, assetOf(outgoing.asset))}</b></div>
            <small>{t('Waiting for their reply · back to you in {t} if they don’t answer', { t: left(Number(outgoing.expiresAt - now)) })}</small>
          </div>
        )}
        <div className="mm-msgs">
          <span className="mm-note">🔒 {t('End-to-end encrypted')}</span>
          {peerCfg && !peerCfg.registered && <span className="mm-note">{t('This wallet has not activated its Orbit inbox, so it cannot receive messages yet. Share the link so they turn it on.')}</span>}
          {thread.map((m: Msg) => {
            const pay2 = m.paymentId > 0n ? pays[m.paymentId.toString()] : undefined
            const txt = decrypt(myAddr!, peerCfg?.encKey, m.ct)
            return (
              <div key={m.id.toString()} style={{ display: 'contents' }}>
                <div className={'mm-bub' + (isMe(m.from) ? ' me' : '')}>{txt ?? t('🔒 encrypted for another browser')}<small>{hhmm(bt(m.block))}{pay2 ? ' · ' + fmt(pay2.amount, assetOf(pay2.asset)) : ''}</small></div>
                {pay2?.status === 2 && <span className="mm-sys">✓ {t('Payment settled · you are now contacts')}</span>}
                {pay2?.status === 3 && <span className="mm-sys red">↩ {t('Payment refunded')}</span>}
              </div>
            )
          })}
        </div>
        {busy && <div className="mm-busy">{busy}</div>}
        <div className="mm-composer">
          <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} disabled={!peerCfg?.registered || !!outgoing}
            placeholder={!peerCfg?.registered ? t('This wallet has no inbox') : outgoing ? t('Waiting for their reply') : incoming ? t('Reply to collect') : free ? t('Message · free') : price !== undefined ? t('Message · {v}', { v: fmt(price, payWith) }) : t('Message')} />
          <button className="mm-send" disabled={!!busy || !text.trim() || !!outgoing || !peerCfg?.registered} onClick={go} aria-label={t('Send')}>↑</button>
        </div>
        {pay && price !== undefined && (
          <>
            <div className="mm-dim" onClick={() => setPay(false)} />
            <div className="mm-sheet" role="dialog" aria-label={t('Pay to send')}>
              <span className="grab" />
              <h3>{t('Pay to send')}</h3>
              <p>{t('{name} charges to receive messages from new contacts.', { name: nm(p) })}</p>
              {accepted.length > 1 && <div className="mm-seg">{accepted.map((k) => <button key={k} className={payWith === k ? 'on' : ''} onClick={() => setPayWith(k)}><Coin k={k} />{k}</button>)}</div>}
              <div className="mm-price"><b className="mono">{fmt(price, payWith).split(' ')[0]}</b><span>{payWith}</span></div>
              <div className="mm-terms"><span>⏳ {t('Held in escrow until they reply')}</span><span>↩ {t('Back to you if no reply in 72h')}</span>{payWith === 'PONS' && <span>🔒 {t('Approves exactly this amount, nothing more')}</span>}</div>
              <button className="mm-btn" disabled={!!busy} onClick={() => { setPay(false); send() }}>{t('Pay {v} & send', { v: fmt(price, payWith) })}</button>
            </div>
          </>
        )}
      </div>
    )
  }
}

/* ---------------- inbox settings ---------------- */
function Settings({ M, close }: { M: ReturnType<typeof useMail>; close: () => void }) {
  const { t } = useT()
  const { set, setSet, saveMine, busy, mine, toast } = M
  const rules: [number, string, string][] = [[1, 'Keep it', 'You get 95%, 5% goes to Orbit'], [2, 'Split 50/50', 'Half back to them, half to you'], [0, 'Refund', 'Free for them once you reply']]
  return (
    <div className="mm">
      <div className="mm-top"><button className="mm-back" onClick={close} aria-label={t('Back')}>‹</button><h2 style={{ fontSize: 24 }}>{t('Inbox settings')}</h2></div>
      <div className="mm-set">
        <label className="mm-fld"><Coin k="PONS" /><span><small>{t('Price in PONS')}</small><input inputMode="decimal" value={set.pons} onChange={(e) => setSet({ ...set, pons: e.target.value })} placeholder={t('not accepted')} /></span></label>
        <label className="mm-fld"><Coin k="ETH" /><span><small>{t('Price in ETH')}</small><input inputMode="decimal" value={set.eth} onChange={(e) => setSet({ ...set, eth: e.target.value })} placeholder={t('not accepted')} /></span></label>
        <small className="mm-lbl">{t('When I reply')}</small>
        <div className="mm-rules">{rules.map(([v, l, d]) => <button key={v} className={'mm-rule' + (set.rule === v ? ' on' : '')} onClick={() => setSet({ ...set, rule: v })}><i /><span><b>{t(l)}</b><small>{t(d)}</small></span></button>)}</div>
        <label className="mm-tg">{t('Open inbox (free for everyone)')}<input type="checkbox" className="m-switch" checked={set.open} onChange={(e) => setSet({ ...set, open: e.target.checked })} /></label>
        <button className="mm-btn" disabled={!!busy} onClick={async () => { await saveMine(mine?.registered ? undefined : t('Your inbox is live')); }}>{busy ?? (mine?.registered ? t('Save · one transaction') : t('Activate my inbox'))}</button>
        <p className="mm-hint">{t('Your encryption key comes from a free signature of your wallet, so the same wallet reads your mail on any device.')}</p>
      </div>
      {toast && <div className={'mm-toast' + (toast.err ? ' err' : '')} role="status">{toast.t}</div>}
    </div>
  )
}
