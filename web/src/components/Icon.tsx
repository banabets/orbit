import { GI_BODY, GI_UI, GI_ANIMAL } from '../lib/gameIcons'
import { pseudonymParts } from '../lib/names'
import { hue } from '../lib/format'
import { isOfficial } from '../lib/official'
import { useAvatarChoice, AVATAR_HUES } from '../lib/avatars'
import { Verified } from './Verified'

export type Concept = keyof typeof GI_UI

/** Accent per concept; `plain` keeps the surrounding text color (menus, buttons). */
const TINT: Partial<Record<Concept, string>> = {
  launch: '#60A5FA', trades: '#34D399', graduated: '#C084FC', whale: '#FBBF24', dolphin: '#7DD3FC', hot: '#FB923C',
  rewards: '#FBBF24', crown: '#FBBF24', alerts: '#F87171', trophy: '#FBBF24', medal: '#FBBF24', new: '#F472B6', coins: '#FBBF24', race: '#E5E5E5',
}

/** Game Icons glyph (game-icons.net, CC BY 3.0). */
export function GIcon({ name, size = 18, color, plain, title, className }: { name: Concept; size?: number; color?: string; plain?: boolean; title?: string; className?: string }) {
  const body = GI_BODY[GI_UI[name]]
  return (
    <svg className={'gi ' + (className ?? '')} width={size} height={size} viewBox="0 0 512 512" style={{ color: plain ? 'currentColor' : color ?? TINT[name] ?? 'currentColor' }}
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} dangerouslySetInnerHTML={{ __html: body }} />
  )
}

/** Every wallet gets the animal from its pons pseudonym, on a tint from the color word. */
export function Avatar({ address, size = 24, src }: { address: string; size?: number; src?: string | null }) {
  const face = <AvatarFace address={address} size={size} src={src} />
  if (!isOfficial(address)) return face
  return <span className="avt-wrap" style={{ width: size, height: size }}>{face}<Verified size={Math.max(11, Math.round(size * 0.46))} /></span>
}

function AvatarFace({ address, size, src }: { address: string; size: number; src?: string | null }) {
  // the avatar the wallet chose from the Orbit collection, if any; otherwise its automatic animal
  const pick = useAvatarChoice(src ? null : address)
  if (src) return <img className="avt" src={src} width={size} height={size} alt="" />
  const [, color, auto] = pseudonymParts(address)
  const noun = pick?.n ?? auto
  const h = pick ? AVATAR_HUES[pick.c] ?? 150 : hue(color)
  const body = GI_BODY[GI_ANIMAL[noun] ?? 'sparrow']
  return (
    <span className="avt" style={{ width: size, height: size, background: `radial-gradient(circle at 32% 26%, hsl(${h} 40% 34%), hsl(${h} 32% 14%))` }} aria-hidden="true">
      <svg width={Math.round(size * 0.64)} height={Math.round(size * 0.64)} viewBox="0 0 512 512" style={{ color: `hsl(${h} 70% 82%)` }} dangerouslySetInnerHTML={{ __html: body }} />
    </span>
  )
}
