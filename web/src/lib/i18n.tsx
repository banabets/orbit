import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ZH, ES } from './i18n.dict'

/* English is the source language: every key is the English text itself, so a missing translation still reads well. */
export type Lang = 'en' | 'zh' | 'es'
export type LangPref = Lang | 'auto'
export const LANGS: { code: Lang; name: string; short: string }[] = [
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'zh', name: '中文', short: '中' },
  { code: 'es', name: 'Español', short: 'ES' },
]
const DICT: Record<Exclude<Lang, 'en'>, Record<string, string>> = { zh: ZH, es: ES }
const LOCALE: Record<Lang, string> = { en: 'en-US', zh: 'zh-CN', es: 'es-ES' }

/** First supported language in the device / browser preference list; English otherwise. */
export function detectLang(): Lang {
  const list = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []
  for (const l of list) { const c = String(l || '').toLowerCase().slice(0, 2); if (c === 'zh' || c === 'es' || c === 'en') return c }
  return 'en'
}

type Ctx = { lang: Lang; pref: LangPref; setPref: (p: LangPref) => void; t: (en: string, vars?: Record<string, string | number>) => string; locale: string; autoNotice: boolean; dismissNotice: () => void }
const I18n = createContext<Ctx | null>(null)
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* ignore */ } }

export function I18nProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<LangPref>(() => (read('orbit:lang') as LangPref) || 'en')
  const [detected, setDetected] = useState<Lang>(detectLang)
  const [autoNotice, setAutoNotice] = useState(false)
  const lang: Lang = pref === 'auto' ? detected : pref
  // the OS / browser language can change while the tab is open
  useEffect(() => { const on = () => setDetected(detectLang()); addEventListener('languagechange', on); return () => removeEventListener('languagechange', on) }, [])
  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang }, [lang])
  const setPref = useCallback((p: LangPref) => { setPrefState(p); write('orbit:lang', p); setAutoNotice(false); write('orbit:lang-told', '1') }, [])
  const dismissNotice = useCallback(() => { setAutoNotice(false); write('orbit:lang-told', '1') }, [])
  const t = useCallback((en: string, vars?: Record<string, string | number>) => {
    let s = lang === 'en' ? en : DICT[lang][en] ?? en
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(String(v))
    return s
  }, [lang])
  const value = useMemo(() => ({ lang, pref, setPref, t, locale: LOCALE[lang], autoNotice, dismissNotice }), [lang, pref, setPref, t, autoNotice, dismissNotice])
  return <I18n.Provider value={value}>{children}</I18n.Provider>
}
export function useT() {
  const c = useContext(I18n)
  if (!c) throw new Error('useT outside I18nProvider')
  return c
}
