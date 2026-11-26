// GET /token/<curve> (rewritten here by vercel.json): the app's index.html with that token's name, market cap and
// logo in the link-preview tags, so a Orbit link pasted on X, Telegram or Discord shows a card for the token.
// People get the normal app; only the <head> differs. Any failure serves the plain page.
const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const PONS = 'https://ponsfamily.com/api'
const ART = 'https://dbk-vercel.vercel.app/api/ipfs/content/'
const HOSTS = new Set(['orbiteth.sbs', 'www.orbiteth.sbs'])

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const money = (n) => (n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'k' : '$' + n.toFixed(0))

function art(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/^ipfs:\/\/(?:ipfs\/)?([A-Za-z0-9]+)/)
  if (m) return ART + m[1] + '?variant=full'
  if (/^https:\/\//i.test(s)) return 'https://ponsfamily.com/api/artwork?src=' + encodeURIComponent(s)
  return null
}

async function tokenOf(curve) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: curve, data: '0xfc0c546a' }, 'latest'] }) }).then((x) => x.json())
  const w = r?.result
  return typeof w === 'string' && w.length >= 66 ? '0x' + w.slice(-40).toLowerCase() : null
}

export default async function handler(req, res) {
  res.setHeader('x-content-type-options', 'nosniff')
  const host = HOSTS.has(String(req.headers.host || '')) ? req.headers.host : 'orbiteth.sbs'
  const curve = String(new URL(req.url || '/', 'http://x').searchParams.get('c') || '').toLowerCase()
  let html
  try { html = await (await fetch(`https://${host}/index.html`)).text() } catch { return res.status(502).send('Orbit is updating, try again in a moment.') }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  if (!/^0x[0-9a-f]{40}$/.test(curve)) { res.setHeader('Cache-Control', 'public, s-maxage=300'); return res.status(200).send(html) }
  try {
    const token = await tokenOf(curve)
    const l = token ? await fetch(`${PONS}/launches/${token}`, { headers: { accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)) : null
    if (l?.name) {
      const sym = l.symbol ? '$' + l.symbol : ''
      const mc = typeof l.marketCapUsd === 'number' ? money(l.marketCapUsd) : null
      const title = `${l.name} ${sym ? '(' + sym + ')' : ''}${mc ? ' · ' + mc + ' market cap' : ''} · Orbit`
      const desc = `${sym || l.name} live on pons${l.stage === 'graduated' ? ' (graduated)' : ''}: chart, trades, top holders and creator earnings on Orbit.`
      const img = art(l.artwork) || `https://${host}/og.png`
      const url = `https://orbiteth.sbs/token/${curve}`
      const set = (re, tag) => { html = re.test(html) ? html.replace(re, tag) : html.replace('</head>', tag + '\n</head>') }
      set(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
      set(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(desc)}" />`)
      set(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(url)}" />`)
      set(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}" />`)
      set(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(desc)}" />`)
      set(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${esc(img)}" />`)
      set(/<meta name="twitter:card"[^>]*>/, `<meta name="twitter:card" content="summary" />`)
      set(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${esc(img)}" />`)
      set(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(title)}" />`)
    }
  } catch { /* plain page */ }
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600')
  return res.status(200).send(html)
}
