import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

// pons' public API (profile names, prices) sends no CORS headers, so this server forwards it same-origin.
// A request cut halfway (page reload, phone going to sleep) must not crash the server: answer 502 and carry on.
const ponsApi: ProxyOptions = {
  target: 'https://ponsfamily.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/pons-api/, '/api'),
  configure: (proxy) => proxy.on('error', (_err, _req, res) => {
    try { if ('writeHead' in res && !res.headersSent) res.writeHead(502); res.end() } catch { /* socket already gone */ }
  }),
}

// pons' claim status (the same rewrite as /pons-claimed in vercel.json)
const ponsClaimed: ProxyOptions = { target: 'https://balancesapi.ponsfamily.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/pons-claimed/, '/v1/escrow/claimed') }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // reachable from other devices on the same Wi-Fi (phone): http://<this PC's IP>:5173
    host: true,
    proxy: {
      // pons' public API (profile names) sends no CORS headers, so the dev server forwards it same-origin.
      // In production put the same rewrite on the host (e.g. a Vercel/Netlify rewrite or a tiny worker).
      '/pons-api': ponsApi,
      '/pons-claimed': ponsClaimed,
    },
  },
  // `vite preview` serves the optimized build (what phones should use): same port and the same /pons-api proxy
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
    // always revalidate, so phones never keep an old copy of the app (built files are hashed, so this is cheap)
    headers: { 'Cache-Control': 'no-cache' },
    proxy: {
      '/pons-api': ponsApi,
      '/pons-claimed': ponsClaimed,
    },
  },
})
