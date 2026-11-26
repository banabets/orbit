import { pingPush } from './push'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatEther, parseEther, parseEventLogs, getAddress, type Hex, type WalletClient, type Abi } from 'viem'
import {
  abi, encPublicKey, encrypt, getInbox, getPayment, isContact, ponsBalance, chainTime, ETH_ASSET,
  assetsOf, assetKey, erc20, mainnetInbox, mainnetNet, hasKey, unlockKey, type InboxCfg, type Payment, type AssetKey, type Net,
} from './inbox'
import { badParams, type Wallet } from './wallet'
import { short } from './format'
import { useT } from './i18n'

export type Msg = { id: bigint; from: Hex; to: Hex; paymentId: bigint; ct: Hex; block: bigint; tx: Hex }
type Ev = { name: string; args: Record<string, unknown>; block: bigint; tx: Hex }
export type Draft = { creator: Hex; symbol: string; curve: string } | null
export const fmt = (w: bigint, key: AssetKey) => `${Number(formatEther(w)).toLocaleString('en-US', { maximumFractionDigits: key === 'PONS' ? 0 : 5 })} ${key}`
export const lc = (a: string) => a.toLowerCase()

/**
 * Everything Mail does with the PaidInbox contract: reading messages and payments, the encryption key,
 * activating an inbox, sending, replying and refunds. Shared by the desktop and phone screens, so the
 * money logic exists once.
 */
export function useMail(wallet: Wallet, draft: Draft) {
  const { t: tr } = useT()
  const net: Net = useMemo(() => mainnetNet(mainnetInbox()), [])
  const ASSETS = useMemo(() => assetsOf(net), [net])
  const myAddr: Hex | null = wallet.address ? getAddress(wallet.address) : null
  const signer: WalletClient | null = wallet.client
  const meName = myAddr ? short(myAddr) : ''

  const [peer, setPeer] = useState<Hex | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [cfg, setCfg] = useState<Record<string, InboxCfg>>({})
  const [pays, setPays] = useState<Record<string, Payment>>({})
  const [bal, setBal] = useState<Record<string, { eth: bigint; pons: bigint }>>({})
  const [escrow, setEscrow] = useState({ eth: 0n, pons: 0n })
  const [fees, setFees] = useState({ eth: 0n, pons: 0n })
  const [settledTo, setSettledTo] = useState<{ id: bigint; asset: Hex; toRecipient: bigint }[]>([])
  const [now, setNow] = useState(0n)
  const [contact, setContact] = useState(false)
  const [text, setText] = useState('')
  const [payWith, setPayWith] = useState<AssetKey>('PONS')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ t: string; err?: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [set, setSet] = useState({ pons: '250', eth: '0.005', rule: 0, open: false })
  const [newTo, setNewTo] = useState('')
  const box = useRef<HTMLDivElement>(null)
  // mainnet: the mail key comes from a free wallet signature (same key on every device)
  const [, setKeyTick] = useState(0)
  const needKey = !!myAddr && !hasKey(myAddr)
  const scan = useRef<{ key: string; upTo: bigint; parsed: Ev[] }>({ key: '', upTo: -1n, parsed: [] })
  const say = (t: string, err = false) => { setToast({ t, err }); setTimeout(() => setToast(null), 5000) }

  const ready = !!net.inbox
  const refresh = useCallback(async () => {
    if (!net.inbox) return
    try {
      const bn = await net.pub.getBlockNumber()
      // incremental log scan, chunked to what the RPC allows; resets if the chain restarted
      const key = net.id + net.inbox
      const s = scan.current
      if (s.key !== key || bn < s.upTo) { scan.current = { key, upTo: net.fromBlock - 1n, parsed: [] }; setLoading(true) }
      const cur = scan.current
      for (let from = cur.upTo + 1n; from <= bn; from += net.span) {
        const to = from + net.span - 1n > bn ? bn : from + net.span - 1n
        const logs = await net.pub.getLogs({ address: net.inbox, fromBlock: from, toBlock: to })
        const p = parseEventLogs({ abi: abi as Abi, logs }) as unknown as { eventName: string; args: Record<string, unknown>; blockNumber: bigint; transactionHash: Hex }[]
        cur.parsed.push(...p.map((x) => ({ name: x.eventName, args: x.args, block: x.blockNumber, tx: x.transactionHash })))
        cur.upTo = to
      }
      setLoading(false)

      const m: Msg[] = [], ids = new Set<bigint>(), fee = { eth: 0n, pons: 0n }, settled: { id: bigint; asset: Hex; toRecipient: bigint }[] = []
      for (const e of cur.parsed) {
        if (e.name === 'Message') { const a = e.args as { id: bigint; from: Hex; to: Hex; paymentId: bigint; ciphertext: Hex }; m.push({ id: a.id, from: a.from, to: a.to, paymentId: a.paymentId, ct: a.ciphertext, block: e.block, tx: e.tx }); if (a.paymentId > 0n) ids.add(a.paymentId) }
        if (e.name === 'Settled') { const a = e.args as { paymentId: bigint; asset: Hex; toRecipient: bigint; fee: bigint }; if (assetKey(net, a.asset) === 'PONS') fee.pons += a.fee; else fee.eth += a.fee; settled.push({ id: a.paymentId, asset: a.asset, toRecipient: a.toRecipient }) }
      }
      // which wallets to read: me + everyone I talk to + the open chat
      const want = new Map<string, Hex>()
      if (myAddr) want.set(lc(myAddr), myAddr)
      for (const x of m) if (myAddr && (lc(x.from) === lc(myAddr) || lc(x.to) === lc(myAddr))) { want.set(lc(x.from), x.from); want.set(lc(x.to), x.to) }
      if (peer) want.set(lc(peer), peer)
      const addrs = [...want.values()]
      const balAddrs = myAddr ? [myAddr] : []
      const [cfgs, eths, ponss, escEth, escPons, payList, t] = await Promise.all([
        Promise.all(addrs.map((a) => getInbox(net, a))), Promise.all(balAddrs.map((a) => net.pub.getBalance({ address: a }))), Promise.all(balAddrs.map((a) => ponsBalance(net, a))),
        net.pub.getBalance({ address: net.inbox }), ponsBalance(net, net.inbox), Promise.all([...ids].map((id) => getPayment(net, id))), chainTime(net),
      ])
      setMsgs(m); setFees(fee); setNow(t); setEscrow({ eth: escEth, pons: escPons })
      setCfg(Object.fromEntries(addrs.map((a, i) => [lc(a), cfgs[i]])))
      setBal(Object.fromEntries(balAddrs.map((a, i) => [lc(a), { eth: eths[i], pons: ponss[i] }])))
      setPays(Object.fromEntries(payList.map((p) => [p.id.toString(), p])))
      setSettledTo(settled)
    } catch { /* transient RPC error: the next poll retries */ }
  }, [net, myAddr, peer])

  useEffect(() => {
    refresh()
    // Robinhood Chain makes ~8 blocks a second, so poll gently
    const id = setInterval(refresh, 4000)
    return () => clearInterval(id)
  }, [refresh, net])


  useEffect(() => {
    if (!draft) return
    setPeer(getAddress(draft.creator))
    setText(tr('Hi, I saw ${sym} on Orbit and I would like to propose a collaboration for your next launch.', { sym: draft.symbol || tr('your token') }))
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps

  const mine = myAddr ? cfg[lc(myAddr)] : undefined
  useEffect(() => { if (mine?.registered) setSet({ pons: mine.prices.PONS !== undefined ? formatEther(mine.prices.PONS) : '', eth: mine.prices.ETH !== undefined ? formatEther(mine.prices.ETH) : '', rule: mine.rule, open: mine.open }) }, [myAddr, mine?.registered]) // eslint-disable-line react-hooks/exhaustive-deps

  const peers = useMemo(() => {
    const map = new Map<string, Msg>()
    if (myAddr) for (const m of msgs) if (lc(m.from) === lc(myAddr) || lc(m.to) === lc(myAddr)) map.set(lc(lc(m.from) === lc(myAddr) ? m.to : m.from), m)
    return [...map.entries()].sort((a, b) => Number(b[1].block - a[1].block))
  }, [msgs, myAddr])
  const thread = useMemo(() => (peer && myAddr ? msgs.filter((m) => (lc(m.from) === lc(myAddr) && lc(m.to) === lc(peer)) || (lc(m.to) === lc(myAddr) && lc(m.from) === lc(peer))) : []), [msgs, peer, myAddr])
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [thread.length, peer])

  const peerCfg = peer ? cfg[lc(peer)] : undefined
  useEffect(() => { if (peer && myAddr && peerCfg?.registered) isContact(net, peer, myAddr).then(setContact).catch(() => setContact(false)) }, [peer, myAddr, peerCfg, msgs, net])
  const isMe = (a: string) => !!myAddr && lc(a) === lc(myAddr)
  const incoming = thread.map((m) => pays[m.paymentId.toString()]).find((p) => p && p.status === 1 && isMe(p.to) && p.expiresAt >= now)
  const outgoing = thread.map((m) => pays[m.paymentId.toString()]).find((p) => p && p.status === 1 && isMe(p.from))
  const free = !!peerCfg && (peerCfg.open || contact)
  const accepted = (peerCfg ? ASSETS.filter((a) => peerCfg.prices[a.key] !== undefined) : []).map((a) => a.key)
  useEffect(() => { if (accepted.length && !accepted.includes(payWith)) setPayWith(accepted[0]) }, [accepted.join(), payWith]) // eslint-disable-line react-hooks/exhaustive-deps
  const price = peerCfg?.prices[payWith]

  const write = (w: WalletClient, p: { address: Hex; abi: Abi; functionName: string; args: readonly unknown[]; value?: bigint }) =>
    w.writeContract({ ...p, account: w.account!, chain: w.chain } as Parameters<WalletClient['writeContract']>[0])

  async function run(label: string, steps: [string, () => Promise<Hex>][]) {
    if (!wallet.chainOk) { await wallet.switchChain(); return say(tr('Switch your wallet to Robinhood Chain and try again'), true) }
    try {
      for (const [what, fn] of steps) { setBusy(what + ' ' + tr('Sign in your wallet')); const h = await fn(); setBusy(tr('Waiting for confirmation…')); await net.pub.waitForTransactionReceipt({ hash: h, timeout: 180_000 }); pingPush(h) }
      say(label); await refresh()
    } catch (e) {
      const m = e as { shortMessage?: string; message: string; code?: number; cause?: { code?: number } }
      say(m.code === 4001 || m.cause?.code === 4001 || /rejected|denied/i.test(m.message) ? tr('You cancelled the signature in your wallet') : badParams(e) ? tr('Your wallet did not accept this request. Update your wallet app, or try MetaMask, and tell us which wallet you use.') + ' (eth_sendTransaction)' : m.shortMessage || m.message, true)
    } finally { setBusy(null) }
  }
  const configure = (w: WalletClient, addr: Hex, ponsPrice: string, ethPrice: string, rule: number, open: boolean) => {
    const assets: Hex[] = [], amounts: bigint[] = []
    if (ponsPrice && net.pons !== ETH_ASSET) { assets.push(net.pons); amounts.push(parseEther(ponsPrice)) }
    if (ethPrice) { assets.push(ETH_ASSET); amounts.push(parseEther(ethPrice)) }
    return write(w, { address: net.inbox!, abi, functionName: 'configure', args: [open, rule, encPublicKey(addr), assets, amounts] })
  }
  const saveMine = async (label = tr('Inbox saved to the contract')) => { if (!signer || !myAddr) return; if (needKey && !(await unlock())) return; return run(label, [[tr('Saving…'), () => configure(signer, myAddr, set.pons, set.eth, set.rule, set.open)]]) }

  async function unlock() {
    if (!myAddr) return false
    setBusy(tr('Sign in your wallet (free, no gas)…'))
    try {
      await unlockKey(myAddr, (message) => wallet.signText(message))
      setKeyTick((n) => n + 1); return true
    } catch (e) {
      const m = e as { code?: number; message: string }
      say(m.code === 4001 || /rejected|denied/i.test(m.message) ? tr('You cancelled the signature in your wallet') : badParams(e) ? tr('Your wallet did not accept this request. Update your wallet app, or try MetaMask, and tell us which wallet you use.') + ' (personal_sign)' : m.message, true); return false
    } finally { setBusy(null) }
  }

  async function send() {
    if (!peer || !myAddr || !signer || !text.trim() || !peerCfg?.registered) return
    if (needKey && !(await unlock())) return
    const ct = encrypt(myAddr, peerCfg.encKey, text.trim())
    if (incoming) {
      await run(tr('You replied and payment #{id} settled', { id: String(incoming.id) }), [[tr('Signing reply…'), () => write(signer, { address: net.inbox!, abi, functionName: 'reply', args: [incoming.id, ct] })]])
    } else if (free) {
      await run(tr('Sent'), [[tr('Sending…'), () => write(signer, { address: net.inbox!, abi, functionName: 'send', args: [peer, ETH_ASSET, ct] })]])
    } else {
      if (price === undefined) return say(tr('This wallet does not accept that coin'), true)
      const asset = payWith === 'PONS' ? net.pons : ETH_ASSET
      const have = bal[lc(myAddr)]
      if (have && (payWith === 'PONS' ? have.pons : have.eth) < price) return say(tr('Not enough {c}: you need {v}', { c: payWith, v: fmt(price, payWith) }), true)
      const steps: [string, () => Promise<Hex>][] = []
      if (payWith === 'PONS') {
        const allowance = (await net.pub.readContract({ address: net.pons, abi: erc20, functionName: 'allowance', args: [myAddr, net.inbox!] })) as bigint
        // approve exactly what this message costs, never an unlimited allowance
        if (allowance < price) steps.push([tr('Approving PONS…'), () => write(signer, { address: net.pons, abi: erc20 as Abi, functionName: 'approve', args: [net.inbox!, price] })])
      }
      steps.push([tr('Paying and sending…'), () => write(signer, { address: net.inbox!, abi, functionName: 'send', args: [peer, asset, ct], value: payWith === 'ETH' ? price : 0n })])
      await run(tr('Sent · {v} in escrow', { v: fmt(price, payWith) }), steps)
    }
    setText('')
  }

  const expired = Object.values(pays).filter((p) => p.status === 1 && p.expiresAt < now)
  const label = (a: string) => (isMe(a) ? tr('You') : short(a))

  const refund = (p: Payment) => signer && run(tr('Payment #{id} refunded', { id: String(p.id) }), [[tr('Refunding…'), () => write(signer, { address: net.inbox!, abi, functionName: 'refund', args: [p.id] })]])
  const myBal = myAddr ? bal[lc(myAddr)] : undefined
  // this wallet's mail numbers: what it earned from replies, what waits to be collected, messages in and out
  const stats = (() => {
    const earned = { pons: 0n, eth: 0n }, waiting = { pons: 0n, eth: 0n }
    if (!myAddr) return { earned, waiting, received: 0, sent: 0 }
    for (const s of settledTo) { const p = pays[s.id.toString()]; if (p && lc(p.to) === lc(myAddr)) { if (assetKey(net, s.asset) === 'PONS') earned.pons += s.toRecipient; else earned.eth += s.toRecipient } }
    for (const p of Object.values(pays)) if (p.status === 1 && lc(p.to) === lc(myAddr) && p.expiresAt >= now) { if (assetKey(net, p.asset) === 'PONS') waiting.pons += p.amount; else waiting.eth += p.amount }
    return { earned, waiting, received: msgs.filter((x) => lc(x.to) === lc(myAddr)).length, sent: msgs.filter((x) => lc(x.from) === lc(myAddr)).length }
  })()
  return {
    stats, net, ASSETS, myAddr, signer, meName, peer, setPeer, msgs, cfg, pays, bal, myBal, escrow, fees, now, contact, text, setText,
    payWith, setPayWith, busy, toast, say, loading, set, setSet, newTo, setNewTo, box, needKey, ready, mine, peers, thread,
    peerCfg, isMe, incoming, outgoing, free, accepted, price, write, run, saveMine, unlock, send, refund, expired, label,
    keyIsCurrent: !!myAddr && !needKey && (!mine?.registered || mine.encKey.toLowerCase() === encPublicKey(myAddr).toLowerCase()),
    assetOf: (a: Hex) => assetKey(net, a),
  }
}
