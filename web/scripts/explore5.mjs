import { createPublicClient, http, formatEther, hexToBigInt } from 'viem'
const c = createPublicClient({ transport: http('https://rpc.mainnet.chain.robinhood.com') })
const F='0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
const head=await c.getBlockNumber()
console.log('multicall3 code', (await c.getCode({address:'0xcA11bde05977b3631167028862bE2a173976CA11'}))?.length)
let t=Date.now(); try{ const big=await c.getLogs({address:F,fromBlock:head-2000000n,toBlock:head}); console.log('2M ok',big.length, Date.now()-t,'ms')
 const L=big.filter(l=>l.topics[0].startsWith('0x8d4a')), G=big.filter(l=>l.topics[0].startsWith('0x308c'))
 const tokens=new Map(L.map(l=>['0x'+l.topics[1].slice(26),'0x'+l.topics[2].slice(26)]))
 console.log('launches',L.length,'grad',G.length)
 for(const g of G.slice(0,4)){ const tk='0x'+g.topics[1].slice(26); const cv=tokens.get(tk); console.log('grad topic1 is token?',!!cv, g.topics.map(x=>'0x'+x.slice(26)))
   if(cv){ const lg=await c.getLogs({address:cv,fromBlock:head-2000000n,toBlock:head}); let inn=0n,out=0n; for(const l of lg){const d=l.data.slice(2);const w=i=>BigInt('0x'+(d.slice(i*64,i*64+64)||'0'));
     if(l.topics[0].startsWith('0xec36')) inn+=w(0)-w(2)-w(3); if(l.topics[0].startsWith('0x8113')) out+=w(1)+w(2)+w(3)}
     console.log('  net', formatEther(inn-out), 'events', lg.length)} }
}catch(e){console.log('2M fail',e.shortMessage)}
t=Date.now(); const all=await c.getLogs({fromBlock:head-50000n,toBlock:head,events:undefined, topics:[['0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455','0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df']]}).catch(e=>({err:e.shortMessage}))
console.log('global trades last 50k blocks', all.length ?? all, Date.now()-t,'ms')
