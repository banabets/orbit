// Clean links: orbiteth.sbs/token/0x… instead of /#/token/0x…
// The address bar is the route. Old links with "#/" still work: they are turned into the clean path on load.
// Any <a href="/…"> inside the app moves without reloading the page (see installLinkClicks).

const EVENT = 'orbit:route'

/** the current route as "token/0x…", "mail", "" … (accepts an old "#/…" link too) */
export function currentRoute(): string {
  if (location.hash.startsWith('#/')) return location.hash.slice(2)
  return location.pathname.replace(/^\/+/, '').replace(/\/+$/, '')
}

/** go to a route: navigate('/token/0x…'), navigate('mail'), navigate('#/mail') */
export function navigate(to: string, replace = false) {
  const path = '/' + to.replace(/^#?\/*/, '')
  if (path === location.pathname && !location.hash) return
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path)
  dispatchEvent(new Event(EVENT))
}

export function onRoute(cb: () => void) {
  addEventListener('popstate', cb); addEventListener(EVENT, cb)
  return () => { removeEventListener('popstate', cb); removeEventListener(EVENT, cb) }
}

// paths the server owns: never handled as app screens
const SERVER = /^\/(api|pons-api|pons-claimed|assets)(\/|$)|\.[a-z0-9]+$/i

/** once at start: turn an old "#/…" link into the clean path, and handle in-app link clicks without reloads */
export function installLinkClicks() {
  if (location.hash.startsWith('#/')) history.replaceState(null, '', '/' + location.hash.slice(2) + location.search)
  addEventListener('hashchange', () => { if (location.hash.startsWith('#/')) navigate(location.hash, true) })
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element | null)?.closest?.('a')
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return
    const href = a.getAttribute('href') || ''
    if (href.startsWith('#/')) { e.preventDefault(); navigate(href); return }
    if (!href.startsWith('/') || href.startsWith('//') || SERVER.test(href)) return
    e.preventDefault(); navigate(href)
  })
}
