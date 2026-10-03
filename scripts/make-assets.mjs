// Draws every icon and store graphic from one mark, so they cannot drift apart.
// Run: node scripts/make-assets.mjs, then npx capacitor-assets generate --android
//
// The launcher icons the person can choose (Settings → Looks, LOOK-10) are
// Android vector drawables, drawn from the same shapes and colours the Looks
// panel shows (src/lib/theme-rules.ts). They are tiny, sharp at every size and
// carry a monochrome layer for Android 13's themed icons (LOOK-11):
//   node --experimental-strip-types scripts/make-assets.mjs icons
import sharp from 'sharp'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

if (process.argv.includes('icons')) {
  await launcherIcons()
  process.exit(0)
}

async function launcherIcons() {
  const { ICONS, iconShapes } = await import('../src/lib/theme-rules.ts')
  const res = 'android/app/src/main/res'
  for (const d of ['drawable', 'mipmap-anydpi', 'mipmap-anydpi-v26', 'values']) mkdirSync(`${res}/${d}`, { recursive: true })
  const head = '<?xml version="1.0" encoding="utf-8"?>\n<!-- Drawn by scripts/make-assets.mjs icons; do not edit by hand. -->\n'
  const n = (v) => Number(v.toFixed(3)).toString()
  // A rounded rectangle as path data; a pill when the radius is half its short side.
  const rect = ({ x, y, w, h, r }) =>
    `M${n(x + r)},${n(y)}h${n(w - 2 * r)}a${n(r)},${n(r)} 0,0 1,${n(r)},${n(r)}v${n(h - 2 * r)}a${n(r)},${n(r)} 0,0 1,${n(-r)},${n(r)}` +
    `h${n(-(w - 2 * r))}a${n(r)},${n(r)} 0,0 1,${n(-r)},${n(-r)}v${n(-(h - 2 * r))}a${n(r)},${n(r)} 0,0 1,${n(r)},${n(-r)}z`
  const paths = (kind, fill, alpha = () => 1) => iconShapes(kind).map((s) => {
    const p = `<path android:fillColor="${fill(s)}" android:fillAlpha="${alpha(s)}" android:pathData="${rect(s)}" />`
    return s.rot ? `    <group android:rotation="${s.rot}" android:pivotX="${s.ox}" android:pivotY="${s.oy}">\n        ${p}\n    </group>` : `    ${p}`
  }).join('\n')
  const vector = (body, before = '') =>
    `${head}<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">\n${before}${body}\n</vector>\n`

  // One monochrome layer per drawing: the system tints it, keeping only its
  // alpha, so the rail is drawn fainter than the rows as on the design page.
  for (const kind of ['rows', 'tick', 'week']) {
    writeFileSync(`${res}/drawable/ic_icon_mono_${kind}.xml`,
      vector(paths(kind, () => '#FF000000', (s) => (s.colour === 'rail' ? 0.45 : 1))))
  }
  const colours = []
  for (const icon of ICONS) {
    const c = { rail: icon.rail, ink: icon.ink, dot: icon.dot }
    writeFileSync(`${res}/drawable/ic_icon_${icon.key}_fg.xml`, vector(paths(icon.kind, (s) => c[s.colour])))
    colours.push(`    <color name="ic_icon_${icon.key}_bg">${icon.bg.toUpperCase()}</color>`)
    // Android 8 and later: the adaptive icon, masked to the phone's shape.
    writeFileSync(`${res}/mipmap-anydpi-v26/ic_icon_${icon.key}.xml`, `${head}<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_icon_${icon.key}_bg" />
    <foreground android:drawable="@drawable/ic_icon_${icon.key}_fg" />
    <monochrome android:drawable="@drawable/ic_icon_mono_${icon.kind}" />
</adaptive-icon>
`)
    // Android 7: a plain round icon.
    writeFileSync(`${res}/mipmap-anydpi/ic_icon_${icon.key}.xml`,
      vector(paths(icon.kind, (s) => c[s.colour]), `    <path android:fillColor="${icon.bg}" android:pathData="M54,0a54,54 0,1 1,0 108a54,54 0,1 1,0 -108z" />\n`))
  }
  writeFileSync(`${res}/values/icons.xml`, `${head}<resources>\n${colours.join('\n')}\n</resources>\n`)
  // The app's own icon (app info, recent apps) is Classic, drawn the same
  // way. capacitor-assets rewrites these two files, so run this step after it.
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    writeFileSync(`${res}/mipmap-anydpi-v26/${name}.xml`, `${head}<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_icon_classic_bg" />
    <foreground android:drawable="@drawable/ic_icon_classic_fg" />
    <monochrome android:drawable="@drawable/ic_icon_mono_rows" />
</adaptive-icon>
`)
  }
  console.log(`${ICONS.length} launcher icons written`)
}

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
