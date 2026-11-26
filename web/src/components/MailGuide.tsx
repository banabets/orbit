import { useEffect, useState } from 'react'
import { useT } from '../lib/i18n'
import { GIcon, type Concept } from './Icon'
import '../mail-guide.css'

const KEY = 'orbit:mail-guide-seen'
/** true until the guide has been closed once on this device */
export function useMailGuide() {
  const [show, setShow] = useState(() => { try { return !localStorage.getItem(KEY) } catch { return false } })
  const close = () => { try { localStorage.setItem(KEY, '1') } catch { /* private mode */ } setShow(false) }
  return { show, open: () => setShow(true), close }
}

/** First visit to Mail: four short steps in the app's language. Desktop dialog, phone bottom sheet. */
export function MailGuide({ close, phone }: { close: () => void; phone?: boolean }) {
  const { t } = useT()
  const [i, setI] = useState(0)
  const steps: { icon: Concept; tone: string; title: string; text: string }[] = [
    { icon: 'mail', tone: 'v', title: t('Mail between wallets'), text: t('Write to any wallet on Robinhood Chain, like a token’s creator. Messages are encrypted in your browser: only you and the other wallet can read them.') },
    { icon: 'wallet', tone: 'b', title: t('Unlock your mail'), text: t('The first time, your wallet asks for one free signature (no gas). It creates your key, and the same wallet opens the same inbox on any device.') },
    { icon: 'coins', tone: 'y', title: t('Pay to reach, get paid to answer'), text: t('Some wallets charge to be written to, in PONS or ETH. Your payment waits in the contract. You can set your own price too.') },
    { icon: 'rewards', tone: 'g', title: t('Reply in 72 hours or get it all back'), text: t('If they reply within 72 hours, the payment is settled by their rule, minus 5%. If they don’t, you take back 100%. After a reply you are contacts and write for free.') },
  ]
  const s = steps[i], last = i === steps.length - 1
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') setI((n) => Math.min(steps.length - 1, n + 1)); if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1)) }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [close, steps.length])
  return (
    <div className={'mg-wrap' + (phone ? ' phone' : '')} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="mg" role="dialog" aria-modal="true" aria-label={t('How Mail works')}>
        <div className="mg-top"><span className="mg-step mono">{i + 1} / {steps.length}</span><button className="mg-skip" onClick={close}>{t('Skip')}</button></div>
        <span className={'mg-ic ' + s.tone}><GIcon name={s.icon} size={34} /></span>
        <h3>{s.title}</h3>
        <p>{s.text}</p>
        <div className="mg-dots" aria-hidden="true">{steps.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        <div className="mg-btns">
          {i > 0 && <button className="mg-back" onClick={() => setI(i - 1)}>{t('Back')}</button>}
          <button className="mg-next" onClick={() => (last ? close() : setI(i + 1))}>{last ? t('Start using Mail') : t('Next')}</button>
        </div>
        {last && <p className="mg-note">{t('Mail is new and its contract has not been audited yet. Start with small amounts.')}</p>}
      </div>
    </div>
  )
}
