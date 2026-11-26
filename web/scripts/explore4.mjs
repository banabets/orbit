import { createPublicClient, http, parseAbi } from 'viem'
const c = createPublicClient({ transport: http('https://rpc.mainnet.chain.robinhood.com') })
const t='0x2183d2e4f5ae7b6e0826f878dbb5315c1000922e'
for (const sig of ['function logo() view returns (string)','function description() view returns (string)','function deployer() view returns (address)','function curve() view returns (address)','function name() view returns (string)','function symbol() view returns (string)']){
  const abi=parseAbi([sig]); const fn=abi[0].name
  try{ console.log(fn, JSON.stringify(await c.readContract({address:t,abi,functionName:fn})).slice(0,300)) }catch(e){ console.log(fn,'ERR',e.shortMessage) }
}
const raw=await c.call({to:t,data:'0x'+'abb1dc44'}).catch(e=>({e:e.shortMessage})); console.log('abb1dc44',raw)
for (const s of ['socials()']) { const {toFunctionSelector}=await import('viem'); const r=await c.call({to:t,data:toFunctionSelector(s)}); console.log(s, r.data?.slice(0,700)) }
