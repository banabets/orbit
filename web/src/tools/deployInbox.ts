// Local tool behind deploy-inbox.html: deploys PaidInbox from the browser wallet (it signs, we never see a key).
import { createPublicClient, createWalletClient, custom, http, isAddress, getAddress, type Hex, type EIP1193Provider } from 'viem'
import { robinhood } from '../lib/pons'
import artifact from '../contracts/PaidInbox.artifact.json'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const logEl = $('log'), connectBtn = $<HTMLButtonElement>('connect'), deployBtn = $<HTMLButtonElement>('deploy'), treasuryIn = $<HTMLInputElement>('treasury')
const log = (msg: string, cls = '') => { logEl.innerHTML = `<span class="${cls}">${msg}</span>` }
const add = (msg: string, cls = '') => { logEl.innerHTML += `\n<span class="${cls}">${msg}</span>` }

const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum
const pub = createPublicClient({ chain: robinhood, transport: http() })
let account: Hex | null = null

async function ensureChain() {
  const want = '0x' + robinhood.id.toString(16)
  const have = (await eth!.request({ method: 'eth_chainId' })) as string
  if (have.toLowerCase() === want) return
  try {
    await eth!.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: want }] })
  } catch {
    await eth!.request({ method: 'wallet_addEthereumChain', params: [{ chainId: want, chainName: robinhood.name, nativeCurrency: robinhood.nativeCurrency, rpcUrls: [...robinhood.rpcUrls.default.http] }] })
  }
}

async function refresh() {
  const id = Number((await eth!.request({ method: 'eth_chainId' })) as string)
  $('net').textContent = id === robinhood.id ? `Robinhood Chain (${id})` : `Otra red (${id}): cámbiala a Robinhood Chain`
  deployBtn.disabled = !account || id !== robinhood.id
}

connectBtn.onclick = async () => {
  if (!eth) return log('No encontré una wallet en este navegador. Abre esta página en el navegador donde tienes MetaMask.', 'err')
  try {
    const [a] = (await eth.request({ method: 'eth_requestAccounts' })) as Hex[]
    account = getAddress(a)
    $('acct').textContent = account
    if (!treasuryIn.value) treasuryIn.value = account
    await ensureChain()
    const bal = await pub.getBalance({ address: account })
    log(`Wallet conectada. Saldo: ${(Number(bal) / 1e18).toFixed(5)} ETH en Robinhood Chain.`, bal > 0n ? 'ok' : 'err')
    if (bal === 0n) add('Esta wallet no tiene ETH en Robinhood Chain para pagar el gas.', 'err')
  } catch (e) { log('No se conectó: ' + (e as Error).message, 'err') }
  await refresh()
}
eth?.on?.('chainChanged', () => { void refresh() })
eth?.on?.('accountsChanged', (a: unknown) => { const list = a as Hex[]; account = list[0] ? getAddress(list[0]) : null; $('acct').textContent = account ?? '—'; void refresh() })

deployBtn.onclick = async () => {
  const t = treasuryIn.value.trim()
  if (!isAddress(t)) return log('La treasury no es una dirección válida (0x… de 42 caracteres).', 'err')
  deployBtn.disabled = true
  try {
    await ensureChain()
    const wallet = createWalletClient({ account: account!, chain: robinhood, transport: custom(eth!) })
    log('Revisa tu wallet: muestra el costo del deploy. Firma para continuar…')
    const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode as Hex, args: [getAddress(t)] })
    add(`Transacción enviada: ${hash}\nEsperando confirmación…`)
    const rc = await pub.waitForTransactionReceipt({ hash })
    if (rc.status !== 'success' || !rc.contractAddress) throw new Error('La transacción falló en la red.')
    const deployBlock = Number(rc.blockNumber) - 50
    add(`\nContrato desplegado ✔`, 'ok')
    add(`PaidInbox: ${rc.contractAddress}\nTreasury: ${getAddress(t)}\nBloque: ${rc.blockNumber}`, 'ok')
    add(`\nPásale esta línea a Claude (o ponla en web/src/contracts/mainnet.json):\n{ "address": "${rc.contractAddress.toLowerCase()}", "deployBlock": ${deployBlock}, "treasury": "${getAddress(t)}" }`)
  } catch (e) {
    add('No se desplegó: ' + ((e as { shortMessage?: string }).shortMessage || (e as Error).message), 'err')
    deployBtn.disabled = false
  }
}
