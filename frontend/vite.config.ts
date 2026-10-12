import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import type { ProxyOptions } from 'vite'

// The API is proxied through the frontend server, so the browser only ever talks to one origin:
// phones on the LAN keep working when the laptop's IP changes, and the session cookie is first-party.
// Point it elsewhere with API_PROXY_TARGET.
//
// The backend's CSRF guard checks Origin against its CORS allowlist. A genuinely same-origin request
// (Origin host === Host header, i.e. the page was served by this server under whatever IP/hostname)
// is forwarded with this server's canonical origin so a changing LAN IP needs no backend config.
// Cross-site requests keep their real Origin and are still rejected by the backend.
const CANONICAL_ORIGIN = process.env.API_PROXY_ORIGIN ?? 'http://localhost:5174'

const apiProxy: Record<string, ProxyOptions> = {
  '/api': {
    target: process.env.API_PROXY_TARGET ?? 'http://localhost:9000',
    changeOrigin: false,
    // Pass the real client IP on (X-Forwarded-For); the backend trusts it only from loopback,
    // so per-user login lockout and rate limiting keep working behind this proxy.
    xfwd: true,
    configure: proxy => {
      proxy.on('proxyReq', (proxyReq, req) => {
        const origin = req.headers.origin
        if (!origin) return
        try {
          if (new URL(origin).host === req.headers.host) proxyReq.setHeader('origin', CANONICAL_ORIGIN)
        } catch {
          // malformed Origin: forward unchanged, the backend rejects it
        }
      })
    },
  },
}
// Factory/artisan portal API (backend /portal/v1/*) - same backend, same proxy rules.
apiProxy['/portal'] = { ...apiProxy['/api'] }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,   // listen on 0.0.0.0 so mobile devices on the same network can connect
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    host: true,
    proxy: apiProxy,
    // Always revalidate, so phones pick up a new build on the next refresh instead of a stale page.
    headers: { 'Cache-Control': 'no-cache' },
  },
})
