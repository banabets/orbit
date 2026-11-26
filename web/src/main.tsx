import './lib/migrateStorage' // must stay first: other modules read saved settings when they load
import { installLinkClicks } from './lib/nav'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './lib/i18n'
import { ErrorBoundary } from './components/ErrorBoundary'

// clean links (/token/0x… instead of /#/token/0x…): convert old links and handle in-app clicks
installLinkClicks()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
)

// installable as an app (PWA)
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))

// Home-screen apps (and some phone browsers) keep showing an old copy of the page. On open and whenever the
// app comes back to the foreground, ask the server which build is current and switch to it if it changed.
// Only in the optimized build: the dev server has no hashed bundle to compare.
if (import.meta.env.PROD) {
  // the ?v= that forced the fresh copy has done its job: take it out of the address bar
  if (location.search.startsWith('?v=')) history.replaceState(null, '', location.pathname)
  const mine = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.getAttribute('src')
  const check = async () => {
    try {
      const html = await (await fetch('/?v=' + Date.now(), { cache: 'no-store' })).text()
      const latest = html.match(/\/assets\/index-[\w-]+\.js/)?.[0]
      if (!latest || !mine || latest === mine) return
      const key = 'orbit:updated-to'
      if (sessionStorage.getItem(key) === latest) return // already tried once this session: don't loop
      sessionStorage.setItem(key, latest)
      // a new URL skips the stale cached page
      location.replace(location.pathname + '?v=' + latest.slice(14, 22))
    } catch { /* offline: keep the copy we have */ }
  }
  check()
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
}
