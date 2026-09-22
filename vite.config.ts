import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Writes the built filenames into the service worker, so the whole app is in
 *  the cache after the first load rather than after the second. */
function precacheServiceWorker(): Plugin {
  return {
    name: 'getit-precache-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = [base, base + 'index.html', base + 'manifest.webmanifest', base + 'favicon.svg']
      for (const file of Object.keys(bundle)) {
        if (file === 'sw.js' || file.endsWith('.map')) continue
        assets.push(base + file)
      }
      const source = readFileSync('public/sw.js', 'utf8')
        .replace('self.__GETIT_ASSETS__ ||', `${JSON.stringify(assets)} ||`)
        .replace(/'\/index\.html'/g, JSON.stringify(base + 'index.html'))
      // Emitted last so it replaces the copy taken from public/.
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

/* A GitHub Pages project site is served from /GetIt/, not /. Everything that
 * hard-codes a path — the service worker's precache list, its scope, the
 * router — reads this instead of assuming the root. */
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react(), precacheServiceWorker()],
  server: { host: true, port: 5173 },
  build: { outDir: 'dist' },
  publicDir: 'public',
})
