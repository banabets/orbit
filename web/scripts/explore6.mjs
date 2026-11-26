import { createPublicClient, http, formatEther, toHex } from 'viem'
const c = createPublicClient({ transport: http('https://rpc.mainnet.chain.robinhood.com') })
const head=await c.getBlockNumber()
const BUY='0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455', SELL='0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df'
for (const span of [5000n, 50000n, 300000n]){ const t=Date.now(); try{ const r=await c.request({method:'eth_getLogs',params:[{fromBlock:toHex(head-span),toBlock:toHex(head),topics:[[BUY,SELL]]}]}); 
 const curves=new Set(r.map(l=>l.address)); let vol=0n; for(const l of r){const d=l.data.slice(2); vol+= BigInt('0x'+d.slice(l.topics[0]===BUY?0:64, l.topics[0]===BUY?64:128))}
 console.log(span, 'trades',r.length,'curves',curves.size,'vol',formatEther(vol),Date.now()-t,'ms') }catch(e){console.log(span,'ERR',e.shortMessage||e.message)} }
