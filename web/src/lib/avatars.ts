import { useSyncExternalStore } from 'react'

/**
 * Orbit avatars: an animal and a colour from the Orbit collection, chosen by each wallet with a free signature
 * and stored by web/api/avatars.js. No uploads. Wallets that never chose keep their automatic animal.
 */
export const AVATAR_NOUNS = ['bear', 'fox', 'owl', 'eagle', 'dolphin', 'wolf', 'tiger', 'crane', 'raven', 'lion', 'shark', 'falcon', 'bison', 'panda', 'whale'] as const // must match web/api/avatars.js
export const AVATAR_HUES = [150, 28, 200, 260, 0, 320] // green, orange, blue, violet, red, pink
export type AvatarChoice = { n: string; c: number }

const cache = new Map<string, AvatarChoice | null>()
const pending = new Set<string>()
const listeners = new Set<() => void>()
let version = 0
let timer = 0
const emit = () => { version++; listeners.forEach((f) => f()) }

async function flush() {
  timer = 0
  const batch = [...pending].slice(0, 60)
  batch.forEach((a) => pending.delete(a))
  if (!batch.length) return
  try {
    const r = await fetch('/api/avatars?a=' + batch.join(','))
    const j = r.ok ? ((await r.json()) as Record<string, AvatarChoice>) : {}
    for (const a of batch) cache.set(a, j[a] ?? null)
  } catch { for (const a of batch) cache.set(a, null) }
  emit()
  if (pending.size) timer = window.setTimeout(flush, 50)
}
function want(address: string) {
  const a = address.toLowerCase()
  if (cache.has(a) || pending.has(a)) return
  pending.add(a)
  if (!timer) timer = window.setTimeout(flush, 120)
}

/** The avatar a wallet chose, or null (automatic). Fetched in batches and shared by every component. */
export function useAvatarChoice(address?: string | null): AvatarChoice | null {
  useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f) }, () => version)
  if (!address) return null
  want(address)
  return cache.get(address.toLowerCase()) ?? null
}

export const avatarMessage = (address: string, n: string, c: number, ts: number) => `Orbit avatar\nAddress: ${address.toLowerCase()}\nAvatar: ${n}-${c}\nTime: ${ts}`

/** Saves a choice: the wallet signs a short text (free, no gas) and the server checks that signature. */
export async function saveAvatar(address: string, choice: AvatarChoice, sign: (message: string) => Promise<string>) {
  const ts = Date.now()
  const sig = await sign(avatarMessage(address, choice.n, choice.c, ts))
  const r = await fetch('/api/avatars', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, n: choice.n, c: choice.c, ts, sig }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Could not save your avatar')
  cache.set(address.toLowerCase(), { n: choice.n, c: choice.c })
  emit()
}
