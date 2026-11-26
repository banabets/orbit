// Creator earnings exactly as pons shows them, and whether they were claimed.
// v2 launches: pons' creator-earnings total (it includes the pool fees after graduation, which the curve's
// trades don't show). v1: the sum of its payouts. Launches whose fees go to holders show "Community earned".
// Claimed: for v2 with fees to the creator, pons' balances service says if that wallet claimed since launch.
import { useEffect, useState } from 'react'

export type CreatorFees = {
  /** total in the pair currency */
  quote: number
  /** USD, when pons has a price for the pair */
  usd: number | null
  symbol: string
  community: boolean
  claimed: boolean
}

type Launch = {
  protocol?: string; deployedBlock?: number | null; quoteUsd?: number
  quote?: { symbol?: string; isNative?: boolean; address?: string; assetClass?: string }
  fees?: { recipient?: string; creatorRecipient?: string | null; distributedQuote?: number }
}

const cache = new Map<string, { at: number; v: CreatorFees | null }>()
const json = async <T,>(u: string): Promise<T | null> => { try { const r = await fetch(u, { headers: { accept: 'application/json' } }); return r.ok ? ((await r.json()) as T) : null } catch { return null } }

export async function loadCreatorFees(token: string): Promise<CreatorFees | null> {
  const key = token.toLowerCase(), hit = cache.get(key)
  if (hit && Date.now() - hit.at < (hit.v?.claimed ? 30 * 60_000 : 60_000)) return hit.v
  const l = await json<Launch>(`/pons-api/launches/${key}`)
  if (!l?.fees) return null
  const community = l.fees.recipient === 'holders'
  let quote: number | null = null
  if (community) quote = l.fees.distributedQuote ?? null
  else if (l.protocol === 'v1') { const p = await json<{ quoteAmount: number }[]>(`/pons-api/launches/${key}?view=payouts`); quote = p?.length ? p.reduce((s, x) => s + (x.quoteAmount || 0), 0) : null }
  else quote = (await json<{ quote?: number }>(`/pons-api/launches/${key}?view=creator-earnings`))?.quote ?? null
  if (quote === null) { cache.set(key, { at: Date.now(), v: null }); return null }
  let claimed = false
  if (!community && l.protocol === 'v2' && l.fees.creatorRecipient && l.deployedBlock != null) {
    const tok = l.quote?.isNative ? 'native' : l.quote?.address ?? ''
    const q = new URLSearchParams({ recipient: l.fees.creatorRecipient, token: tok, from_block: String(l.deployedBlock) })
    claimed = !!(await json<{ claimed?: boolean }>(`/pons-claimed?${q}`))?.claimed
  } else if (!community) {
    claimed = !!(await json<{ claimed?: boolean }>(`/pons-api/launches/${key}?view=claim-status`))?.claimed
  }
  const usd = l.quoteUsd && l.quote?.assetClass !== 'stablecoin' ? quote * l.quoteUsd : l.quote?.assetClass === 'stablecoin' ? quote : null
  const v: CreatorFees = { quote, usd, symbol: l.quote?.symbol ?? '', community, claimed: community || claimed }
  cache.set(key, { at: Date.now(), v })
  return v
}

/** null while loading or when pons has no number (the caller keeps its own estimate) */
export function useCreatorFees(token: string | undefined): CreatorFees | null {
  const [v, setV] = useState<CreatorFees | null>(null)
  useEffect(() => {
    if (!token) return
    let dead = false
    setV(null)
    const load = () => loadCreatorFees(token).then((x) => { if (!dead) setV(x) })
    load()
    const id = setInterval(load, 60_000)
    return () => { dead = true; clearInterval(id) }
  }, [token])
  return v
}
