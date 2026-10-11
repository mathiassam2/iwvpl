import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initTheme } from './lib/theme'
import '@/styles/index.css'

// Resolve the theme before the first paint so there is no flash of the wrong mode.
initTheme()

// Take scroll restoration off the browser.
//
// Left on 'auto' (the default), refreshing anywhere down the page restores
// that exact offset, so a reload looked like the site had scrolled itself
// down on its own. 'manual' means the browser never restores, and the app
// decides instead - see ScrollToTop in App.tsx, which also handles
// in-app route changes. Set here rather than in an effect so it is in place
// before the first navigation or restore can happen.
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

// Belt and braces for a reload that lands mid-page via the browser's own
// restore before React has mounted: without this the old offset is still on
// screen for a frame. Harmless when we are already at the top.
if (window.scrollY !== 0) {
  window.scrollTo(0, 0)
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)