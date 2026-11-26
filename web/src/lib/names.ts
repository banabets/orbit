import { isOfficial, OFFICIAL_NAME } from './official'
import { useEffect, useState } from 'react'

/*
 * Names exactly as ponsfamily.com shows them.
 * 1. If the wallet set up a pons profile, its displayName comes from pons' identities API.
 * 2. Otherwise pons derives a pseudonym from the address (three words: adjective + color + noun).
 *    This is our own implementation of that scheme, so both sites show the same name for the same wallet.
 */
const ADJ = ['arctic','autumn','bold','brave','bright','brisk','calm','candid','civil','clear','clever','cool','cosmic','crisp','daring','dawn','deft','dusk','eager','early','easy','even','exact','fair','faint','fast','fine','fleet','fluent','fond','frank','free','fresh','gentle','glad','grand','hardy','hidden','high','honest','humble','idle','inner','jolly','keen','kind','late','light','lively','local','lofty','loyal','lucid','lucky','lunar','major','mellow','merry','mild','minor','misty','modern','modest','mystic','native','neat','nimble','noble','north','novel','open','outer','plain','polar','prime','proud','pure','quick','quiet','rapid','rare','ready','regal','royal','rustic','sacred','sage','secret','serene','sharp','shy','silent','simple','sleek','slow','smart','smooth','snug','sober','soft','solar','solid','south','spare','spry','stark','steady','still','stout','subtle','sunny','super','sure','swift','tall','tame','tender','tidy','tiny','true','upper','urban','vast','vivid','warm','wary','west','wild','wise','witty','young','zesty']
const COLOR = ['amber','ash','azure','basalt','beige','berry','birch','blue','brass','bronze','cedar','chalk','cherry','chrome','cinder','citron','clay','cloud','coal','cobalt','copper','coral','cream','dune','ebony','ember','fern','flint','fog','frost','garnet','ginger','glass','gold','gray','green','hazel','honey','indigo','iron','ivory','jade','jet','lava','lemon','lilac','lime','linen','maple','marble','maroon','mauve','mint','moss','navy','neon','nickel','oak','ochre','olive','onyx','opal','orange','orchid','pearl','pewter','pine','pink','plum','quartz','rose','ruby','rust','salt','sand','sepia','shale','sienna','silver','slate','smoke','snow','steel','stone','storm','sugar','teal','tin','topaz','umber','velvet','violet','walnut','wheat','white','zinc']
const NOUN = ['anchor','antler','arrow','aspen','atlas','badger','beacon','bear','beaver','bell','bison','bobcat','brook','buffalo','canyon','caribou','cliff','comet','compass','condor','coyote','crane','creek','cricket','crow','current','dolphin','dove','eagle','egret','elk','falcon','ferret','finch','fjord','flame','fox','gazelle','glacier','gull','harbor','hare','hawk','heron','hill','horizon','ibis','island','jaguar','jay','kestrel','kite','lantern','lark','lemur','leopard','lion','lynx','magpie','manta','marlin','marmot','meadow','meridian','moose','moth','narwhal','newt','ocelot','orca','oriole','osprey','otter','owl','panda','panther','parrot','pelican','penguin','pike','plover','prairie','puffin','puma','quail','rabbit','raccoon','raven','reef','ridge','river','robin','salmon','seal','shark','sparrow','spruce','starling','stork','summit','swan','tapir','tern','thrush','tide','tiger','toucan','trail','trout','tundra','turtle','valley','viper','walrus','wave','weasel','whale','wolf','wren','yak','zebra']

const mix = (x: number) => {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d)
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
  return (x ^ (x >>> 16)) >>> 0
}
/** FNV-1a 32-bit */
const fnv = (s: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}
const cap = (w: string) => w[0].toUpperCase() + w.slice(1)
/** The three words of the pseudonym: adjective, color, noun (the noun picks the avatar animal). */
export function pseudonymParts(address: string): [string, string, string] {
  const a = fnv(address.trim().toLowerCase()), b = mix(a), c = mix(b)
  return [ADJ[a % ADJ.length], COLOR[b % COLOR.length], NOUN[c % NOUN.length]]
}
/** Pseudonym pons derives from an address, e.g. SlowNeonThrush */
export function pseudonym(address: string): string {
  const a = fnv(address.trim().toLowerCase()), b = mix(a), c = mix(b)
  return cap(ADJ[a % ADJ.length]) + cap(COLOR[b % COLOR.length]) + cap(NOUN[c % NOUN.length])
}

type Identity = { username?: string; displayName?: string; avatarUrl?: string | null } | null
const known = new Map<string, Identity>()
const pending = new Set<string>()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null

/** pons' API has no CORS headers, so the browser goes through our same-origin proxy (vite.config: /pons-api). */
async function flush() {
  timer = null
  const batch = [...pending].slice(0, 60)
  batch.forEach((a) => pending.delete(a))
  if (!batch.length) return
  try {
    const r = await fetch(`/pons-api/identities?addresses=${batch.join(',')}`)
    if (r.ok) {
      const j = (await r.json()) as { identities: Record<string, Identity> }
      for (const a of batch) known.set(a, j.identities?.[a] ?? null)
    } else batch.forEach((a) => known.set(a, null))
  } catch { batch.forEach((a) => known.set(a, null)) }
  listeners.forEach((f) => f())
  if (pending.size) timer = setTimeout(flush, 50)
}
function want(addrs: string[]) {
  let added = false
  for (const x of addrs) { const a = x.toLowerCase(); if (!known.has(a) && !pending.has(a)) { pending.add(a); added = true } }
  if (added && !timer) timer = setTimeout(flush, 120)
}

/** Display name for an address: pons profile name if it has one, else the pons pseudonym. */
export function nameFor(address: string): string {
  if (isOfficial(address)) return OFFICIAL_NAME
  const id = known.get(address.toLowerCase())
  const name = id?.displayName || id?.username
  // a pons profile name that poses as Orbit or as staff falls back to the automatic name (anti-impersonation)
  if (name && IMPERSONATION.test(name.replace(/[^a-z0-9]/gi, ''))) return pseudonym(address)
  return name || pseudonym(address)
}
const IMPERSONATION = /orbit|support|admin|official|moderator|helpdesk|ponsteam|teampons/i
/** true when the wallet created a pons profile (not just the derived pseudonym) */
export const hasProfile = (address: string) => !!known.get(address.toLowerCase())

/** Re-renders when names for these addresses arrive from pons. */
export function useNames(addrs: string[]) {
  const [, bump] = useState(0)
  const key = addrs.join()
  useEffect(() => {
    const f = () => bump((n) => n + 1)
    listeners.add(f)
    want(addrs)
    return () => { listeners.delete(f) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return nameFor
}
