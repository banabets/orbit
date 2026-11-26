import { navigate } from './nav'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toHex, type Hex } from 'viem'
import { rh } from './pons'
import { mainnetInbox } from './inbox'
import { nameFor } from './names'
import { playChime } from './sound'

// Message(uint256 indexed id, address indexed from, address indexed to, uint256 paymentId, bytes ciphertext)
const T_MESSAGE = '0x2096cd4806a6f9634720b2b28d359d46b7292c895b42c68040ffdc1a016268bf'
const POLL_MS = 10_000
const pad = (a: string) => ('0x' + a.slice(2).toLowerCase().padStart(64, '0')) as Hex
const load = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const save = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

/** Shows a system notification; inside an installed app (and on iOS) it has to go through the service worker. */
async function notify(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const opts = { body, icon: '/icon-192.png', badge: '/icon-192.png', tag: 'orbit-mail', data: { url: '/mail' } } as NotificationOptions
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) return void (await reg.showNotification(title, opts))
  } catch { /* fall back below */ }
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); navigate('/mail'); n.close() } } catch { /* not allowed here */ }
}

/**
 * Watches PaidInbox for messages sent to the connected wallet while Orbit is open (any screen):
 * plays a chime, shows a notification (never the message text) and keeps an unread count.
 */
type T = (en: string, vars?: Record<string, string | number>) => string
export function useMailWatch(address: string | null, opts: { sound: boolean; notify: boolean; reading: boolean; t: T }) {
  const inbox = mainnetInbox()?.address
  const me = address?.toLowerCase() ?? null
  const unreadKey = me ? 'orbit:mail-unread:' + me : ''
  const [unread, setUnread] = useState(() => (unreadKey ? Number(load(unreadKey) ?? 0) : 0))
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => { setUnread(unreadKey ? Number(load(unreadKey) ?? 0) : 0) }, [unreadKey])
  useEffect(() => { if (unreadKey) save(unreadKey, String(unread)) }, [unread, unreadKey])
  // opening Mail reads everything
  useEffect(() => { if (opts.reading && unread) setUnread(0) }, [opts.reading, unread])
  // the installed app's icon shows the count too (where the platform supports it)
  useEffect(() => {
    const n = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    try { if (unread) void n.setAppBadge?.(unread); else void n.clearAppBadge?.() } catch { /* unsupported */ }
  }, [unread])

  useEffect(() => {
    if (!me || !inbox) return
    const lastKey = 'orbit:mail-last:' + me
    let dead = false, busy = false
    const tick = async () => {
      if (busy || dead) return
      busy = true
      try {
        const head = await rh.getBlockNumber()
        const stored = load(lastKey)
        // first time for this wallet: start from now, so old messages don't ring
        if (!stored) { save(lastKey, head.toString()); return }
        const from = BigInt(stored) + 1n
        if (from > head) return
        const logs = (await rh.request({ method: 'eth_getLogs', params: [{ address: inbox, fromBlock: toHex(from), toBlock: toHex(head), topics: [T_MESSAGE, null, null, pad(me)] }] } as never)) as { topics: Hex[]; data: Hex }[]
        save(lastKey, head.toString())
        const fresh = logs.filter((l) => ('0x' + l.topics[2].slice(26)).toLowerCase() !== me)
        if (!fresh.length || dead) return
        const o = optsRef.current
        if (!o.reading) setUnread((n) => n + fresh.length)
        if (o.sound) playChime()
        if (o.notify && !o.reading) {
          const last = fresh[fresh.length - 1]
          const from2 = '0x' + last.topics[2].slice(26)
          const paid = BigInt('0x' + last.data.slice(2, 66)) > 0n
          const who = nameFor(from2)
          const t = o.t
          await notify(fresh.length > 1 ? t('{n} new messages', { n: fresh.length }) : paid ? t('New paid message from {name}', { name: who }) : t('New message from {name}', { name: who }), t('Open Orbit Mail to read it'))
        }
      } catch { /* lagging node or offline: the next tick asks again from the same block */ } finally { busy = false }
    }
    tick()
    const id = setInterval(tick, POLL_MS)
    return () => { dead = true; clearInterval(id) }
  }, [me, inbox])

  const markRead = useCallback(() => setUnread(0), [])
  return { unread, markRead }
}
