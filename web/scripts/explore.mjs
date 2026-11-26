import { createPublicClient, http, keccak256, toHex, decodeAbiParameters } from 'viem'
const c = createPublicClient({ transport: http('https://rpc.mainnet.chain.robinhood.com') })
const F = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
const head = await c.getBlockNumber()
const logs = await c.getLogs({ address: F, fromBlock: head - 400000n, toBlock: head })
const counts = {}
for (const l of logs) counts[l.topics[0]] = (counts[l.topics[0]]||0)+1
console.log('head', head, 'logs', logs.length, counts)
const sigs = ['TokenLaunched(address,address,address,address,address,uint256,uint256,uint256,uint256,uint256)',
 'TokenLaunched(address,address,address,address,uint256,uint256)','TokenLaunched(address,address,address,uint256,uint256)',
 'LaunchSwept(address,uint256)','PoolGraduated(address,address)','TokenLaunched(address,address,address,uint256,uint256,uint256,uint256)']
for (const s of sigs) console.log(keccak256(toHex(s)), s)
const sample = logs.find(l=>l.topics[0]==='0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607')
console.log(JSON.stringify(sample,(k,v)=>typeof v==='bigint'?v.toString():v,1))
const tx = await c.getTransaction({ hash: sample.transactionHash })
console.log('tx to', tx.to, 'input', tx.input.slice(0,10), 'value', tx.value)
const rc = await c.getTransactionReceipt({ hash: sample.transactionHash })
for (const l of rc.logs) console.log(l.address, l.topics[0], l.topics.length, l.data.length)
