import nacl from 'tweetnacl'
import {
  parseAbi,
  bytesToHex,
  hexToBytes,
  isAddress,
  sha256,
  type Hex,
  type Abi,
  type PublicClient,
} from 'viem'
import mainnetCfg from '../contracts/mainnet.json'
import artifact from '../contracts/PaidInbox.artifact.json'
import { rh } from './pons'

export const abi = artifact.abi as Abi
export const ETH_ASSET = '0x0000000000000000000000000000000000000000' as Hex
import { REAL_PONS } from './pons'
export { REAL_PONS }

/** One network the mail can run on. Every read and write goes through it. */
export type Net = {
  id: 'mainnet'
  pub: PublicClient
  inbox: Hex | null
  treasury: Hex | null
  pons: Hex
  fromBlock: bigint
  /** largest block span a single getLogs may ask for */
  span: bigint
}

/* ---------- the PaidInbox everyone uses: pinned in contracts/mainnet.json ---------- */
export type MainnetInbox = { address: Hex; deployBlock: number; treasury: Hex }
export function mainnetInbox(): MainnetInbox | null {
  return mainnetCfg.address && isAddress(mainnetCfg.address as string) ? (mainnetCfg as unknown as MainnetInbox) : null
}
export function mainnetNet(m: MainnetInbox | null): Net {
  return { id: 'mainnet', pub: rh as unknown as PublicClient, inbox: m?.address ?? null, treasury: m?.treasury ?? null, pons: REAL_PONS, fromBlock: BigInt(m?.deployBlock ?? 0), span: 1_000_000n }
}

/* ---------- end-to-end encryption (X25519 + XSalsa20-Poly1305) ---------- */
// Each wallet derives its encryption keypair from a signature (see unlockKey) and publishes the public half on-chain.
// The contract only ever stores ciphertext.
const NL = String.fromCharCode(10)
const keyName = (addr: string) => `sobre:enc:${addr.toLowerCase()}`
/** What the wallet signs to derive the mail key. Changing this text changes everyone's key: never edit it. */
export const MAIL_KEY_MESSAGE = 'Orbit Mail' + NL + NL + 'Sign to unlock your encrypted inbox on this device.' + NL + 'This is free: it is not a transaction and costs no gas.' + NL + NL + 'Key version: 1'
/** True when this browser already holds the mail key of that wallet. */
export const hasKey = (addr: string) => { try { return !!localStorage.getItem(keyName(addr)) } catch { return false } }
/**
 * Mainnet mail key = hash of the wallet's signature of a fixed message. Wallets sign deterministically,
 * so the same wallet gets the same key on any device, and nobody without the wallet can rebuild it.
 */
export async function unlockKey(addr: string, sign: (message: string) => Promise<Hex>) {
  const sig = await sign(MAIL_KEY_MESSAGE)
  const kp = nacl.box.keyPair.fromSecretKey(sha256(hexToBytes(sig), 'bytes'))
  try { localStorage.setItem(keyName(addr), bytesToHex(kp.secretKey)) } catch { /* storage blocked: works for this session only */ }
  return bytesToHex(kp.publicKey)
}
function keypair(addr: string) {
  const k = keyName(addr)
  try {
    const s = localStorage.getItem(k)
    if (s) return nacl.box.keyPair.fromSecretKey(hexToBytes(s as Hex))
  } catch { /* storage unavailable */ }
  // a wallet's key only ever comes from unlockKey (a signature of that wallet)
  return null
}
const mustKey = (addr: string) => { const kp = keypair(addr); if (!kp) throw new Error('Unlock your mail first (one free signature from your wallet).'); return kp }
export const encPublicKey = (addr: string) => bytesToHex(mustKey(addr).publicKey)

/** payload = 0x01 | senderPub(32) | nonce(24) | box */
export function encrypt(fromAddr: string, toEncKey: Hex, text: string): Hex {
  const kp = mustKey(fromAddr)
  const nonce = nacl.randomBytes(24)
  const box = nacl.box(new TextEncoder().encode(text), nonce, hexToBytes(toEncKey), kp.secretKey)
  const out = new Uint8Array(1 + 32 + 24 + box.length)
  out[0] = 1
  out.set(kp.publicKey, 1)
  out.set(nonce, 33)
  out.set(box, 57)
  return bytesToHex(out)
}

/** Works for both sides: the shared secret is the same from sender or recipient. */
export function decrypt(myAddr: string, peerEncKey: Hex | undefined, payload: Hex): string | null {
  try {
    const b = hexToBytes(payload)
    if (b[0] !== 1) return null
    const senderPub = b.slice(1, 33)
    const nonce = b.slice(33, 57)
    const box = b.slice(57)
    const kp = keypair(myAddr)
    if (!kp) return null
    const mine = bytesToHex(senderPub) === bytesToHex(kp.publicKey)
    const other = mine ? (peerEncKey ? hexToBytes(peerEncKey) : null) : senderPub
    if (!other) return null
    const msg = nacl.box.open(box, nonce, other, kp.secretKey)
    return msg ? new TextDecoder().decode(msg) : null
  } catch {
    return null
  }
}

/* ---------- assets ---------- */
export type AssetKey = 'PONS' | 'ETH'
export const assetsOf = (n: Net) => [{ key: 'PONS' as const, addr: n.pons }, { key: 'ETH' as const, addr: ETH_ASSET }]
export const assetKey = (n: Net, a: string): AssetKey => (a.toLowerCase() === n.pons.toLowerCase() ? 'PONS' : 'ETH')
export const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)'])

/* ---------- reads ---------- */
export type InboxCfg = { registered: boolean; open: boolean; rule: number; encKey: Hex; prices: Partial<Record<AssetKey, bigint>> }
export async function getInbox(n: Net, a: Hex): Promise<InboxCfg> {
  const A = assetsOf(n)
  const [r, ...acc] = await Promise.all([
    n.pub.readContract({ address: n.inbox!, abi, functionName: 'inboxes', args: [a] }) as Promise<[boolean, boolean, number, Hex]>,
    ...A.flatMap((x) => [
      n.pub.readContract({ address: n.inbox!, abi, functionName: 'accepts', args: [a, x.addr] }) as Promise<boolean>,
      n.pub.readContract({ address: n.inbox!, abi, functionName: 'prices', args: [a, x.addr] }) as Promise<bigint>,
    ]),
  ])
  const prices: Partial<Record<AssetKey, bigint>> = {}
  A.forEach((x, i) => { if (acc[i * 2]) prices[x.key] = acc[i * 2 + 1] as bigint })
  return { registered: r[0], open: r[1], rule: r[2], encKey: r[3], prices }
}
export type Payment = { id: bigint; from: Hex; to: Hex; asset: Hex; amount: bigint; expiresAt: bigint; status: number }
export async function getPayment(n: Net, id: bigint): Promise<Payment> {
  const r = (await n.pub.readContract({ address: n.inbox!, abi, functionName: 'payments', args: [id] })) as [Hex, Hex, Hex, bigint, bigint, number]
  return { id, from: r[0], to: r[1], asset: r[2], amount: r[3], expiresAt: r[4], status: r[5] }
}
export async function isContact(n: Net, to: Hex, from: Hex) { return (await n.pub.readContract({ address: n.inbox!, abi, functionName: 'isContact', args: [to, from] })) as boolean }
export const ponsBalance = (n: Net, a: Hex) => (n.pons === ETH_ASSET ? Promise.resolve(0n) : (n.pub.readContract({ address: n.pons, abi: erc20, functionName: 'balanceOf', args: [a] }) as Promise<bigint>))

export const RULES = ['Refund the payment', 'Keep it', 'Split 50/50']
export const STATUS = ['—', 'In escrow', 'Settled', 'Refunded']

export const chainTime = async (n: Net) => (await n.pub.getBlock()).timestamp
