// The app used to be called Nexus and saved everything under "nexus:" keys. Copy them to "orbit:" once, so
// follows, alerts, language, the remembered wallet and other settings survive the rename.
try {
  if (!localStorage.getItem('orbit:migrated')) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith('nexus:')) continue
      const nk = 'orbit:' + k.slice(6)
      const v = localStorage.getItem(k)
      if (v !== null && localStorage.getItem(nk) === null) localStorage.setItem(nk, v)
    }
    localStorage.setItem('orbit:migrated', '1')
  }
} catch { /* private mode or storage blocked: nothing to carry over */ }
export {}
