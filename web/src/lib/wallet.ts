import { useCallback, useEffect, useMemo, useState } from 'react'
import { createWalletClient, custom, stringToHex, type Hex, type WalletClient } from 'viem'
import { robinhood } from './pons'

/** EIP-1193 provider injected by MetaMask, Rabby, Coinbase Wallet, etc. */
type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (e: string, f: (...a: unknown[]) => void) => void
  removeListener?: (e: string, f: (...a: unknown[]) => void) => void
}
type Announced = { info: { uuid: string; name: string; icon: string; rdns: string }; provider: Eip1193 }

const CHAIN_HEX = '0x' + robinhood.id.toString(16)
const ADD_CHAIN = {
  chainId: CHAIN_HEX,
  chainName: robinhood.name,
  nativeCurrency: robinhood.nativeCurrency,
  rpcUrls: robinhood.rpcUrls.default.http,
  blockExplorerUrls: [robinhood.blockExplorers!.default.url],
}

// EIP-6963: every installed wallet announces itself; fall back to window.ethereum.
const found = new Map<string, Announced>()
if (typeof window !== 'undefined') {
  addEventListener('eip6963:announceProvider', (e) => { const d = (e as CustomEvent<Announced>).detail; found.set(d.info.uuid, d) })
  dispatchEvent(new Event('eip6963:requestProvider'))
}
function pick(): { name: string; provider: Eip1193 } | null {
  const list = [...found.values()]
  const mm = list.find((x) => x.info.rdns === 'io.metamask') ?? list[0]
  if (mm) return { name: mm.info.name, provider: mm.provider }
  const eth = (window as unknown as { ethereum?: Eip1193 & { isMetaMask?: boolean; isTrust?: boolean; isTrustWallet?: boolean; isCoinbaseWallet?: boolean; isRabby?: boolean; isOkxWallet?: boolean; isBitKeep?: boolean } }).ethereum
  if (!eth) return null
  const name = eth.isTrust || eth.isTrustWallet ? 'Trust Wallet' : eth.isCoinbaseWallet ? 'Coinbase Wallet' : eth.isRabby ? 'Rabby' : eth.isOkxWallet ? 'OKX Wallet' : eth.isBitKeep ? 'Bitget Wallet' : eth.isMetaMask ? 'MetaMask' : 'Wallet'
  return { name, provider: eth }
}

export type Wallet = {
  available: boolean
  name: string
  address: Hex | null
  chainOk: boolean
  client: WalletClient | null
  connecting: boolean
  error: string | null
  connect: () => Promise<void>
  /** stop waiting for a wallet popup the user closed */
  cancel: () => void
  /** right before signing: ask the wallet which account it authorizes now, and return a client for exactly that account */
  /** sign a plain text message (free, no gas), compatible with desktop and mobile wallets */
  signText: (message: string) => Promise<Hex>
  authorize: () => Promise<WalletClient>
  disconnect: () => void
  switchChain: () => Promise<void>
}

const WAIT = 45_000
/** -32602: the wallet did not accept the shape of the request */
export const badParams = (e: unknown) => { const m = e as { code?: number; message?: string; cause?: { code?: number } }; return m.code === -32602 || m.cause?.code === -32602 || /invalid param/i.test(m.message ?? '') }

/**
 * Signs a text message with personal_sign. Wallets disagree on the exact parameters (hex or plain text,
 * message first or address first), so the other accepted forms are tried when one is refused.
 * Every form signs the same bytes, so the signature is the same whichever one the wallet takes.
 */
async function signText(p: Eip1193, address: Hex, message: string): Promise<Hex> {
  const tries: unknown[][] = [[stringToHex(message), address], [address, stringToHex(message)], [message, address]]
  let last: unknown
  for (const params of tries) {
    try { return (await p.request({ method: 'personal_sign', params })) as Hex }
    catch (e) { last = e; if (!badParams(e)) throw e }
  }
  throw last
}
function walletError(e: unknown) {
  const m = e as { code?: number; message?: string }
  if (m.code === 4001) return 'You cancelled the request in your wallet.'
  if (m.code === 4100) return 'MetaMask has not authorized this account for Orbit. Open MetaMask, pick the account you want and connect it to this site, then try again.'
  if (badParams(e)) return 'Your wallet did not accept this request. Update your wallet app, or try MetaMask, and tell us which wallet you use.'
  if (m.code === -32002) return 'Your wallet already has a request waiting. Open it to approve or reject it.'
  return m.message || 'The wallet returned an error.'
}

/** A wallet that refuses to add Robinhood Chain can't be used on Orbit: say so plainly. */
function chainError(e: unknown, _name?: string) { // eslint-disable-line @typescript-eslint/no-unused-vars
  if (!badParams(e)) return walletError(e)
  return 'Your wallet could not add Robinhood Chain. Use MetaMask on your phone or computer: it supports Robinhood Chain.'
}

async function ensureChain(p: Eip1193) {
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] })
  } catch (e) {
    // 4902 = unknown chain: ask the wallet to add Robinhood Chain, then it switches
    if ((e as { code?: number }).code === 4902 || /unrecognized|not added/i.test((e as Error).message)) {
      try { await p.request({ method: 'wallet_addEthereumChain', params: [ADD_CHAIN] }) }
      catch (e2) {
        // some mobile wallets refuse optional fields: try again with the required ones only
        if (!badParams(e2)) throw e2
        const { blockExplorerUrls: _x, ...minimal } = ADD_CHAIN // eslint-disable-line @typescript-eslint/no-unused-vars
        await p.request({ method: 'wallet_addEthereumChain', params: [{ ...minimal, rpcUrls: [...minimal.rpcUrls] }] })
      }
    } else throw e
  }
}

/** Never sees a private key: every signature is requested from the user's wallet. */
export function useWallet(): Wallet {
  const [w, setW] = useState(() => (typeof window !== 'undefined' ? pick() : null))
  const [address, setAddress] = useState<Hex | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // wallets may announce a moment after load
  useEffect(() => { if (!w) { const t = setTimeout(() => setW(pick()), 600); return () => clearTimeout(t) } }, [w])

  useEffect(() => {
    if (!w) return
    const p = w.provider
    const onAcc = (a: unknown) => setAddress(((a as string[])[0] as Hex) ?? null)
    const onChain = (c: unknown) => setChainId(parseInt(c as string, 16))
    // silent reconnect only if the user already approved this site before
    let remember = false
    try { remember = localStorage.getItem('orbit:wallet') === '1' } catch { /* ignore */ }
    if (remember) p.request({ method: 'eth_accounts' }).then(onAcc).catch(() => {})
    p.request({ method: 'eth_chainId' }).then(onChain).catch(() => {})
    p.on?.('accountsChanged', onAcc)
    p.on?.('chainChanged', onChain)
    return () => { p.removeListener?.('accountsChanged', onAcc); p.removeListener?.('chainChanged', onChain) }
  }, [w])

  // A wallet popup that is closed without answering never resolves its promise. Never let that freeze the app:
  // after WAIT ms the button works again; if the wallet answers later, the answer is still applied.
  const connect = useCallback(async () => {
    const cur = w ?? pick()
    if (!cur) { setError('No wallet found in this browser. Install MetaMask, or open Orbit inside your wallet app.'); return }
    setW(cur); setConnecting(true); setError(null)
    const giveUp = setTimeout(() => { setConnecting(false); setError('Your wallet did not answer. Open it, approve or reject the request, and try again.') }, WAIT)
    try {
      const acc = (await cur.provider.request({ method: 'eth_requestAccounts' })) as Hex[]
      clearTimeout(giveUp)
      setAddress(acc[0] ?? null); setError(null)
      try { localStorage.setItem('orbit:wallet', '1') } catch { /* ignore */ }
    } catch (e) {
      clearTimeout(giveUp)
      setError(walletError(e)); setConnecting(false); return
    }
    setConnecting(false)
    // the network switch is a second, separate prompt: the app is usable while it is pending
    ensureChain(cur.provider).then(() => setChainId(robinhood.id)).catch((e) => setError(chainError(e, cur.name)))
  }, [w])

  const cancel = useCallback(() => { setConnecting(false); setError(null) }, [])

  const authorize = useCallback(async () => {
    const cur = w ?? pick()
    if (!cur) throw new Error('No wallet found in this browser. Install MetaMask, or open Orbit inside your wallet app.')
    // eth_requestAccounts returns the accounts this site may use right now (and asks to connect if none)
    const acc = (await cur.provider.request({ method: 'eth_requestAccounts' })) as Hex[]
    if (!acc[0]) throw Object.assign(new Error('No account authorized'), { code: 4100 })
    setAddress(acc[0])
    // MetaMask grants networks per site: switching here also asks permission for Robinhood Chain on Orbit
    await ensureChain(cur.provider)
    setChainId(robinhood.id)
    return createWalletClient({ account: acc[0], chain: robinhood, transport: custom(cur.provider) })
  }, [w])

  const switchChain = useCallback(async () => {
    if (!w) return
    try { await ensureChain(w.provider); setChainId(robinhood.id); setError(null) } catch (e) { setError(chainError(e, w.name)) }
  }, [w])

  const disconnect = useCallback(() => {
    setAddress(null); setError(null)
    try { localStorage.removeItem('orbit:wallet') } catch { /* ignore */ }
    // MetaMask and most wallets support revoking the site's permission; older ones just forget it locally
    w?.provider.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }).catch(() => {})
  }, [w])

  const chainOk = chainId === robinhood.id
  const client = useMemo(() => (w && address ? createWalletClient({ account: address, chain: robinhood, transport: custom(w.provider) }) : null), [w, address])
  const sign = useCallback(async (message: string) => {
    const cur = w ?? pick()
    if (!cur) throw new Error('No wallet found in this browser. Install MetaMask, or open Orbit inside your wallet app.')
    const acc = (await cur.provider.request({ method: 'eth_requestAccounts' })) as Hex[]
    if (!acc[0]) throw Object.assign(new Error('No account authorized'), { code: 4100 })
    return signText(cur.provider, acc[0], message)
  }, [w])
  return { available: !!w, name: w?.name ?? 'Wallet', address, chainOk, client, connecting, error, connect, cancel, authorize, signText: sign, disconnect, switchChain }
}
