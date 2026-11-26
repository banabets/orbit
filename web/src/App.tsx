import { currentRoute, navigate, onRoute } from './lib/nav'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Verified } from './components/Verified'
import { ORBIT_TOKEN, ORBIT_SYMBOL, orbitBuyUrl } from './lib/official'
import { isAddress, type Hex } from 'viem'
import { usePons } from './lib/usePons'
import { Home, changeOf, type HomeStyle } from './components/Home'
import { TokenPage } from './components/TokenPage'
import type { Draft } from './components/Mail'
// Mail (contract + encryption) and Docs (long texts) download only when first opened
const Mail = lazy(() => import('./components/Mail').then((m) => ({ default: m.Mail })))
const MobileMail = lazy(() => import('./components/MobileMail').then((m) => ({ default: m.MobileMail })))
const DocsPage = lazy(() => import('./components/DocsPage').then((m) => ({ default: m.DocsPage })))
import { useWallet } from './lib/wallet'
import { useAlerts } from './lib/alerts'
import { useMailWatch } from './lib/useMailWatch'
import { CreatorPage } from './components/CreatorPage'
import { WalletPage } from './components/WalletPage'
import { Ranking } from './components/Ranking'
import { AlertsPage } from './components/AlertsPage'
import { OrbitMark } from './components/OrbitMark'
import { TokenImg } from './components/TokenImg'
import { GIcon, type Concept } from './components/Icon'
import { EthLogo } from './components/EthLogo'
import { pct, short } from './lib/format'
import { useT, LANGS } from './lib/i18n'
import { MobileApp, type MView } from './components/MobileApp'
import { AvatarDialog } from './components/AvatarPicker'
import { XIcon, X_URL, X_HANDLE } from './components/XLink'

type View = 'home' | 'mail' | 'token' | 'creator' | 'wallet' | 'ranking' | 'alerts' | 'docs' | 'live' | 'me'
type Route = { view: View; curve?: string; addr?: string; full?: boolean }
// English routes; the old Spanish ones keep working so shared links don't break
function parse(): Route {
  const h = currentRoute()
  if (h.startsWith('token/')) { const c = h.slice(6).toLowerCase(); return isAddress(c) ? { view: 'token', curve: c } : { view: 'home' } }
  const sub = (p: string[]) => p.find((x) => h.startsWith(x + '/'))
  const c = sub(['creator', 'creador']); if (c) { const a = h.slice(c.length + 1).toLowerCase(); return isAddress(a) ? { view: 'creator', addr: a } : { view: 'home' } }
  const w = sub(['portfolio', 'cartera']); if (w) { const a = h.slice(w.length + 1).toLowerCase(); return isAddress(a) ? { view: 'wallet', addr: a } : { view: 'home' } }
  if (h === 'portfolio' || h === 'cartera') return { view: 'wallet' }
  if (h === 'leaderboard' || h === 'ranking') return { view: 'ranking' }
  if (h === 'leaderboard/all') return { view: 'ranking', full: true }
  if (h === 'live') return { view: 'live' }
  if (h === 'me') return { view: 'me' }
  if (h === 'alerts' || h === 'alertas') return { view: 'alerts' }
  if (h === 'mail' || h === 'correo') return { view: 'mail' }
  if (h === 'docs') return { view: 'docs' }
  return { view: 'home' }
}
const PHONE = '(max-width: 760px)'
function usePhone() {
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(PHONE).matches)
  useEffect(() => { const q = matchMedia(PHONE); const on = () => setM(q.matches); q.addEventListener('change', on); return () => q.removeEventListener('change', on) }, [])
  return m
}
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d } catch { return d } }
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }

export default function App() {
  const live = usePons()
  const { t, lang, pref, setPref, autoNotice, dismissNotice } = useT()
  const [route, setRoute] = useState<Route>(parse)
  const [style] = useState<HomeStyle>(() => load('orbit:style', 'classic'))
  const [follows, setFollows] = useState<Set<string>>(() => new Set(load<string[]>('orbit:follows', [])))
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Draft>(null)
  const [langOpen, setLangOpen] = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const walletRef = useRef<HTMLDivElement>(null)
  const langRef = useRef<HTMLDivElement>(null)
  const wallet = useWallet()
  const [creators, setCreators] = useState<Set<string>>(() => new Set(load<string[]>('orbit:follow-creators', [])))
  const alerts = useAlerts(live, follows, creators, t)
  // new mail for the connected wallet: chime, notification and unread count, on any screen while Orbit is open
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  useEffect(() => { const on = () => setVisible(document.visibilityState === 'visible'); document.addEventListener('visibilitychange', on); return () => document.removeEventListener('visibilitychange', on) }, [])
  const mailWatch = useMailWatch(wallet.address, { sound: alerts.prefs.mailSound, notify: alerts.prefs.mailNotify, reading: route.view === 'mail' && visible, t })
  const phone = usePhone()
  const [mailSeen, setMailSeen] = useState(false)
  useEffect(() => { if (route.view === 'mail') setMailSeen(true) }, [route.view])

  useEffect(() => onRoute(() => setRoute(parse())), [])
  useEffect(() => save('orbit:style', style), [style])
  useEffect(() => save('orbit:follows', [...follows]), [follows])
  useEffect(() => save('orbit:follow-creators', [...creators]), [creators])
  useEffect(() => { document.querySelector('.viewport')?.scrollTo?.(0, 0) }, [route.view, route.curve, route.addr])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName)) { e.preventDefault(); document.getElementById('q')?.focus() } if (e.key === 'Escape') setLangOpen(false) }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [])
  useEffect(() => { if (!walletOpen) return; const f = (e: MouseEvent) => { if (!walletRef.current?.contains(e.target as Node)) setWalletOpen(false) }; addEventListener('mousedown', f); return () => removeEventListener('mousedown', f) }, [walletOpen])
  useEffect(() => { if (!langOpen) return; const f = (e: MouseEvent) => { if (!langRef.current?.contains(e.target as Node)) setLangOpen(false) }; addEventListener('mousedown', f); return () => removeEventListener('mousedown', f) }, [langOpen])
  useEffect(() => { if (!autoNotice) return; const id = setTimeout(dismissNotice, 7000); return () => clearTimeout(id) }, [autoNotice, dismissNotice])

  const go = (h: string) => navigate(h)
  const openToken = useCallback((curve: string) => go('/token/' + curve), [])
  const toggleCreator = (a: string) => setCreators((s) => { const n = new Set(s); if (n.has(a)) n.delete(a); else n.add(a); return n })
  const toggleFollow = (c: string) => setFollows((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n })

  const nav = (v: View, label: string, icon: Concept, hash: string, badge?: string) => (
    <button className="nav" aria-current={route.view === v || (v === 'home' && route.view === 'token')} onClick={() => go(hash)} aria-label={label}>
      <GIcon name={icon} size={18} plain /><span className="lbl">{label}</span>{badge && <span className="cnt">{badge}</span>}
    </button>
  )
  const cur = LANGS.find((l) => l.code === lang)!

  const writeCreator = (creator: Hex, symbol: string, curve: string) => { setDraft({ creator, symbol, curve }); go('/mail') }
  if (phone) {
    // phone browsers and home-screen apps have no wallet inside: any Connect button opens the sheet that hands off to a wallet app
    const phoneWallet = wallet.available ? wallet : { ...wallet, connect: async () => { dispatchEvent(new Event('orbit:connect')) } }
    const mv: MView = route.view === 'home' || route.view === 'live' || route.view === 'token' || route.view === 'me' || route.view === 'alerts' ? route.view : route.view === 'wallet' ? 'wallet' : route.view === 'ranking' && !route.full ? 'ranking' : 'other'
    const other = <>
      {route.view === 'creator' && route.addr && <CreatorPage key={route.addr} live={live} addr={route.addr} openToken={openToken} following={creators.has(route.addr)} toggleFollow={() => toggleCreator(route.addr!)} write={(creator: Hex) => { setDraft({ creator, symbol: '', curve: '' }); go('/mail') }} />}
      {route.view === 'ranking' && route.full && <Ranking live={live} />}
      {route.view === 'docs' && <Suspense fallback={null}><DocsPage /></Suspense>}
    </>
    return <MobileApp live={live} view={mv} curve={route.curve} go={go} openToken={openToken} wallet={phoneWallet} follows={follows} toggleFollow={toggleFollow} writeCreator={writeCreator} addr={route.addr} alerts={alerts} creators={creators} mailUnread={mailWatch.unread}
      other={route.view === 'mail' ? null : other} showMail={route.view === 'mail'} mail={mailSeen ? <Suspense fallback={null}><MobileMail draft={draft} wallet={phoneWallet} blockTime={live.blockTime} /></Suspense> : null} />
  }

  return (
    <div className="app">

      <section className="main">
        <div className="topbar">
          <a className="logo" href="/" onClick={(e) => { e.preventDefault(); go('/') }} aria-label="Orbit"><OrbitMark size={28} /><span className="word">orbit</span></a>
          <label className="search"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="7" r="5" /><path d="M14 14l-3.2-3.2" /></svg>
            <input id="q" value={query} onChange={(e) => { setQuery(e.target.value); if (route.view !== 'home') go('/') }} placeholder={t('Search token, $ticker or 0x…')} aria-label={t('Search')} /><span className="kbd">/</span></label>
          {ORBIT_TOKEN && <a className="buy-orbit" href={orbitBuyUrl()} target="_blank" rel="noreferrer" title={t('Buy the official Orbit coin on pons')}><Verified size={15} coin />{t('Buy ${s}', { s: ORBIT_SYMBOL })}</a>}
          <div className="ticks">
            <div className="tick eth-tick" title="ETH"><EthLogo size={20} /><div><b>{live.eth ? '$' + live.eth.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}</b></div></div>
          </div>
          <div className="lang" ref={langRef}>
            <button className="langbtn" onClick={() => setLangOpen((v) => !v)} aria-haspopup="menu" aria-expanded={langOpen}>
              <GIcon name="globe" size={16} plain />{cur.name}{pref === 'auto' && <span className="tag" style={{ height: 18 }}>auto</span>}
            </button>
            {langOpen && <div className="menu" role="menu">
              <button role="menuitemradio" aria-checked={pref === 'auto'} onClick={() => { setPref('auto'); setLangOpen(false) }}>{t('Automatic (device)')}{pref === 'auto' && ' ✓'}</button>
              <small>{t('Detected from your browser. Pick one to override it.')}</small>
              <div className="sep" />
              {LANGS.map((l) => <button key={l.code} role="menuitemradio" aria-checked={pref === l.code} onClick={() => { setPref(l.code); setLangOpen(false) }}><span className="code">{l.short}</span>{l.name}{pref === l.code && ' ✓'}</button>)}
            </div>}
          </div>
          <div className="lang wmenu" ref={walletRef}>
            <button className={'wbtn' + (wallet.address ? ' on' : '')} onClick={wallet.address ? () => setWalletOpen((v) => !v) : wallet.connect} disabled={wallet.connecting} title={wallet.error ? t(wallet.error) : wallet.address ? t('Your wallet') : t('Connect wallet')} aria-haspopup={wallet.address ? 'menu' : undefined} aria-expanded={wallet.address ? walletOpen : undefined}>
              <i className={'dot' + (wallet.address && !wallet.chainOk ? ' warn' : '')} />{wallet.connecting ? t('Connecting…') : wallet.address ? (wallet.chainOk ? short(wallet.address) : t('Switch network')) : t('Connect wallet')}
            </button>
            {walletOpen && wallet.address && <div className="menu" role="menu">
              <small className="mono">{wallet.address}</small>
              {!wallet.chainOk && <button role="menuitem" onClick={() => { wallet.switchChain(); setWalletOpen(false) }}>{t('Switch to Robinhood Chain')}</button>}
              <button role="menuitem" onClick={() => { setWalletOpen(false); setAvatarOpen(true) }}>{t('Change avatar')}</button>
              <button role="menuitem" onClick={() => { setWalletOpen(false); go('/portfolio') }}>{t('My portfolio')}</button>
              <button role="menuitem" onClick={() => { setWalletOpen(false); go('/mail') }}>{t('Mail')}</button>
              <button role="menuitem" onClick={() => { try { navigator.clipboard?.writeText(wallet.address!) } catch { /* ignore */ } setWalletOpen(false) }}>{t('Copy address')}</button>
              <div className="sep" />
              <button role="menuitem" className="danger" onClick={() => { wallet.disconnect(); setWalletOpen(false) }}>{t('Disconnect')}</button>
            </div>}
          </div>
        </div>
        <nav className="navbar" aria-label={t('Navigation')}>
          {nav('home', t('Radar'), 'radar', '/')}
          {nav('mail', t('Mail'), 'mail', '/mail', mailWatch.unread ? String(Math.min(99, mailWatch.unread)) : undefined)}
          {nav('ranking', t('Leaderboard'), 'trophy', '/leaderboard')}
          {nav('wallet', t('Portfolio'), 'wallet', '/portfolio')}
          {nav('alerts', t('Alerts'), 'alerts', '/alerts', alerts.history.length ? String(Math.min(99, alerts.history.length)) : undefined)}
          {nav('docs', t('Docs'), 'new', '/docs')}
          <span className="sp" />
          <div className="watchbar" aria-label={t('Watchlist')}>
            <span className="wl-lbl">★ {t('Watchlist')}</span>
            {!follows.size && <span className="hint">{t('Follow tokens from their page.')}</span>}
            {[...follows].map((c) => { const l = live.byCurve.get(c); if (!l) return null; const m = live.meta[l.token.toLowerCase()]; const ch = changeOf(live, c); return (
              <button key={c} className="watch" onClick={() => openToken(c)} title={m?.name}><TokenImg src={m?.logo} seed={l.token} label={m?.symbol} className="r18" /><span>{m?.symbol || '…'}</span><span className={'mono ' + (ch >= 0 ? 'up' : 'dn')}>{live.stats[c] ? pct(ch) : ''}</span></button>) })}
          </div>
          {X_URL && <a className="xlink" href={X_URL} target="_blank" rel="noreferrer" title={t('Follow Orbit on X')} aria-label={t('Follow Orbit on X')}><XIcon size={15} /><span className="lbl">{X_HANDLE}</span></a>}
        </nav>
        {live.error && <div className="banner">{t('Could not read Robinhood Chain:')} {live.error}</div>}
        <div className="viewport">
          {(route.view === 'home' || route.view === 'live') && <Home live={live} style={style} query={query} follows={follows} openToken={openToken} />}
          {route.view === 'token' && route.curve && <TokenPage key={route.curve} live={live} alerts={alerts} curve={route.curve} back={() => go('/')} following={follows.has(route.curve)} toggleFollow={() => toggleFollow(route.curve!)} writeCreator={(creator: Hex, symbol: string, curve: string) => { setDraft({ creator, symbol, curve }); go('/mail') }} />}
          {route.view === 'creator' && route.addr && <CreatorPage key={route.addr} live={live} addr={route.addr} openToken={openToken} following={creators.has(route.addr)} toggleFollow={() => toggleCreator(route.addr!)} write={(creator: Hex) => { setDraft({ creator, symbol: '', curve: '' }); go('/mail') }} />}
          {(route.view === 'wallet' || route.view === 'me') && <WalletPage key={route.addr ?? 'me'} live={live} addr={route.addr ?? null} me={wallet.address} connect={wallet.connect} />}
          {route.view === 'ranking' && <Ranking live={live} />}
          {route.view === 'docs' && <Suspense fallback={null}><DocsPage /></Suspense>}
          {route.view === 'alerts' && <AlertsPage live={live} alerts={alerts} follows={follows} creators={creators} wallet={wallet} />}
          <div style={{ display: route.view === 'mail' ? 'contents' : 'none' }}>{mailSeen && <Suspense fallback={null}><Mail draft={draft} wallet={wallet} /></Suspense>}</div>
        </div>
      </section>
      {avatarOpen && wallet.address && <AvatarDialog address={wallet.address} wallet={wallet} close={() => setAvatarOpen(false)} />}
      {autoNotice && <div className="toast lang-toast" role="status"><GIcon name="globe" size={16} plain />{t('Language set to {lang} from your device.', { lang: cur.name })}<button onClick={dismissNotice} aria-label="OK">✕</button></div>}
    </div>
  )
}
