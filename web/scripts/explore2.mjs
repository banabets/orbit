import { createPublicClient, http, parseAbi, formatEther } from 'viem'
const c = createPublicClient({ transport: http('https://rpc.mainnet.chain.robinhood.com') })
const tx='0x274a9e6bac3eef4ca2032bbdad7eac1279d6d5ec309e50fe4ba9618c1ae59aab'
const rc = await c.getTransactionReceipt({ hash: tx })
for (const l of rc.logs){ console.log('\n',l.address,l.topics.map(t=>t.slice(0,10)+'..'+t.slice(-8)).join(' ')); const d=l.data.slice(2); for(let i=0;i<d.length;i+=64) console.log('  w',i/64, '0x'+d.slice(i,i+64).replace(/^0+/,'') ) }
const token='0x502d980f3ece4214b1f62e91629b4218512821c6', curve='0x8cdb42a926817712ee5545d153e47eebe4d04fb5'
const erc=parseAbi(['function name() view returns (string)','function symbol() view returns (string)','function totalSupply() view returns (uint256)','function tokenURI() view returns (string)','function image() view returns (string)','function metadata() view returns (string)','function imageURI() view returns (string)','function description() view returns (string)'])
for (const fn of ['name','symbol','totalSupply','tokenURI','image','metadata','imageURI','description']){ try{ console.log(fn, await c.readContract({address:token,abi:erc,functionName:fn})) }catch(e){ console.log(fn,'x') } }
console.log('curve ETH', formatEther(await c.getBalance({address:curve})))
const b1=await c.getBlock({blockNumber:120110514n}), b2=await c.getBlock({blockNumber:120506902n})
console.log('secs/block', Number(b2.timestamp-b1.timestamp)/ (120506902-120110514), new Date(Number(b1.timestamp)*1000).toISOString())
const code = await c.getCode({address:token}); console.log('token code len', code.length)
