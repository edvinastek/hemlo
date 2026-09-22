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
      const assets = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg']
      for (const file of Object.keys(bundle)) {
        if (file === 'sw.js' || file.endsWith('.map')) continue
        assets.push('/' + file)
      }
      const source = readFileSync('public/sw.js', 'utf8')
        .replace('self.__GETIT_ASSETS__ ||', `${JSON.stringify(assets)} ||`)
      // Emitted last so it replaces the copy taken from public/.
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), precacheServiceWorker()],
  server: { host: true, port: 5173 },
  build: { outDir: 'dist' },
  publicDir: 'public',
})
