import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
// Fonts ship inside the app. Loading them from Google's servers would send
// every user's IP address to Google, and would fail offline.
import '@fontsource/spectral/latin-400.css'
import '@fontsource/spectral/latin-500.css'
import '@fontsource/spectral/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import './styles/tokens.css'
import './styles/app.css'
// A phone on its side and wide screens (src/ui/useLayout.ts); after app.css.
import './styles/landscape.css'

// Without this the data is local but the page is not, and a cold start with no
// connection shows nothing. Registered after paint so it never delays the app.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL }).catch(() => { /* fine without it */ })
  })
}

// Light, dark or black, the theme and the text size are src/lib/looks.ts's
// (started in App); index.html paints the last ones, or the phone's light or
// dark, before the app loads.

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
