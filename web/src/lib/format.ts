const SUB = '₀₁₂₃₄₅₆₇₈₉'

export const usd = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(n < 10 ? 2 : 0)}`

/** pons-style compressed zeros: $0.0₅62 */
export function px(p: number): string {
  if (!isFinite(p) || p <= 0) return '$0'
  if (p >= 0.01) return '$' + p.toFixed(4)
  const s = p.toExponential(3)
  const e = -parseInt(s.split('e')[1]) - 1
  const d = s.split('e')[0].replace('.', '').slice(0, 3)
  return `$0.0${String(e).split('').map((x) => SUB[+x]).join('')}${d}`
}
export const pct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
export const agoMs = (ms: number) => {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`
}
export const ageMin = (m: number) => (m < 60 ? `${Math.max(1, Math.round(m))} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`)
export const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4)
export function hue(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h }
export const gradient = (s: string) => `linear-gradient(135deg,hsl(${hue(s)} 70% 58%),hsl(${(hue(s) + 60) % 360} 70% 38%))`
