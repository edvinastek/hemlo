import '@fontsource/spectral/latin-400.css'
import '@fontsource/spectral/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '../src/styles/tokens.css'
import './site.css'

const dark = window.matchMedia('(prefers-color-scheme: dark)')
const theme = () => { document.documentElement.dataset.theme = dark.matches ? 'dark' : 'light' }
theme(); dark.addEventListener('change', theme)

export const nav = `<nav><a href="./">Hemlo</a><a href="./privacy.html">Privacy</a><a href="./delete.html">Delete your account</a></nav>`

export function el(html: string) {
  document.getElementById('page')!.innerHTML = html
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
