import { useId } from 'react'

/**
 * Orbit mark: a heavy O with a blue satellite cutting through it. The satellite and the gap it opens in the ring
 * move together, so hovering the logo can send it once around the orbit (see .orbit-sat in index.css).
 */
export function OrbitMark({ size = 26 }: { size?: number }) {
  const id = 'om' + useId().replace(/:/g, '')
  return (
    <svg className="orbit-mark" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Orbit">
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
          <rect width="120" height="120" fill="#fff" />
          <circle className="orbit-sat" cx="87.6" cy="36.9" r="19" fill="#000" />
        </mask>
      </defs>
      <circle cx="60" cy="60" r="36" fill="none" stroke="currentColor" strokeWidth="16" mask={`url(#${id})`} />
      <circle className="orbit-sat" cx="87.6" cy="36.9" r="11.5" fill="#1D9BF0" />
    </svg>
  )
}
