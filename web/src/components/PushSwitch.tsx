import { usePush } from '../lib/push'
import type { Wallet } from '../lib/wallet'
import { useT } from '../lib/i18n'
import { GIcon } from './Icon'

/** "Notify me with Orbit closed": one row for the Alerts pages (desktop `.al-rule`, phone `.m-rule`).
 *  Pass `push` when the page already shows its state elsewhere, so both stay in step. */
export function PushSwitch({ wallet, phone, push: given }: { wallet: Wallet; phone?: boolean; push?: ReturnType<typeof usePush> }) {
  const { t } = useT()
  const own = usePush(given ? null : wallet.address, (m) => wallet.signText(m))
  const { state, error, enable, disable } = given ?? own
  const hint = !wallet.address ? t('Connect your wallet to turn this on')
    : state === 'install' ? t('On iPhone: tap Share → “Add to Home Screen”, open Orbit from there and turn this on')
    : state === 'unsupported' ? t('This browser cannot receive notifications with the app closed')
    : state === 'blocked' ? t('You blocked notifications for this site. Turn them on in the browser settings.')
    : state === 'on' ? t('On for this device. The ping never includes who wrote or what.')
    : t('A ping on this device when someone writes to your wallet, even with Orbit closed. One free signature.')
  const can = !!wallet.address && (state === 'off' || state === 'on')
  const btn = state === 'busy' ? t('Sign in your wallet…') : state === 'on' ? t('Turn off') : t('Turn on')
  const button = wallet.address && state !== 'install' && state !== 'unsupported' && state !== 'blocked'
    ? <button className={state === 'on' ? 'btn sm' : 'btn sm pri'} disabled={!can} onClick={() => (state === 'on' ? disable() : enable())} style={{ flex: 'none' }}>{btn}</button>
    : null
  const text = <><b>{t('With Orbit closed')}</b><small>{hint}{error && error !== 'cancelled' && <span className="dn"> · {error}</span>}</small></>
  if (phone) return <div className="m-rule"><span className="ic"><GIcon name="alerts" size={22} /></span><span className="tx">{text}</span>{button}</div>
  return <div className="al-rule"><span className="tx">{text}</span>{button}</div>
}
