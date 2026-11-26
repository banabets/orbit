import { createPublicClient, http, toFunctionSelector, decodeAbiParameters } from 'viem'
const c = createPublicClient({ transport: http('https://rpc.mainnet.chain.robinhood.com') })
const curve='0x90984842fD4Be4854CF7cbf78Fb6e3502ea96dE1'
const code=(await c.getCode({address:curve})).toLowerCase()
const sels=new Set(); for(let i=0;i<code.length-10;i+=2){ if(code.slice(i,i+2)==='63') sels.add(code.slice(i+2,i+10)) }
console.log('curve code len',code.length,'push4 count',sels.size)
const names=['progress()','graduationProgress()','quoteRaised()','raised()','reserves()','getReserves()','quoteReserve()','tokenReserve()','sold()','tokensSold()','soldTokens()','totalSold()','threshold()','graduationThreshold()','completed()','graduated()','isComplete()','state()','getState()','config()','launchConfig()','phantomQuote()','supply()','price()','currentPrice()','spotPrice()','quoteBalance()','virtualQuote()','realQuote()','token()','pairToken()','quoteToken()','curveState()','info()','marketCap()','remaining()','tokensRemaining()','reserveToken()','reserveQuote()','totalRaised()','netQuote()','quoteCollected()','collected()','status()','params()']
for(const n of names){const s=toFunctionSelector(n).slice(2); if(sels.has(s)){ const r=await c.call({to:curve,data:'0x'+s}).catch(e=>({e:e.shortMessage})); console.log('HAS',n, (r.data||r.e||'').slice(0,330)) }}
console.log([...sels].join(' '))
