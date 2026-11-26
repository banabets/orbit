// Mail pings with Orbit closed (Web Push). See web/api/push.js: the push carries no data, only "you have mail".
import { useCallback, useEffect, useState } from 'react'

const msg = (address: string, ts: number) => `Orbit notifications\nAddress: ${address.toLowerCase()}\nTime: ${ts}` // = api/push.js subMessage
const mark = (a: string) => 'orbit:push:' + a.toLowerCase()

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const installed = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export type PushState = 'unsupported' | 'install' | 'blocked' | 'off' | 'on' | 'busy'

function u8(b64u: string) {
  const s = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

async function current() {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

/** state + on/off for one wallet on this device */
export function usePush(address: string | null | undefined, signText: (m: string) => Promise<string>) {
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const [state, setState] = useState<PushState>('off')
  const [error, setError] = useState('')

  const check = useCallback(async () => {
    if (!supported) return setState(isIOS() && !installed() ? 'install' : 'unsupported')
    if (Notification.permission === 'denied') return setState('blocked')
    if (!address) return setState('off')
    const sub = await current().catch(() => null)
    let saved = ''
    try { saved = localStorage.getItem(mark(address)) || '' } catch { /* private mode */ }
    setState(sub && saved === sub.endpoint ? 'on' : 'off')
  }, [supported, address])
  useEffect(() => { void check() }, [check])

  const enable = useCallback(async () => {
    if (!address) return
    setError(''); setState('busy')
    try {
      if ((await Notification.requestPermission()) !== 'granted') return void (await check())
      const reg = await navigator.serviceWorker.ready
      const kr = await fetch('/api/push')
      if (!kr.ok) throw new Error((await kr.json().catch(() => ({}))).error || 'notifications are unavailable right now')
      const { key } = await kr.json()
      let sub = await reg.pushManager.getSubscription()
      if (sub && sub.options.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== key) { await sub.unsubscribe(); sub = null }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(key) })
      const ts = Date.now()
      const sig = await signText(msg(address, ts)) // free, no gas: proves this device belongs to the wallet
      const r = await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'sub', address, endpoint: sub.endpoint, ts, sig }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'could not turn notifications on')
      try { localStorage.setItem(mark(address), sub.endpoint) } catch { /* private mode */ }
      setState('on')
    } catch (e) {
      const m = e as { code?: number; message?: string }
      setError(m.code === 4001 || /rejected|denied/i.test(m.message || '') ? 'cancelled' : m.message || 'error')
      await check()
    }
  }, [address, signText, check])

  const disable = useCallback(async () => {
    if (!address) return
    setState('busy')
    const sub = await current().catch(() => null)
    if (sub) await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'unsub', address, endpoint: sub.endpoint }) }).catch(() => {})
    try { localStorage.removeItem(mark(address)) } catch { /* private mode */ }
    setState('off')
  }, [address])

  return { state, error, enable, disable }
}

/** after a Mail transaction confirms: the server reads it from the chain and pings the recipient. Fire and forget. */
export function pingPush(tx: string) {
  fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'notify', tx }), keepalive: true }).catch(() => {})
}
