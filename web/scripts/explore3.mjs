import { createPublicClient, http, parseAbi, formatEther, toFunctionSelector } from 'viem'
const c = createPublicClient({ transport: http('https://rpc.mainnet.chain.robinhood.com') })
const F='0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
const head=await c.getBlockNumber()
const fl=await c.getLogs({address:F,fromBlock:head-400000n,toBlock:head})
const g=fl.filter(l=>l.topics[0].startsWith('0x308c'))
console.log('0x308c sample', g[0].topics, g[0].data)
const token='0x502d980f3ece4214b1f62e91629b4218512821c6'
const code=(await c.getCode({address:token})).toLowerCase()
const names=['imageUrl()','imageURL()','image()','logo()','logoURI()','website()','twitter()','telegram()','x()','links()','socials()','metadataURI()','contractURI()','creator()','deployer()','curve()','owner()','description()','name()','metadata()','info()','tokenInfo()','uri()','imageUri()','imageHash()']
for(const n of names){const s=toFunctionSelector(n).slice(2); if(code.includes(s)) console.log('HAS',n)}
// list PUSH4 selectors in token code
const sels=new Set(); for(let i=0;i<code.length-10;i+=2){ if(code.slice(i,i+2)==='63') sels.add(code.slice(i+2,i+10)) }
console.log('selectors',[...sels].join(' '))
// curve logs overview for a busy curve
const launches=fl.filter(l=>l.topics[0].startsWith('0x8d4a'))
let best=null,bn=0
for(const L of launches.slice(-40)){const cv='0x'+L.topics[2].slice(26); const ls=await c.getLogs({address:cv,fromBlock:L.blockNumber,toBlock:head}); if(ls.length>bn){bn=ls.length;best={cv,ls,token:'0x'+L.topics[1].slice(26)}}}
const ct={}; for(const l of best.ls) ct[l.topics[0].slice(0,10)]=(ct[l.topics[0].slice(0,10)]||0)+1
console.log('busiest curve',best.cv,best.token,bn,ct)
const other=best.ls.find(l=>!l.topics[0].startsWith('0xec36')&&l.data.length>130); if(other){console.log(other.topics, other.data)}
