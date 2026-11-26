import { useState } from 'react'
import type { Hex } from 'viem'
import type { Wallet } from '../lib/wallet'
import { useT } from '../lib/i18n'
import { isOfficial } from '../lib/official'
import { pseudonymParts } from '../lib/names'
import { AVATAR_NOUNS, AVATAR_HUES, saveAvatar, useAvatarChoice } from '../lib/avatars'
import { GI_BODY, GI_ANIMAL } from '../lib/gameIcons'
import { Verified } from './Verified'
import '../avatar-picker.css'

/** One avatar from the Orbit collection, drawn at any size (for the picker and its preview). */
export function AvatarFace({ noun, hue, size }: { noun: string; hue: number; size: number }) {
  return (
    <span className="ap-face" style={{ width: size, height: size, background: `radial-gradient(circle at 32% 26%, hsl(${hue} 45% 36%), hsl(${hue} 35% 14%))` }}>
      <svg width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} viewBox="0 0 512 512" style={{ color: `hsl(${hue} 75% 84%)` }} dangerouslySetInnerHTML={{ __html: GI_BODY[GI_ANIMAL[noun] ?? 'sparrow'] }} />
    </span>
  )
}

/**
 * Pick an animal and a colour from the Orbit collection (no uploads). Saving asks the wallet for a free
 * signature that the server checks, so only the owner can change a wallet's avatar. Used on phone and desktop.
 */
export function AvatarPicker({ address, wallet, onSaved }: { address: Hex; wallet: Wallet; onSaved?: () => void }) {
  const { t } = useT()
  const current = useAvatarChoice(address)
  const auto = pseudonymParts(address)[2]
  const [n, setN] = useState<string>(current?.n ?? ((AVATAR_NOUNS as readonly string[]).includes(auto) ? auto : 'fox'))
  const [c, setC] = useState<number>(current?.c ?? 1)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true); setMsg(null)
    try { await saveAvatar(address, { n, c }, (m) => wallet.signText(m)); setMsg({ ok: true, text: t('Saved. Everyone on Orbit sees your new avatar.') }); onSaved?.() }
    catch (e) { const m = e as { code?: number; message?: string }; setMsg({ ok: false, text: m.code === 4001 ? t('You cancelled the signature in your wallet') : m.message === 'avatars are not enabled yet' ? t('Avatars are being switched on. Try again soon.') : (m.message || t('Could not save your avatar')) }) }
    finally { setBusy(false) }
  }
  return (
    <div className="ap">
      <div className="ap-prev"><AvatarFace noun={n} hue={AVATAR_HUES[c]} size={96} />{isOfficial(address) && <span className="chk"><Verified size={30} /></span>}</div>
      <div className="ap-colors">{AVATAR_HUES.map((h, i) => <button key={h} type="button" className={c === i ? 'on' : ''} style={{ background: `hsl(${h} 55% 45%)` }} onClick={() => setC(i)} aria-label={t('Colour {n}', { n: i + 1 })} aria-pressed={c === i} />)}</div>
      <div className="ap-grid">{AVATAR_NOUNS.map((x) => <button key={x} type="button" className={n === x ? 'on' : ''} onClick={() => setN(x)} aria-label={x} aria-pressed={n === x}><AvatarFace noun={x} hue={AVATAR_HUES[c]} size={54} /></button>)}</div>
      <p className="ap-hint">{t('Pick an animal and a colour from the Orbit collection. Everyone sees it in Mail, trades and rankings. No photo uploads.')}</p>
      {msg && <p className={msg.ok ? 'ap-ok' : 'ap-err'}>{msg.text}</p>}
      <button type="button" className="ap-save" disabled={busy} onClick={save}>{busy ? t('Sign in your wallet (free, no gas)…') : t('Save · free signature')}</button>
    </div>
  )
}

/** Desktop: the picker in a centred dialog. */
export function AvatarDialog({ address, wallet, close }: { address: Hex; wallet: Wallet; close: () => void }) {
  const { t } = useT()
  return (
    <div className="ap-modal" role="dialog" aria-modal="true" aria-label={t('Your avatar')} onClick={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="ap-box">
        <div className="ap-head"><b>{t('Your avatar')}</b><button type="button" onClick={close} aria-label={t('Close')}>✕</button></div>
        <AvatarPicker address={address} wallet={wallet} />
      </div>
    </div>
  )
}
