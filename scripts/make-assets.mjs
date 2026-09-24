// Draws every icon and store graphic from one mark, so they cannot drift apart.
// Run: node scripts/make-assets.mjs, then npx capacitor-assets generate --android
import sharp from 'sharp'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const PAPER = '#f8f4ed', PAPER_DARK = '#15141b', RAIL = '#cfc6b3', INK = '#201e1b', ACCENT = '#b4442a'
const mark = readFileSync('assets/mark.svg', 'utf8')

// The day's rows and the rail, positioned around a centre, at any scale.
const glyph = (s, ink = INK, rail = RAIL, accent = ACCENT) => `
  <line x1="${-150*s}" y1="${-250*s}" x2="${-150*s}" y2="${250*s}" stroke="${rail}" stroke-width="${22*s}" stroke-linecap="round"/>
  <line x1="${-60*s}" y1="${-120*s}" x2="${230*s}" y2="${-120*s}" stroke="${ink}" stroke-width="${44*s}" stroke-linecap="round"/>
  <line x1="${-60*s}" y1="0" x2="${150*s}" y2="0" stroke="${ink}" stroke-width="${44*s}" stroke-linecap="round"/>
  <line x1="${-60*s}" y1="${120*s}" x2="${230*s}" y2="${120*s}" stroke="${ink}" stroke-width="${44*s}" stroke-linecap="round"/>
  <circle cx="${-150*s}" cy="0" r="${58*s}" fill="${accent}"/>`

const svg = (w, h, body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${body}</svg>`
const png = (s, file) => sharp(Buffer.from(s)).png().toFile(file)

mkdirSync('assets', { recursive: true }); mkdirSync('store', { recursive: true })

// Launcher: full icon, and the adaptive icon's two layers. Android crops the
// foreground to a circle or squircle, so the mark sits inside the central 66%.
await png(mark, 'assets/icon-only.png')
await png(svg(1024, 1024, `<g transform="translate(512 512)">${glyph(0.72)}</g>`), 'assets/icon-foreground.png')
await png(svg(1024, 1024, '', PAPER), 'assets/icon-background.png')

// Splash: small mark on the page colour, light and dark.
await png(svg(2732, 2732, `<g transform="translate(1366 1366)">${glyph(0.9)}</g>`, PAPER), 'assets/splash.png')
await png(svg(2732, 2732, `<g transform="translate(1366 1366)">${glyph(0.9, '#f0eae0', '#3a3842', '#d9674a')}</g>`, PAPER_DARK), 'assets/splash-dark.png')

// Notification icon: Android draws it as a white silhouette on the status bar.
const densities = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 }
for (const [d, px] of Object.entries(densities)) {
  const dir = `android/app/src/main/res/drawable-${d}`
  mkdirSync(dir, { recursive: true })
  const s = px / 700
  await png(svg(px, px, `<g transform="translate(${px/2} ${px/2})">${glyph(s, '#fff', '#fff', '#fff')}</g>`), `${dir}/ic_stat_getit.png`)
}

// Play Store: a 512 x 512 icon, and the 1024 x 500 feature graphic.
await sharp(Buffer.from(mark)).resize(512, 512).png().toFile('store/icon-512.png')
const feature = svg(1024, 500, `
  <g transform="translate(250 250)">${glyph(0.62)}</g>
  <text x="440" y="235" font-family="Georgia, 'Iowan Old Style', serif" font-size="96" font-weight="600" fill="${INK}">GetIt</text>
  <text x="444" y="300" font-family="'Helvetica Neue', Arial, sans-serif" font-size="30" fill="#6c665b">Plan the day, the meals and the shop.</text>
  <text x="444" y="342" font-family="'Helvetica Neue', Arial, sans-serif" font-size="30" fill="#6c665b">Works offline.</text>`, PAPER)
await png(feature, 'store/feature-graphic.png')

writeFileSync('store/.generated', new Date().toISOString())
console.log('assets written')
