import { useEffect, useState } from 'react'
import { logoCandidates } from '../lib/pons'
import { isOfficialToken } from '../lib/official'
import { Verified } from './Verified'

/** Deterministic gradient fallback when a token has no logo or none of its URLs load. */
export function gradient(seed: string) {
  let h = 2166136261
  for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  const a = Math.abs(h) % 360
  const b = (a + 40 + (Math.abs(h >> 8) % 80)) % 360
  return `linear-gradient(135deg, hsl(${a} 70% 58%), hsl(${b} 70% 38%))`
}

/** dark tinted disc for the monogram fallback */
function monoBg(seed: string) {
  let h = 2166136261
  for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  const a = Math.abs(h) % 360
  return `radial-gradient(circle at 30% 25%, hsl(${a} 30% 26%), hsl(${a} 24% 11%))`
}

// remember which candidate worked (also across visits), so re-renders, other rows and the next visit go straight to it
const GOOD_KEY = 'orbit:logos:v1'
const good: Map<string, string> = (() => { try { return new Map(Object.entries(JSON.parse(localStorage.getItem(GOOD_KEY) || '{}') as Record<string, string>)) } catch { return new Map() } })()
let saveId = 0
const saveGood = () => { clearTimeout(saveId); saveId = window.setTimeout(() => { try { localStorage.setItem(GOOD_KEY, JSON.stringify(Object.fromEntries([...good].slice(-1500)))) } catch { /* full or blocked */ } }, 2000) }
const dead = new Set<string>()
// a URL gets a second chance before it is given up: on a busy phone connection images often fail once and then load fine
const failedOnce = new Set<string>()
// phones load logos right away: lazy loading inside the app's scroll areas is unreliable on some mobile browsers
const EAGER = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px)').matches

/**
 * Token logo. The official Orbit coin always carries the blue check on its logo, so it is marked on every screen
 * (feeds, search, watchlist, leaderboard, portfolio…) without each list having to remember it.
 */
export function TokenImg(props: { src?: string; seed: string; className: string; label?: string }) {
  if (!isOfficialToken(props.seed)) return <Logo {...props} />
  return <span className={'tokimg-off' + (props.className.includes('fill') ? ' fill' : '')}><Logo {...props} /><span className="tokimg-chk"><Verified size={14} coin /></span></span>
}

/** Logo with pons' image service first; when every source is dead (blocked hotlinks, 404s), a monogram of the ticker. */
function Logo({ src, seed, className, label }: { src?: string; seed: string; className: string; label?: string }) {
  const list = logoCandidates(src).filter((u) => !dead.has(u))
  const known = src ? good.get(src) : undefined
  // `dead` shrinks `list`, so the first remaining candidate is always next; the counter forces a re-render or a retry
  const [tick, setTick] = useState(0)
  useEffect(() => setTick(0), [src])
  const url = known && !dead.has(known) ? known : list[0]
  if (!url) {
    const txt = (label || '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()
    return <span className={'img mono-logo ' + className} style={{ background: monoBg(seed) }} aria-hidden="true">{txt || '•'}</span>
  }
  return (
    <img key={url + ':' + tick} className={'img ' + className} src={url} alt="" loading={EAGER ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer"
      onLoad={() => { if (src && good.get(src) !== url) { good.set(src, url); saveGood() } }}
      onError={() => {
        if (!failedOnce.has(url)) { failedOnce.add(url); setTimeout(() => setTick((n) => n + 1), 1500); return }
        dead.add(url); if (src && good.get(src) === url) { good.delete(src); saveGood() } setTick((n) => n + 1)
      }} />
  )
}
