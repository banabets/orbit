import { useT } from '../lib/i18n'

/** green check next to creator earnings once pons says they were claimed (or paid out to holders) */
export function ClaimedBadge({ community }: { community?: boolean }) {
  const { t } = useT()
  const tip = community ? t('Paid out. These fees went to the holders.') : t('Claimed. The creator has claimed these fees.')
  return (
    <span className="claimed" title={tip} aria-label={tip} role="img">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="#3BE38F" /><path d="M4.6 8.3l2.2 2.2 4.6-4.8" fill="none" stroke="#04140b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span>{t('Claimed')}</span>
    </span>
  )
}
