import { useState } from 'react'
import { isAddress, getAddress, type Hex } from 'viem'
import { abi, encPublicKey, decrypt, RULES, STATUS, assetKey, type AssetKey } from '../lib/inbox'
import type { Wallet } from '../lib/wallet'
import { isOfficial } from '../lib/official'
import { Verified } from './Verified'
import { short } from '../lib/format'
import { Avatar } from './Icon'
import { AvatarDialog } from './AvatarPicker'
import { MailGuide, useMailGuide } from './MailGuide'
import ponsLogo from '../assets/pons.webp'
import { useT } from '../lib/i18n'
import { useMail, fmt, lc, type Draft } from '../lib/useMail'

export type { Draft } from '../lib/useMail'

const EXPLORER = 'https://robin.etherscan.io'
// the wallet's avatar (chosen from the Orbit collection, or its automatic animal), with the verified check
const Av = ({ a, size = 30 }: { a: string; size?: number }) => <Avatar address={a} size={size} />
const AssetIcon = ({ k }: { k: AssetKey }) => (k === 'PONS' ? <img src={ponsLogo} alt="" className="cur-ic" /> : <i className="cur-ic eth" />)

/** Paid, end-to-end encrypted wallet-to-wallet mail on Robinhood Chain (PaidInbox, pinned in contracts/mainnet.json). */
export function Mail({ draft, wallet }: { draft: Draft; wallet: Wallet }) {
  const { t: tr } = useT()
  const {
    net, myAddr, signer, meName, peer, setPeer, cfg, pays, myBal, escrow, fees, now, text, setText, payWith, setPayWith, busy, toast, say,
    loading, set, setSet, newTo, setNewTo, box, needKey, ready, mine, peers, thread, peerCfg, isMe, incoming, outgoing, free, accepted,
    price, write, run, saveMine, unlock, send, expired, label, stats,
  } = useMail(wallet, draft)
  const [picking, setPicking] = useState(false)
  const guide = useMailGuide()
  if (!ready) return (
    <div className="mail one">
      <div className="banner"><b>{tr('Mail is not available right now.')}</b><span>{tr('Please try again in a moment.')}</span></div>
    </div>
  )


  return (
    <div className="mail">
      <section className="col" aria-label={tr('Wallets and conversations')}>
        <div className="scroll">
          {myAddr ? (
            <div className="me-card">
              <button className="me-av" onClick={() => setPicking(true)} title={tr('Change avatar')} aria-label={tr('Change avatar')}><Av a={myAddr} size={38} /></button>
              <div style={{ minWidth: 0 }}>
                <b className="mono">{short(myAddr)}{isOfficial(myAddr) && <Verified />}</b>
                <div className="p">{myBal ? `${fmt(myBal.pons, 'PONS')} · ${fmt(myBal.eth, 'ETH')}` : '…'}</div>
                {!wallet.chainOk && <button className="lnk" onClick={wallet.switchChain}>{tr('Switch to Robinhood Chain')}</button>}
              </div>
            </div>
          ) : (
            <div className="me-card col1">
              <p className="mu">{tr('Connect your wallet to read and send real mail on Robinhood Chain.')}</p>
              <button className="btn pri" disabled={wallet.connecting} onClick={wallet.connect}>{wallet.connecting ? tr('Opening your wallet…') : `${tr('Connect')} ${wallet.available ? wallet.name : 'wallet'}`}</button>
              {wallet.error && <p className="err">{wallet.error}</p>}
            </div>
          )}

          {myAddr && <>
            <div className="sgroup" style={{ padding: '14px 14px 6px' }}>{tr('Conversations')}{loading && ' · ' + tr('reading the network…')}</div>
            {(
              <form className="newto" onSubmit={(e) => { e.preventDefault(); const v = newTo.trim(); if (!isAddress(v)) return say(tr('Paste a valid 0x address'), true); if (isMe(v)) return say(tr('That is your own wallet'), true); setPeer(getAddress(v)); setNewTo('') }}>
                <input value={newTo} onChange={(e) => setNewTo(e.target.value)} placeholder={tr('Write to 0x…')} aria-label={tr('Recipient address')} spellCheck={false} />
                <button className="btn sm" type="submit">{tr('Open')}</button>
              </form>
            )}
            {peers.map(([p, last]) => (
              <button key={p} className="conv" aria-current={!!peer && lc(peer) === p} onClick={() => setPeer((isMe(last.from) ? last.to : last.from) as Hex)}>
                <Av a={p} size={34} /><div style={{ minWidth: 0 }}><b className="mono">{label(p)}{isOfficial(p) && <Verified />}</b><div className="p">{decrypt(myAddr, cfg[p]?.encKey, last.ct) ?? tr('encrypted')}</div></div>
                {last.paymentId > 0n && pays[last.paymentId.toString()]?.status === 1 ? <span className="tag sun">{tr('paid')}</span> : <time />}
              </button>))}
            {peer && !peers.some(([a]) => a === lc(peer)) && (
              <button className="conv" aria-current><Av a={peer} size={34} /><div><b className="mono">{short(peer)}</b><div className="p">{tr('New conversation')}</div></div><time /></button>)}
          </>}
        </div>
      </section>

      <section className="thread" aria-label={tr('Conversation')}>
        {!myAddr ? (
          <div className="empty center"><h2>{tr('Mail on Robinhood Chain')}</h2><p>{tr('Messages are encrypted from your browser to theirs. The payment sits in escrow and comes back if they don’t reply in 72h. Connect your wallet to start.')}</p><button className="btn pri" disabled={wallet.connecting} onClick={wallet.connect}>{wallet.connecting ? tr('Opening your wallet…') : `${tr('Connect')} ${wallet.available ? wallet.name : 'wallet'}`}</button>{wallet.error && <p className="err">{wallet.error}</p>}</div>
        ) : needKey ? (
          <div className="empty center">
            <h2>{tr('Unlock your mail')}</h2>
            <p>{tr('One free signature from your wallet (not a transaction, no gas). The same wallet unlocks the same inbox on any device.')}</p>
            <button className="btn pri" disabled={!!busy} onClick={unlock}>{busy ?? tr('Unlock with my wallet')}</button>
          </div>
        ) : mine?.registered && mine.encKey.toLowerCase() !== encPublicKey(myAddr).toLowerCase() ? (
          <div className="empty center">
            <h2>{tr('Update your inbox key')}</h2>
            <p>{tr('Your inbox on the contract uses an older key. Save it again so people can write to you from now on.')}</p>
            <button className="btn pri" disabled={!!busy} onClick={() => saveMine(tr('Your inbox key is up to date'))}>{busy ?? tr('Update my key')}</button>
          </div>
        ) : !peer ? (
          <div className="empty center">
            {!mine?.registered ? <>
              <h2>{tr('Activate your inbox')}</h2>
              <p>{tr('So others can message you. You choose what you charge in PONS or ETH and what happens to the payment when you reply. It is one transaction from your wallet; set the price on the right before saving.')}</p>
              <button className="btn pri" disabled={!!busy} onClick={() => saveMine(tr('Your inbox is live'))}>{busy ?? tr('Activate my inbox')}</button>
            </> : <p>{tr('Paste an address on the left, or open a token and press “Message creator”.')}</p>}
          </div>
        ) : (
          <>
            <div className="th-h">
              <button className="m-only m-back" onClick={() => setPeer(null)} aria-label={tr('Back')}>‹</button>
              <Av a={peer} size={36} />
              <div className="n"><b className="mono">{label(peer)}{isOfficial(peer) && <Verified />}</b><div className="mono mu"><a href={`${EXPLORER}/address/${peer}`} target="_blank" rel="noreferrer">{short(peer)} ↗</a> · {!peerCfg ? tr('reading…') : !peerCfg.registered ? tr('no Orbit inbox') : peerCfg.open ? tr('open inbox') : `${tr('charges')} ${Object.entries(peerCfg.prices).map(([k, v]) => fmt(v!, k as AssetKey)).join(' / ')} · ${tr(RULES[peerCfg.rule]).toLowerCase()}`}</div></div>
              {draft && lc(peer) === lc(draft.creator) && <span className="tag blue">{tr('creator of')} ${draft.symbol}</span>}
            </div>
            <div className="msgs" ref={box}>
              {!thread.length && <div className="ev">{tr('End-to-end encrypted · the contract only stores ciphertext')}</div>}
              {peerCfg && !peerCfg.registered && <div className="ev">{tr('This wallet has not activated its Orbit inbox, so it cannot receive messages yet. Share the link so they turn it on.')}</div>}
              {thread.map((m) => {
                const p = m.paymentId > 0n ? pays[m.paymentId.toString()] : undefined, k = p ? assetKey(net, p.asset) : 'ETH'
                const txt = decrypt(myAddr, peerCfg?.encKey, m.ct)
                return (
                  <div key={m.id.toString()} style={{ display: 'contents' }}>
                    {p && <div className={'ev ' + (p.status === 1 ? 'paid' : p.status === 2 ? 'ok' : '')}><AssetIcon k={k} />{tr('Payment')} #{p.id.toString()} · {fmt(p.amount, k)} · {tr(STATUS[p.status])}{p.status === 1 && ` · ${tr('expires in {h}h', { h: Math.max(0, Number(p.expiresAt - now) / 3600).toFixed(1) })}`}</div>}
                    <div className={'bub' + (isMe(m.from) ? ' me' : '')}>{txt ?? tr('🔒 encrypted for another browser')}<small>{tr('block')} {m.block.toString()} · <a href={`${EXPLORER}/tx/${m.tx}`} target="_blank" rel="noreferrer">{m.tx.slice(0, 10)}</a></small></div>
                  </div>
                )
              })}
            </div>
            <div className="composer">
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={peerCfg?.registered ? tr('Write to {name}', { name: label(peer) }) : tr('This wallet has no inbox')} disabled={!peerCfg?.registered || !!outgoing} aria-label={tr('Message')}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send() }} />
              <div className="cb">
                {!incoming && !free && !outgoing && accepted.length > 0 && <div className="cur" role="group" aria-label={tr('Pay with')}>{accepted.map((k) => <button key={k} aria-pressed={payWith === k} onClick={() => setPayWith(k)}><AssetIcon k={k} />{k}</button>)}</div>}
                <span className="h">
                  {outgoing ? <>{tr('Waiting for a reply. Your payment of ')}<b>{fmt(outgoing.amount, assetKey(net, outgoing.asset))}</b>{tr(' comes back if no reply in 72h.')}</>
                    : incoming ? <>{tr('Replying settles payment #{id} by your rule:', { id: incoming.id.toString() })} <b>{tr(RULES[mine?.rule ?? 0]).toLowerCase()}</b>.</>
                    : free ? tr('Free: you are contacts or their inbox is open.')
                    : price !== undefined ? <>{tr('You pay ')}<b>{fmt(price, payWith)}</b>{tr(' in escrow · refunded if no reply in 72h')}</> : tr('Not accepting payments yet.')}
                </span>
                <button className="btn sm pri" disabled={!!busy || !text.trim() || !!outgoing || !peerCfg?.registered} onClick={send}>{busy ?? (incoming ? tr('Reply and settle') : free ? tr('Send') : tr('Pay and send'))}</button>
              </div>
            </div>
          </>
        )}
      </section>

      <aside className="col" aria-label={tr('Inbox and contract')}>
        <div className="scroll">
          <div className="blk"><div className="ponsbox"><div className="hd"><img src={ponsLogo} alt="" /><b>{tr('Pay and earn in PONS')}</b><span className="tag sun">{tr('new')}</span></div><p>{tr('The pons token pays for messages to creators. Each user chooses to charge in PONS, ETH or both.')}</p></div></div>
          {myAddr && <div className="blk">
            <h3 className="ml-h">{tr('Your mail')}<button className="lnk" onClick={guide.open}>{tr('How it works')}</button></h3>
            <div className="ml-me"><Av a={myAddr} size={46} /><div><b>{tr('Your avatar')}</b><button className="lnk" onClick={() => setPicking(true)}>{tr('Change avatar')}</button></div></div>
            <div className="ml-stats">
              <div><span>{tr('Earned from replies')}</span><b className="up">{fmt(stats.earned.pons, 'PONS')}</b><small>{fmt(stats.earned.eth, 'ETH')}</small></div>
              <div><span>{tr('Waiting for your reply')}</span><b style={{ color: 'var(--sun)' }}>{fmt(stats.waiting.pons, 'PONS')}</b><small>{fmt(stats.waiting.eth, 'ETH')}</small></div>
              <div><span>{tr('Received')}</span><b>{stats.received}</b></div>
              <div><span>{tr('Sent')}</span><b>{stats.sent}</b></div>
            </div>
          </div>}
          {myAddr && <div className="blk">
            <h3>{tr('My inbox · ')}{meName}</h3>
            <label className="field">{tr('Price in PONS')}<div className="inputgrp"><input value={set.pons} onChange={(e) => setSet({ ...set, pons: e.target.value })} inputMode="decimal" placeholder={tr('not accepted')} /><span><AssetIcon k="PONS" /> PONS</span></div></label>
            <label className="field">{tr('Price in ETH')}<div className="inputgrp"><input value={set.eth} onChange={(e) => setSet({ ...set, eth: e.target.value })} inputMode="decimal" placeholder={tr('not accepted')} /><span><AssetIcon k="ETH" /> ETH</span></div></label>
            <div className="field">{tr('If I reply')}<div className="seg full">{RULES.map((r, i) => <button key={r} aria-pressed={set.rule === i} onClick={() => setSet({ ...set, rule: i })}>{[tr('Refund'), tr('Keep'), '50/50'][i]}</button>)}</div></div>
            <label className="tg">{tr('Open inbox (free for everyone)')}<input type="checkbox" className="sw" checked={set.open} onChange={(e) => setSet({ ...set, open: e.target.checked })} /></label>
            <button className="btn" disabled={!!busy} onClick={() => saveMine()}>{mine?.registered ? tr('Save to contract') : tr('Activate my inbox')}</button>
            {<p className="mu sm">{tr('Your encryption key comes from a free signature of your wallet, so the same wallet reads your mail on any device.')}</p>}
          </div>}
          <div className="blk">
            <h3>PaidInbox · Robinhood Chain</h3>
            <div className="kv"><span>{tr('In escrow')}</span><b style={{ color: 'var(--sun)' }}>{fmt(escrow.pons, 'PONS')} · {fmt(escrow.eth, 'ETH')}</b></div>
            <div className="kv"><span>{tr('Treasury (5%)')}</span><b>{fmt(fees.pons, 'PONS')} · {fmt(fees.eth, 'ETH')}</b></div>
            <div className="kv"><span>{tr('Contract')}</span><b className="mono"><a href={`${EXPLORER}/address/${net.inbox}`} target="_blank" rel="noreferrer">{short(net.inbox!)} ↗</a></b></div>
            {net.treasury && <div className="kv"><span>{tr('Treasury')}</span><b className="mono">{short(net.treasury)}</b></div>}
            {signer && expired.map((p) => <button key={p.id.toString()} className="btn sm pri" disabled={!!busy} onClick={() => run(tr('Payment #{id} refunded', { id: String(p.id) }), [[tr('Refunding…'), () => write(signer, { address: net.inbox!, abi, functionName: 'refund', args: [p.id] })]])}>{tr('Refund expired payment')} #{p.id.toString()} ({fmt(p.amount, assetKey(net, p.asset))})</button>)}
          </div>
        </div>
      </aside>
      {toast && <div className={'toast' + (toast.err ? ' err' : '')} role="status">{toast.t}</div>}
      {guide.show && <MailGuide close={guide.close} />}
      {picking && myAddr && <AvatarDialog address={myAddr} wallet={wallet} close={() => setPicking(false)} />}
    </div>
  )
}
