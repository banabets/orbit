/** Orbit's official X account. Empty until it exists: put the handle here (without @) and the X links show up again. */
export const X_USER: string = 'Orbitpons'
export const X_URL = X_USER ? `https://x.com/${X_USER}` : ''
export const X_HANDLE = X_USER ? `@${X_USER}` : ''

/** The X (Twitter) mark, drawn in the current text color. */
export function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}
