/** A short, soft two-note chime made with Web Audio (no sound files). Browsers only play it after the user
 *  has tapped or clicked the page at least once; before that it stays silent. */
let ctx: AudioContext | null = null
export function playChime() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    const t0 = ctx.currentTime
    for (const [i, f] of [880, 1318.5].entries()) {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = f
      const s = t0 + i * 0.12
      g.gain.setValueAtTime(0, s)
      g.gain.linearRampToValueAtTime(0.12, s + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.35)
      o.connect(g).connect(ctx.destination)
      o.start(s); o.stop(s + 0.4)
    }
  } catch { /* audio unavailable */ }
}
