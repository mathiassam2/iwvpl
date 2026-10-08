import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initTheme } from './lib/theme'
import '@/styles/index.css'

// Resolve the theme before the first paint so there is no flash of the wrong mode.
initTheme()

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)