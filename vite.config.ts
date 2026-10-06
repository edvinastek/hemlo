import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { flattenLinks } from './src/lib/tz-links-rules'

/** Writes the built filenames into the service worker, so the whole app is in
 *  the cache after the first load rather than after the second. */
function precacheServiceWorker(): Plugin {
  return {
    name: 'hemlo-precache-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = [base, base + 'index.html', base + 'manifest.webmanifest', base + 'favicon.svg']
      for (const file of Object.keys(bundle)) {
        if (file === 'sw.js' || file.endsWith('.map')) continue
        assets.push(base + file)
      }
      const source = readFileSync('public/sw.js', 'utf8')
        .replace('self.__HEMLO_ASSETS__ ||', `${JSON.stringify(assets)} ||`)
        .replace(/'\/index\.html'/g, JSON.stringify(base + 'index.html'))
      // Emitted last so it replaces the copy taken from public/.
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

/** The public holidays library (loaded only once a country is chosen) works
 *  out holiday times with moment-timezone, which carries every time zone's
 *  history back to the 1800s: about 700 kB. The calendar only reaches a few
 *  years back, so the build keeps the zones from 2000 on (about 110 kB).
 *  Only the build: in development the full data is used, with the same
 *  results. */
function trimTimeZones(): Plugin {
  const id = '\0hemlo-moment-timezone'
  return {
    name: 'hemlo-trim-time-zones',
    apply: 'build',
    enforce: 'pre',
    resolveId(source) {
      return source === 'moment-timezone' ? id : null
    },
    load(key) {
      if (key !== id) return null
      const require = createRequire(import.meta.url)
      const moment = require('moment-timezone')
      require('moment-timezone/moment-timezone-utils')
      const latest = require('moment-timezone/data/packed/latest.json')
      const data = moment.tz.filterLinkPack(
        { version: latest.version, zones: latest.zones.map((z: string) => moment.tz.unpack(z)), links: latest.links },
        2000, 2100)
      // A trimmed link can point at another link; moment-timezone follows one step only.
      data.links = flattenLinks(data.zones, data.links)
      data.countries = latest.countries
      // The library's code without its bundled data, then the trimmed data.
      return `import moment from 'moment-timezone/moment-timezone.js'\n` +
        `moment.tz.load(${JSON.stringify(data)})\nexport default moment\n`
    },
  }
}

/* A GitHub Pages project site is served from /<repository>/, not /. Everything that
 * hard-codes a path — the service worker's precache list, its scope, the
 * router — reads this instead of assuming the root. */
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react(), precacheServiceWorker(), trimTimeZones()],
  server: { host: true, port: 5173 },
  build: { outDir: 'dist' },
  publicDir: 'public',
})
