import { useT } from '../lib/i18n'
import { dexPaidInfo, dexUrl } from '../lib/dexPaid'

/** "Dex paid" tag: the team paid for the token's DexScreener profile. Links to its DexScreener page. */
export function DexPaidTag({ token, small, link }: { token: string; small?: boolean; link?: boolean }) {
  const { t } = useT()
  const info = dexPaidInfo(token)
  if (!info?.paid) return null
  const when = info.at ? new Date(info.at).toLocaleDateString() : ''
  const title = t('Dex paid: the team paid for this token’s DexScreener profile') + (when ? ` · ${when}` : '')
  const inner = <><svg viewBox="0 0 16 16" width={small ? 10 : 12} height={small ? 10 : 12} aria-hidden="true"><path fill="currentColor" d="M9.2 1 3 9.2h4.2L6.6 15 13 6.6H8.7z" /></svg>{t('Dex paid')}</>
  const cls = 'dexpaid' + (small ? ' sm' : '')
  // inside clickable rows and cards it is a plain label (no link inside a link); on the token page it opens DexScreener
  return link
    ? <a className={cls} href={dexUrl(token)} target="_blank" rel="noreferrer" title={title}>{inner}</a>
    : <span className={cls} title={title}>{inner}</span>
}
