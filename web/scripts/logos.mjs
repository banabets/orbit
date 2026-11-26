import { createPublicClient, http, parseAbi } from 'viem'
const c = createPublicClient({ chain:{id:4663,name:'rh',nativeCurrency:{name:'E',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['https://rpc.mainnet.chain.robinhood.com']}},contracts:{multicall3:{address:'0xcA11bde05977b3631167028862bE2a173976CA11'}}}, transport: http() })
const F='0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
const head=await c.getBlockNumber()
const logs=await c.getLogs({address:F,fromBlock:head-400000n,toBlock:head})
const toks=logs.filter(l=>l.topics[0].startsWith('0x8d4a')).slice(-40).map(l=>'0x'+l.topics[1].slice(26))
const abi=parseAbi(['function logo() view returns (string)','function symbol() view returns (string)'])
const r=await c.multicall({contracts:toks.flatMap(t=>[{address:t,abi,functionName:'symbol'},{address:t,abi,functionName:'logo'}])})
const hosts={}
for(let i=0;i<r.length;i+=2){const s=r[i].result,l=r[i+1].status==='success'?r[i+1].result:'ERR';const h=l.startsWith('http')?new URL(l).host:l.slice(0,20);hosts[h]=(hosts[h]||0)+1; if(i<24) console.log(s, '|', l.slice(0,110))}
console.log(hosts)
